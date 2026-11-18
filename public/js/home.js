document.addEventListener('DOMContentLoaded', () => {
  const toggle=document.querySelector('.nav-toggle'); const nav=document.querySelector('.site-nav');
  toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');}));
  const gallery=document.querySelector('.about-mini-gallery');
  const galleryImages=gallery?[...gallery.querySelectorAll('img')]:[];
  const galleryDots=[...document.querySelectorAll('.gallery-dots button')]; let galleryIndex=0;
  function showGallery(i){if(!gallery||!galleryImages.length)return;galleryIndex=(i+galleryImages.length)%galleryImages.length;gallery.style.transform=`translateX(-${galleryIndex*100}%)`;galleryDots.forEach((dot,n)=>dot.classList.toggle('active',n===galleryIndex));}
  document.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>showGallery(galleryIndex-1));
  document.querySelector('[data-gallery-next]')?.addEventListener('click',()=>showGallery(galleryIndex+1));
  galleryDots.forEach((dot,i)=>dot.addEventListener('click',()=>showGallery(i)));showGallery(0);
  const data=[
    {name:'Имя Фамилия',role:'Должность',description:'Здесь будет подробное описание участника команды. Замените этот текст на свой.',url:'#',link:'Ссылка'},
    {name:'Имя Фамилия',role:'Должность',description:'Здесь будет подробное описание участника команды. Замените этот текст на свой.',url:'#',link:'Ссылка'},
    {name:'Имя Фамилия',role:'Должность',description:'Здесь будет подробное описание участника команды. Замените этот текст на свой.',url:'#',link:'Ссылка'},
    {name:'Имя Фамилия',role:'Должность',description:'Здесь будет подробное описание участника команды. Замените этот текст на свой.',url:'#',link:'Ссылка'}
  ];
  const modal=document.getElementById('team-modal');
  function open(index){const x=data[index];if(!x||!modal)return;document.getElementById('team-modal-name').textContent=x.name;document.getElementById('team-modal-role').textContent=x.role;document.getElementById('team-modal-description').textContent=x.description;const link=document.getElementById('team-modal-link');link.href=x.url;link.textContent=x.link+' ↗';modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');}
  function close(){modal?.classList.remove('is-open');modal?.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}
  document.querySelectorAll('.team-card').forEach(card=>{const run=()=>open(Number(card.dataset.team));card.addEventListener('click',run);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run();}});});
  modal?.querySelectorAll('[data-team-close]').forEach(x=>x.addEventListener('click',close));document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
});