applyLang();document.getElementById('lb').append(langBtn());
const go=async()=>{try{await api('/api/admin/login',{method:'POST',body:{email:e.value,password:p.value}});location.href='/admin-portal';}catch{m.textContent=t('bad');}};
document.getElementById('go').onclick=go;p.addEventListener('keydown',x=>{if(x.key==='Enter')go();});
