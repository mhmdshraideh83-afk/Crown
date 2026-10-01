const PH='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect width=%22400%22 height=%22400%22 fill=%22%23e0f2fe%22/%3E%3C/svg%3E';
let P=[],cart=[];try{cart=JSON.parse(localStorage.getItem('cart')||'[]').filter(x=>x&&x.id)}catch{}
const L=o=>o[lang]||o.en,sv=()=>localStorage.setItem('cart',JSON.stringify(cart)),ov=document.getElementById('ov');
function close(){ov.replaceChildren();}
function modal(...c){close();ov.append(h('div',{class:'modal',onclick:e=>{if(e.target.classList.contains('modal'))close();}},h('div',{class:'glass'},...c,h('button',{class:'ghost',onclick:close},t('close')))));}
function grid(){const a=document.getElementById('app');a.replaceChildren();
 if(!P.length){a.append(h('div',{class:'empty glass'},t('empty')));return;}
 a.append(h('div',{class:'grid'},P.map(p=>h('div',{class:'card glass',onclick:()=>view(p)},h('img',{src:p.images[0]||PH,alt:L(p.title),loading:'lazy'}),h('h3',{},L(p.title)),
  h('div',{class:'price'},money(p.price),p.compare>p.price?h('span',{class:'old'},money(p.compare)):null)))));}
function view(p){let img=h('img',{class:'main-img',src:p.images[0]||PH,alt:''}),sz='',co='';
 const sB=p.sizes.map(s=>h('button',{class:'ghost',onclick:e=>{sz=s;sB.forEach(b=>b.classList.remove('on'));e.target.classList.add('on');}},s));
 const cB=p.colors.map(c=>h('button',{class:'sw',title:c.name,style:{background:c.hex},onclick:e=>{co=c.name;cB.forEach(b=>b.classList.remove('on'));e.target.classList.add('on');}}));
 const m=h('p',{class:'ok'});
 modal(h('div',{class:'two'},h('div',{},img,h('div',{class:'thumbs'},p.images.map(s=>h('img',{src:s,alt:'',onclick:()=>img.src=s})))),
  h('div',{},h('h2',{},L(p.title)),h('div',{class:'price'},money(p.price),p.compare>p.price?h('span',{class:'old'},money(p.compare)):null),h('p',{},L(p.desc)),
   p.sizes.length?h('div',{},h('label',{},t('size')),h('div',{class:'row'},sB)):null,p.colors.length?h('div',{},h('label',{},t('color')),h('div',{class:'row'},cB)):null,
   h('p',{},h('button',{onclick:()=>{if((p.sizes.length&&!sz)||(p.colors.length&&!co)){m.textContent=t('pick');m.className='msg';return;}
    const f=cart.find(x=>x.id===p.id&&x.size===sz&&x.color===co);f?f.qty=Math.min(20,f.qty+1):cart.push({id:p.id,size:sz,color:co,qty:1});sv();cnt();m.className='ok';m.textContent='✓';}},t('add'))),m)));}
const cnt=()=>document.getElementById('cb').textContent='🛒 '+t('cart')+' ('+cart.reduce((a,x)=>a+x.qty,0)+')';
function cartView(){cart=cart.filter(x=>P.some(p=>p.id===x.id));const tot=cart.reduce((a,x)=>a+P.find(p=>p.id===x.id).price*x.qty,0),f={},msg=h('p',{class:'msg'});
 const fld=(k,type='text')=>{f[k]=h('input',{type,maxlength:250,required:k!=='zip'});return h('label',{},t(k),f[k]);};
 modal(h('h2',{},t('cart')),cart.length?h('div',{},cart.map((x,i)=>{const p=P.find(q=>q.id===x.id);return h('div',{class:'row'},h('b',{},L(p.title)),h('span',{},[x.size,x.color].filter(Boolean).join(' / ')+' ×'+x.qty),h('span',{class:'price'},money(p.price*x.qty)),h('button',{class:'ghost',onclick:()=>{cart.splice(i,1);sv();cnt();cartView();}},t('remove')));}),
  h('h3',{},t('total')+': '+money(tot)),fld('name'),fld('email','email'),fld('phone','tel'),fld('address'),fld('city'),fld('country'),fld('zip'),msg,
  h('button',{onclick:async()=>{try{const r=await api('/api/orders',{method:'POST',body:{items:cart,customer:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v.value]))}});cart=[];sv();cnt();modal(h('h2',{class:'ok'},t('done')+' '+r.ref));}catch{msg.textContent=t('err');}}},t('checkout'))):h('p',{},t('cartEmpty')));}
async function init(){try{P=await api('/api/products');}catch{P=[];}grid();cnt();}
document.getElementById('lb').append(langBtn(()=>{close();grid();cnt();}));document.getElementById('cb').onclick=cartView;applyLang();init();