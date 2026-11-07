(() => {
  const root = document.getElementById('news-archive');
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('/api/news?limit=100').then(r => { if (!r.ok) throw new Error('Не удалось загрузить новости'); return r.json(); }).then(items => {
    if (!items.length) { root.innerHTML = '<p class="empty-state">Пока здесь нет опубликованных новостей. Загляните немного позже.</p>'; return; }
    root.innerHTML = items.map(item => `<article class="news-card">${item.image ? `<div class="news-card-image"><img src="${esc(item.image)}" alt="" loading="lazy"></div>` : '<div class="news-card-image news-card-no-image"></div>'}<div class="news-card-content"><time class="news-card-date">${item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : ''}</time><h2>${esc(item.title)}</h2><p>${esc(item.excerpt || item.content).slice(0,220)}${(item.excerpt || item.content || '').length > 220 ? '…' : ''}</p><a class="news-card-link" href="/news?post=${encodeURIComponent(item.slug)}">Читать полностью <span>→</span></a></div></article>`).join('');
    const slug = new URLSearchParams(location.search).get('post');
    if (slug) {
      const item = items.find(x => x.slug === slug);
      if (item) {
        const article = document.createElement('article'); article.className = 'news-article';
        article.innerHTML = `${item.image ? `<img class="news-article-image" src="${esc(item.image)}" alt="">` : ''}<time>${item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : ''}</time><h2>${esc(item.title)}</h2><p class="news-article-excerpt">${esc(item.excerpt)}</p><div class="news-article-content"></div><a class="news-back-link" href="/news">← Ко всем новостям</a>`;
        article.querySelector('.news-article-content').textContent = item.content || '';
        root.replaceChildren(article); document.title = `${item.title} — Оксана Соло`;
      }
    }
  }).catch(error => { root.innerHTML = `<p class="error">${esc(error.message)}</p>`; });
})();
