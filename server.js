'use strict';
const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),crypto=require('crypto'),path=require('path'),fs=require('fs'),multer=require('multer'),Database=require('better-sqlite3'),cookieParser=require('cookie-parser');
const {JWT_SECRET,ENC_KEY,ADMIN_EMAIL,ADMIN_PASSWORD,WEBHOOK_SECRET,NODE_ENV}=process.env;
// A02/A05: refuse to boot without strong secrets
if(!JWT_SECRET||JWT_SECRET.length<32||!ENC_KEY||!/^[0-9a-f]{64}$/i.test(ENC_KEY)||!WEBHOOK_SECRET||WEBHOOK_SECRET.length<32){console.error('Set JWT_SECRET(32+), ENC_KEY(64 hex), WEBHOOK_SECRET(32+) - see .env.example');process.exit(1);}
class E extends Error{}
const db=new Database(process.env.DB_FILE||'store.db');db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','customer')));
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,title_en TEXT,title_ar TEXT,desc_en TEXT,desc_ar TEXT,tags TEXT,price INTEGER,compare INTEGER,cost INTEGER,images TEXT,sizes TEXT,colors TEXT,ali_url TEXT,supplier_id TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,ref TEXT UNIQUE,customer TEXT,items TEXT,total INTEGER,cost INTEGER,profit INTEGER,status TEXT,fulfillment TEXT DEFAULT 'none',payout TEXT DEFAULT 'none',supplier_payload TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);`);
// A02: AES-256-GCM encryption at rest for payout + API secrets
const key=Buffer.from(ENC_KEY,'hex');
const enc=o=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(JSON.stringify(o),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');};
const dec=s=>{const b=Buffer.from(s,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));};
const getS=k=>{const r=db.prepare('SELECT v FROM settings WHERE k=?').get(k);return r?dec(r.v):{};};
const setS=(k,o)=>db.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,enc(o));
const DUMMY=bcrypt.hashSync('x',12);
if(ADMIN_EMAIL&&ADMIN_PASSWORD&&ADMIN_PASSWORD.length>=12&&!db.prepare("SELECT 1 FROM users WHERE role='admin'").get())
 db.prepare('INSERT INTO users(email,hash,role) VALUES(?,?,?)').run(ADMIN_EMAIL.toLowerCase(),bcrypt.hashSync(ADMIN_PASSWORD,12),'admin');
const log=(ev,x={})=>console.log(JSON.stringify({t:new Date().toISOString(),ev,...x})); // A09
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"]}},hsts:NODE_ENV==='production'?{maxAge:31536000,includeSubDomains:true}:false}));
app.use(rateLimit({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false}));
// Payment webhook FIRST: raw body + HMAC signature (A08 integrity), no cookie/CSRF
app.post('/api/webhooks/payment',express.raw({type:'application/json',limit:'50kb'}),(req,res,next)=>{try{
 const sig=Buffer.from(String(req.get('x-signature')||''),'hex'),exp=crypto.createHmac('sha256',WEBHOOK_SECRET).update(req.body).digest();
 if(sig.length!==exp.length||!crypto.timingSafeEqual(sig,exp)){log('webhook_bad_sig',{ip:req.ip});return res.status(401).end();}
 const ev=JSON.parse(req.body.toString('utf8')),o=db.prepare('SELECT * FROM orders WHERE ref=?').get(String(ev.ref));
 if(!o||ev.status!=='paid'||Math.round(ev.amount*100)!==o.total)return res.status(400).json({error:'mismatch'}); // amount tamper check
 // idempotent: only first transition pending->paid runs the split
 if(db.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending_payment'").run(o.id).changes!==1)return res.json({ok:true,dup:true});
 const s=getS('automation'),items=JSON.parse(o.items),cu=JSON.parse(o.customer);
 const payload={sender_name:s.sender_name||'Mohammad Shareeda',
  notes:'Ship in plain packaging. Remove price tags, invoices and Chinese-language inserts.',
  shipping:cu,lines:items.map(i=>({ali_url:i.ali_url,supplier_id:i.supplier_id,qty:i.qty,size:i.size,color:i.color}))};
 // Profit = total - supplier cost. Payout to admin's bank is executed by the gateway (Stripe Connect / Tap payouts) using getS('payout'); here we queue it.
 db.prepare("UPDATE orders SET fulfillment='queued',payout='queued',supplier_payload=? WHERE id=?").run(JSON.stringify(payload),o.id);
 log('order_paid',{ref:o.ref,profit:o.profit});res.json({ok:true});}catch(e){next(e);}});
app.use(express.json({limit:'100kb'}));app.use(cookieParser());
// A01/CSRF: SameSite=Strict cookie + custom header + Origin check on state-changing calls
app.use('/api',(req,res,next)=>{if(['GET','HEAD'].includes(req.method))return next();
 const o=req.get('origin');if(req.get('x-requested-with')!=='fetch'||(o&&new URL(o).host!==req.get('host')))return res.status(403).json({error:'csrf'});next();});
const ck={httpOnly:true,sameSite:'strict',secure:NODE_ENV==='production',maxAge:30*60*1000,path:'/'};
const who=req=>{try{const p=jwt.verify(req.cookies.at,JWT_SECRET,{algorithms:['HS256'],issuer:'shop'});const u=db.prepare('SELECT id,role FROM users WHERE id=?').get(p.sub);return u&&u.role==='admin'?u:null;}catch{return null;}};
const admin=(req,res,next)=>{const u=who(req);if(!u)return res.status(401).json({error:'unauthorized'});req.user=u;next();};
const S=(v,m)=>{if(typeof v!=='string')throw new E('invalid');v=v.trim();if(!v||v.length>m)throw new E('invalid');return v;};
const money=x=>{const n=Math.round(Number(x)*100);if(!Number.isFinite(n)||n<0||n>1e8)throw new E('price');return n;};
const pub=r=>({id:r.id,title:{en:r.title_en,ar:r.title_ar},desc:{en:r.desc_en,ar:r.desc_ar},tags:JSON.parse(r.tags),price:r.price/100,compare:r.compare/100,images:JSON.parse(r.images),sizes:JSON.parse(r.sizes),colors:JSON.parse(r.colors)});
const full=r=>({...pub(r),title_en:r.title_en,title_ar:r.title_ar,desc_en:r.desc_en,desc_ar:r.desc_ar,cost:r.cost/100,ali_url:r.ali_url,supplier_id:r.supplier_id,active:!!r.active});
// ---- public storefront API (never exposes cost / AliExpress fields)
app.get('/api/products',(q,r)=>r.json(db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all().map(pub)));
app.get('/api/products/:id',(q,r)=>{const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+q.params.id|0);p?r.json(pub(p)):r.status(404).json({error:'not_found'});});
app.post('/api/orders',rateLimit({windowMs:600000,limit:20}),(req,res)=>{
 const b=req.body||{},c=b.customer||{};
 const cu={name:S(c.name,100),email:S(c.email,120),phone:S(c.phone,30),address:S(c.address,250),city:S(c.city,80),country:S(c.country,60),zip:String(c.zip||'').slice(0,20)};
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cu.email)||!/^[+\d\s()-]{6,30}$/.test(cu.phone))throw new E('invalid');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>30)throw new E('invalid');
 let total=0,cost=0;const items=b.items.map(i=>{ // price ALWAYS recomputed server-side (A04)
  const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+i.id|0),q=+i.qty|0;
  if(!p||q<1||q>20)throw new E('invalid');
  const sz=JSON.parse(p.sizes),co=JSON.parse(p.colors);
  if(sz.length&&!sz.includes(i.size))throw new E('size');if(co.length&&!co.some(x=>x.name===i.color))throw new E('color');
  total+=p.price*q;cost+=p.cost*q;
  return{id:p.id,title:p.title_en,qty:q,size:i.size||'',color:i.color||'',price:p.price,ali_url:p.ali_url,supplier_id:p.supplier_id};});
 const ref='ORD-'+crypto.randomBytes(5).toString('hex').toUpperCase();
 db.prepare("INSERT INTO orders(ref,customer,items,total,cost,profit,status,created) VALUES(?,?,?,?,?,?,'pending_payment',?)").run(ref,JSON.stringify(cu),JSON.stringify(items),total,cost,total-cost,Date.now());
 // Here: create gateway session (Stripe Checkout / Tap charge) with metadata.ref and return its URL.
 res.json({ref,total:total/100,payment:'pending'});});
// ---- admin auth
app.post('/api/admin/login',rateLimit({windowMs:900000,limit:5,skipSuccessfulRequests:true}),(req,res)=>{
 const em=String(req.body?.email||'').toLowerCase().slice(0,120),pw=String(req.body?.password||'').slice(0,200);
 const u=db.prepare("SELECT * FROM users WHERE email=? AND role='admin'").get(em);
 const ok=bcrypt.compareSync(pw,u?u.hash:DUMMY)&&u; // constant-ish time, generic error (A07)
 if(!ok){log('login_fail',{ip:req.ip});return res.status(401).json({error:'invalid_credentials'});}
 res.cookie('at',jwt.sign({sub:u.id,role:'admin'},JWT_SECRET,{algorithm:'HS256',issuer:'shop',expiresIn:'30m'}),ck);log('login_ok',{id:u.id});res.json({ok:true});});
app.post('/api/admin/logout',(q,r)=>{r.clearCookie('at',{...ck,maxAge:undefined});r.json({ok:true});});
// ---- admin API (RBAC middleware on every route)
const parseP=b=>{
 const sizes=(Array.isArray(b.sizes)?b.sizes:[]).slice(0,20).map(s=>S(s,10));
 const colors=(Array.isArray(b.colors)?b.colors:[]).slice(0,30).map(c=>{if(!/^#[0-9a-fA-F]{6}$/.test(c?.hex))throw new E('color');return{name:S(c.name,30),hex:c.hex};});
 const images=(Array.isArray(b.images)?b.images:[]).slice(0,50).map(i=>{if(!/^\/uploads\/[a-f0-9]{32}\.(jpg|png|gif|webp|avif)$/.test(i))throw new E('image');return i;});
 let ali='';if(b.ali_url){try{const u=new URL(b.ali_url);if(u.protocol!=='https:'||!/(^|\.)aliexpress\.(com|us)$/.test(u.hostname))throw 0;ali=u.href;}catch{throw new E('ali_url');}}
 return[S(b.title_en,200),S(b.title_ar,200),String(b.desc_en||'').slice(0,5000),String(b.desc_ar||'').slice(0,5000),JSON.stringify((Array.isArray(b.tags)?b.tags:[]).slice(0,20).map(t=>S(t,30))),money(b.price),b.compare?money(b.compare):0,money(b.cost),JSON.stringify(images),JSON.stringify(sizes),JSON.stringify(colors),ali,String(b.supplier_id||'').slice(0,64),b.active===false?0:1];};
const COLS='title_en,title_ar,desc_en,desc_ar,tags,price,compare,cost,images,sizes,colors,ali_url,supplier_id,active';
app.get('/api/admin/products',admin,(q,r)=>r.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(full)));
app.post('/api/admin/products',admin,(q,r)=>{const v=parseP(q.body||{});const id=db.prepare(`INSERT INTO products(${COLS}) VALUES(${v.map(()=>'?')})`).run(...v).lastInsertRowid;log('product_add',{id});r.json({id});});
app.put('/api/admin/products/:id',admin,(q,r)=>{const v=parseP(q.body||{});db.prepare(`UPDATE products SET ${COLS.split(',').map(c=>c+'=?')} WHERE id=?`).run(...v,+q.params.id|0);log('product_edit',{id:q.params.id});r.json({ok:true});});
app.delete('/api/admin/products/:id',admin,(q,r)=>{db.prepare('DELETE FROM products WHERE id=?').run(+q.params.id|0);log('product_del',{id:q.params.id});r.json({ok:true});});
const sig=b=>b[0]===0xFF&&b[1]===0xD8?'jpg':b.subarray(1,4).toString()==='PNG'?'png':b.subarray(0,3).toString()==='GIF'?'gif':(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')?'webp':b.subarray(4,12).toString()==='ftypavif'?'avif':null;
const up=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:10}});
app.post('/api/admin/upload',admin,up.array('files',10),(q,r)=>{ // A04/A08: magic-byte check, random names
 const out=(q.files||[]).map(f=>{const x=sig(f.buffer);if(!x)throw new E('bad_image');const n=crypto.randomBytes(16).toString('hex')+'.'+x;fs.writeFileSync(path.join(__dirname,'uploads',n),f.buffer);return'/uploads/'+n;});r.json({files:out});});
app.get('/api/admin/orders',admin,(q,r)=>r.json(db.prepare('SELECT ref,customer,total,cost,profit,status,fulfillment,payout,created FROM orders ORDER BY id DESC LIMIT 200').all().map(o=>({...o,customer:JSON.parse(o.customer),total:o.total/100,cost:o.cost/100,profit:o.profit/100}))));
const mask=s=>s?'••••'+String(s).slice(-4):'';
app.get('/api/admin/settings',admin,(q,r)=>{const p=getS('payout'),g=getS('gateway'),a=getS('automation');
 r.json({payout:p,gateway:{provider:g.provider||'stripe',key:mask(g.key),secret:mask(g.secret)},automation:{provider:a.provider||'dsers',key:mask(a.key),sender_name:a.sender_name||'Mohammad Shareeda'}});});
app.put('/api/admin/settings',admin,(q,r)=>{const b=q.body||{},o=getS('gateway'),a=getS('automation');
 const p=b.payout||{},iban=String(p.iban||'').replace(/\s/g,'').toUpperCase();
 // NEVER store full card number/CVV (PCI-DSS): only holder, bank, IBAN, last4
 if(iban&&!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban))throw new E('iban');if(p.last4&&!/^\d{4}$/.test(p.last4))throw new E('last4');
 if(/\d{13,}/.test(String(p.holder)+String(p.bank)))throw new E('no_card_numbers');
 setS('payout',{holder:String(p.holder||'').slice(0,100),bank:String(p.bank||'').slice(0,100),iban,last4:p.last4||''});
 const g=b.gateway||{},au=b.automation||{},keep=(n,old)=>n&&!String(n).startsWith('••')?String(n).slice(0,300):old;
 setS('gateway',{provider:['stripe','tap'].includes(g.provider)?g.provider:'stripe',key:keep(g.key,o.key),secret:keep(g.secret,o.secret)});
 setS('automation',{provider:['dsers','aliexpress'].includes(au.provider)?au.provider:'dsers',key:keep(au.key,a.key),sender_name:String(au.sender_name||'Mohammad Shareeda').slice(0,80)});
 log('settings_update');r.json({ok:true});});
// ---- hidden admin pages (panel HTML/JS only served to authenticated admins)
const A=f=>path.join(__dirname,'admin',f);
app.get('/admin-portal-login',(q,r)=>{r.set('Cache-Control','no-store');who(q)?r.redirect('/admin-portal'):r.sendFile(A('login.html'));});
app.get('/admin-portal-login.js',(q,r)=>r.sendFile(A('login.js')));
app.get('/admin-portal',(q,r)=>{r.set('Cache-Control','no-store');who(q)?r.sendFile(A('panel.html')):r.redirect('/admin-portal-login');});
app.get('/admin-portal/panel.js',(q,r)=>who(q)?r.sendFile(A('panel.js')):r.status(404).end());
app.use('/uploads',express.static(path.join(__dirname,'uploads'),{dotfiles:'deny',index:false}));
app.use(express.static(path.join(__dirname,'public'),{dotfiles:'deny'}));
app.use('/api',(q,r)=>r.status(404).json({error:'not_found'}));
app.use((e,q,r,n)=>{if(e instanceof E||e instanceof multer.MulterError)return r.status(400).json({error:e.message});log('error',{m:e.message});r.status(500).json({error:'server_error'});}); // A05: no stack leaks
if(require.main===module)app.listen(process.env.PORT||3000,()=>log('listening'));
module.exports=app;