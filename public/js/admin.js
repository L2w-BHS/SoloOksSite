(() => {
  const $ = id => document.getElementById(id);
  const loginPanel = $('login-panel');
  const dashboard = $('dashboard');
  const form = $('news-form');
  let rows = [];
  let busy = false;
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    return data;
  };
  const showDashboard = visible => { loginPanel.hidden = visible; dashboard.hidden = !visible; };
  const message = (id, text, bad = false) => { $(id).textContent = text; $(id).classList.toggle('error', bad); };
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function checkSession() {
    try { await request('/api/admin/me'); showDashboard(true); await loadNews(); }
    catch (_) { showDashboard(false); }
  }
  async function loadNews() {
    const list = $('admin-news-list');
    list.innerHTML = '<p>Загружаем публикации…</p>';
    try {
      rows = await request('/api/admin/news');
      if (!rows.length) { list.innerHTML = '<p class="empty-state">Пока нет новостей. Создайте первую публикацию.</p>'; return; }
      list.innerHTML = rows.map(item => `<article class="admin-news-item"><div class="admin-news-item-main"><strong>${escapeHtml(item.title)}</strong><span class="status status-${item.status}">${item.status === 'published' ? 'Опубликовано' : item.status === 'scheduled' ? 'Запланировано' : 'Черновик'}</span><small>${item.status === 'scheduled' && item.scheduled_at ? 'Выход: ' + new Date(item.scheduled_at).toLocaleString('ru-RU') : item.published_at ? new Date(item.published_at).toLocaleDateString('ru-RU') : 'Не опубликовано'}</small></div><div class="item-actions"><button type="button" data-edit="${item.id}" class="text-button">Изменить</button><button type="button" data-delete="${item.id}" class="text-button danger">Удалить</button></div></article>`).join('');
    } catch (error) { list.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; }
  }
  function resetForm() {
    form.reset(); $('news-id').value = ''; $('news-image').value = ''; $('image-preview').hidden = true;
    $('image-preview').removeAttribute('src'); $('editor-title').textContent = 'Новая публикация';
    $('schedule-field').hidden = true; message('editor-message', ''); $('image-status').textContent = 'Можно загрузить JPG, PNG, WEBP или GIF до 5 МБ.';
  }
  function fillForm(item) {
    $('news-id').value = item.id; $('news-title').value = item.title; $('news-excerpt').value = item.excerpt || '';
    $('news-content').value = item.content || ''; $('news-image').value = item.image || ''; $('news-status').value = item.status;
    $('schedule-field').hidden = item.status !== 'scheduled';
    if (item.scheduled_at) { const d = new Date(item.scheduled_at); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); $('news-scheduled-at').value = local; }
    if (item.image) { $('image-preview').src = item.image; $('image-preview').hidden = false; }
    $('editor-title').textContent = 'Редактирование новости'; message('editor-message', ''); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); message('login-message', 'Проверяем пароль…');
    try { await request('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: $('admin-password').value }) }); $('admin-password').value = ''; showDashboard(true); await loadNews(); }
    catch (error) { message('login-message', error.message, true); }
  });
  $('logout-button').addEventListener('click', async () => { await request('/api/admin/logout', { method: 'POST' }); showDashboard(false); });
  $('refresh-button').addEventListener('click', loadNews);
  $('reset-form').addEventListener('click', resetForm);
  $('news-status').addEventListener('change', () => { $('schedule-field').hidden = $('news-status').value !== 'scheduled'; });
  $('news-image-file').addEventListener('change', async () => {
    const file = $('news-image-file').files[0]; if (!file) return;
    $('image-status').textContent = 'Загружаем фотографию…';
    const body = new FormData(); body.append('image', file);
    try { const data = await request('/api/admin/upload', { method: 'POST', body }); $('news-image').value = data.image; $('image-preview').src = data.image; $('image-preview').hidden = false; $('image-status').textContent = 'Фотография загружена.'; }
    catch (error) { $('image-status').textContent = error.message; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const id = $('news-id').value; const status = $('news-status').value;
    const localDate = $('news-scheduled-at').value;
    const payload = { title: $('news-title').value, excerpt: $('news-excerpt').value, content: $('news-content').value, image: $('news-image').value, status, scheduled_at: localDate ? new Date(localDate).toISOString() : null };
    try {
      await request(id ? `/api/admin/news/${id}` : '/api/admin/news', { method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      message('editor-message', status === 'published' ? 'Новость опубликована.' : status === 'scheduled' ? 'Публикация запланирована.' : 'Черновик сохранён.');
      resetForm(); await loadNews();
    } catch (error) { message('editor-message', error.message, true); }
    finally { busy = false; }
  });
  $('admin-news-list').addEventListener('click', async event => {
    const editId = event.target.dataset.edit; const deleteId = event.target.dataset.delete;
    if (editId) { const item = rows.find(row => String(row.id) === editId); if (item) fillForm(item); }
    if (deleteId && confirm('Удалить эту новость без возможности восстановления?')) {
      try { await request(`/api/admin/news/${deleteId}`, { method: 'DELETE' }); await loadNews(); if ($('news-id').value === deleteId) resetForm(); }
      catch (error) { alert(error.message); }
    }
  });
  checkSession();
})();
