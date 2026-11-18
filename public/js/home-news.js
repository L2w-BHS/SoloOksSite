(() => {
  const root = document.getElementById('home-news-list');
  if (!root) return;
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('/api/news?limit=3').then(r => { if (!r.ok) throw new Error('Не удалось загрузить новости'); return r.json(); }).then(items => {
    if (!items.length) { root.innerHTML = '<p class="news-empty">Скоро здесь появятся новости и события.</p>'; return; }
    root.innerHTML = items.map(item => `<article class="news-card">${item.image ? `<div class="news-card-image"><img src="${esc(item.image)}" alt="" loading="lazy"></div>` : '<div class="news-card-image news-card-no-image"></div>'}<div class="news-card-content"><time class="news-card-date">${item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : ''}</time><h3>${esc(item.title)}</h3><p>${esc(item.excerpt || '').slice(0,180)}</p><a class="news-card-link" href="/news?post=${encodeURIComponent(item.slug)}">Читать полностью <span>→</span></a></div></article>`).join('');
  }).catch(() => { root.innerHTML = '<p class="news-empty">Новости временно недоступны.</p>'; });
})();
