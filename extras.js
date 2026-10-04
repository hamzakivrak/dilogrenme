(() => {
  const $ = id => document.getElementById(id);
  const DAY = 864e5, LS = localStorage;
  const jget = (k, d) => { try { return JSON.parse(LS.getItem(k)) ?? d; } catch (e) { return d; } };

  // ---- TOAST (alert yerine) ----
  const wrap = Object.assign(document.createElement('div'), { id: 'toast-wrap' });
  document.body.appendChild(wrap);
  window.toast = (msg, o = {}) => {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span></span>`; t.firstChild.textContent = msg;
    if (o.action) { const b = document.createElement('button'); b.textContent = o.label || 'Tamam'; b.onclick = () => { o.action(); t.remove(); }; t.appendChild(b); }
    wrap.appendChild(t); setTimeout(() => t.remove(), o.ms || 4000);
  };
  window.alert = m => window.toast(String(m), { ms: 5000 });

  // ---- YÜKLENİYOR ÇUBUĞU + BUTON + HATA MESAJLARI ----
  const bar = Object.assign(document.createElement('div'), { id: 'top-loader' });
  const off = Object.assign(document.createElement('div'), { id: 'offline-bar', textContent: 'Çevrimdışısın – kayıtlı içerikler açık, AI çalışmaz' });
  document.body.append(bar, off);
  let pending = 0, lastBtn = null;
  document.addEventListener('click', e => { lastBtn = e.target.closest('button.action-btn, #btn-drawer-send, #btn-fc-chat-send'); }, true);
  const origFetch = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    const ai = String(url).includes('generativelanguage.googleapis.com');
    if (!ai) return origFetch(url, opt);
    if (!navigator.onLine) { toast('İnternet bağlantısı yok.'); throw new Error('offline'); }
    const btn = lastBtn; pending++; bar.classList.add('on'); if (btn) btn.classList.add('btn-busy');
    try {
      const r = await origFetch(url, opt);
      if (r.status === 403 || r.status === 401) toast('API anahtarı geçersiz görünüyor. Ayarlar\'dan kontrol et.');
      return r;
    } catch (e) { if (e.message !== 'offline') toast('Bağlantı hatası. Tekrar dene.', {}); throw e; }
    finally { if (--pending <= 0) { pending = 0; bar.classList.remove('on'); } if (btn) btn.classList.remove('btn-busy'); }
  };
  const net = () => { off.style.display = navigator.onLine ? 'none' : 'block'; };
  addEventListener('online', net); addEventListener('offline', net); net();

  // ---- SRS (Leitner) ----
  const GAP = [0, 1, 2, 4, 8, 16];
  window.__srs = (w, ok) => {
    const s = jget('dil_srs', {}), k = (w || '').toLowerCase(), box = s[k]?.box || 0;
    const nb = ok ? Math.min(box + 1, 5) : 0;
    s[k] = { box: nb, due: Date.now() + GAP[nb] * DAY };
    LS.setItem('dil_srs', JSON.stringify(s));
  };
  const dueCards = () => {
    const s = jget('dil_srs', {}), v = window.__app ? window.__app.getVault() : [];
    const due = v.filter(c => s[c.frontWord.toLowerCase()] && s[c.frontWord.toLowerCase()].due <= Date.now());
    const fresh = v.filter(c => !s[c.frontWord.toLowerCase()]).slice(0, 10);
    return [...due, ...fresh];
  };

  // ---- İLERLEME PANELİ ----
  const streak = () => {
    const days = new Set(jget('dil_study_sessions', []).map(x => new Date(x.id).toDateString()));
    let n = 0, d = new Date(); if (!days.has(d.toDateString())) d = new Date(Date.now() - DAY);
    while (days.has(d.toDateString())) { n++; d = new Date(d - DAY); } return n;
  };
  function panel() {
    const host = $('sub-kelimeler'); if (!host) return;
    let p = $('stat-panel'); if (!p) { p = Object.assign(document.createElement('div'), { id: 'stat-panel', className: 'stat-card' }); host.prepend(p); }
    const v = window.__app ? window.__app.getVault() : [], due = dueCards();
    p.innerHTML = `<div class="stat-row"><div><b>🔥 ${streak()}</b><span>Gün serisi</span></div><div><b>${v.length}</b><span>Kelime</span></div><div><b>${jget('dil_study_sessions', []).length}</b><span>Oturum</span></div></div>` +
      (v.length ? `<button class="action-btn" id="btn-srs">Bugün Tekrar Et (${due.length})</button>` : `<div style="margin-top:10px;font-size:13px;opacity:.8">Havuz boş. Lab'da bir hikayeden kelime seçip kaydet.</div>`);
    const b = $('btn-srs'); if (b) b.onclick = () => due.length ? window.__app.start(due) : toast('Bugün tekrar edilecek kart yok 🎉');
  }
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => setTimeout(panel, 50)));
  panel();

  // ---- ARAMA KUTULARI ----
  function addSearch(listId, ph) {
    const l = $(listId); if (!l || l.dataset.s) return; l.dataset.s = 1;
    const i = Object.assign(document.createElement('input'), { type: 'search', placeholder: ph, className: 'mini-search' });
    l.before(i);
    const f = () => { const q = i.value.toLowerCase(); [...l.children].forEach(c => c.style.display = (!q || c.textContent.toLowerCase().includes(q)) ? '' : 'none'); };
    i.addEventListener('input', f); new MutationObserver(f).observe(l, { childList: true });
  }
  addSearch('story-list-container', '🔍 Hikayelerde ara'); addSearch('notes-list-container', '🔍 Notlarda ara'); addSearch('modal-vault-list', '🔍 Kelimelerde ara');

  // ---- AYARLAR: yazı boyutu, animasyon, yedek ----
  const st = $('tab-settings');
  if (st) {
    const box = document.createElement('div'); box.className = 'stat-card';
    box.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Görünüm</div>
      <label style="font-size:13px">Okuma yazı boyutu</label>
      <select id="fs-select" class="mini-search"><option value="">Normal</option><option value="18px">Büyük</option><option value="22px">Çok büyük</option></select>
      <label style="font-size:13px"><input type="checkbox" id="chk-noanim"> Arka plan animasyonunu kapat</label><br>
      <label style="font-size:13px">Seslendirme hızı</label>
      <select id="rate-select" class="mini-search"><option value="1">Normal</option><option value="0.7">Yavaş</option><option value="0.5">Çok yavaş</option></select>`;
    st.appendChild(box);
    const fs = $('fs-select'), na = $('chk-noanim'), rt = $('rate-select');
    fs.value = LS.getItem('dil_fs') || ''; na.checked = LS.getItem('dil_noanim') === '1'; rt.value = LS.getItem('dil_rate') || '1';
    const ap = () => { document.documentElement.style.setProperty('--read-fs', fs.value || 'inherit'); document.body.classList.toggle('no-anim', na.checked); };
    fs.onchange = () => { LS.setItem('dil_fs', fs.value); ap(); }; na.onchange = () => { LS.setItem('dil_noanim', na.checked ? '1' : '0'); ap(); }; rt.onchange = () => LS.setItem('dil_rate', rt.value);
    ap();
  }
  // TTS hızı (app.js yüklendikten sonra sar)
  addEventListener('load', () => {
    const o = window.playAudio; if (!o) return;
    window.playAudio = (t, l) => { const s = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { u.rate = parseFloat(LS.getItem('dil_rate') || '1'); speechSynthesis.speak = s; s(u); }; o(t, l); };
    panel();
  });

  // ---- YEDEK HATIRLATMA ----
  const ex = $('btn-export-vault'); if (ex) ex.addEventListener('click', () => LS.setItem('dil_last_backup', Date.now()));
  setTimeout(() => {
    const last = +LS.getItem('dil_last_backup') || 0, v = window.__app ? window.__app.getVault().length : 0;
    if (!last && v) LS.setItem('dil_last_backup', Date.now());
    else if (last && Date.now() - last > 7 * DAY) toast('7+ gündür yedek almadın.', { label: 'Yedek Al', ms: 9000, action: () => ex && ex.click() });
  }, 2500);

  // ---- YENİ SÜRÜM BİLDİRİMİ ----
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.addEventListener('updatefound', () => {
    const w = r.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Yeni sürüm hazır.', { label: 'Yenile', ms: 20000, action: () => location.reload() }); });
  }));
})();
