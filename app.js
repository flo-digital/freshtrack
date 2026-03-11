/* ============================================
   APP – FreshTrack Main Application Logic
   ============================================ */

/* ---------- On-screen debug panel ----------
   Intercepts console.log/warn/error and shows
   [FreshTrack] lines in a floating panel.
   Tap the 🐛 button (bottom-left) to toggle.
   Remove this block once scanning is confirmed working.
--------------------------------------------- */
(function () {
  const LOG_KEY = '[FreshTrack]';
  let panel = null;
  let visible = false;
  const logs = [];

  function stamp(type, args) {
    const text = args.map(a => {
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch(_) { return String(a); } }
      return String(a);
    }).join(' ');
    if (!text.includes(LOG_KEY)) return;
    const time = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logs.push({ type, time, text });
    if (logs.length > 80) logs.shift();
    if (panel && visible) renderLogs();
  }

  const _log   = console.log.bind(console);
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);
  console.log   = (...a) => { _log(...a);   stamp('log',   a); };
  console.warn  = (...a) => { _warn(...a);  stamp('warn',  a); };
  console.error = (...a) => { _error(...a); stamp('error', a); };

  function renderLogs() {
    if (!panel) return;
    const body = panel.querySelector('.dbg-body');
    body.innerHTML = logs.map(l => {
      const col = l.type === 'error' ? '#ff6b6b' : l.type === 'warn' ? '#ffd93d' : '#6bffb8';
      const msg = l.text.replace(LOG_KEY, '').trim();
      return `<div style="border-bottom:1px solid #222;padding:3px 0;color:${col}"><span style="color:#666;font-size:10px">${l.time} </span>${msg}</div>`;
    }).reverse().join('');
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.innerHTML = `
      <div class="dbg-body" style="height:260px;overflow-y:auto;font-size:11px;font-family:monospace;padding:6px;line-height:1.4;word-break:break-all;background:#111;border-radius:12px 12px 0 0;border:1px solid #333;border-bottom:none;"></div>
      <div style="display:flex;gap:6px;padding:6px;background:#1a1a1a;border-radius:0 0 12px 12px;border:1px solid #333;border-top:none;">
        <button onclick="this.closest('div').parentElement.querySelector('.dbg-body').innerHTML=''" style="flex:1;background:#333;color:#fff;border:none;border-radius:8px;padding:6px;font-size:12px">Clear</button>
        <button id="dbg-close" style="flex:1;background:#333;color:#fff;border:none;border-radius:8px;padding:6px;font-size:12px">Close</button>
      </div>`;
    panel.style.cssText = 'position:fixed;bottom:80px;left:8px;right:8px;z-index:99999;filter:drop-shadow(0 4px 20px #000)';
    document.body.appendChild(panel);
    panel.querySelector('#dbg-close').addEventListener('click', () => {
      panel.style.display = 'none';
      visible = false;
    });
    renderLogs();
  }

  function createToggle() {
    const btn = document.createElement('button');
    btn.textContent = '🐛';
    btn.style.cssText = 'position:fixed;bottom:90px;left:16px;z-index:99998;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.7);border:1px solid #444;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    btn.addEventListener('click', () => {
      visible = !visible;
      if (!panel) createPanel();
      panel.style.display = visible ? 'block' : 'none';
      if (visible) renderLogs();
    });
    document.body.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', createToggle);
})();

/* ---------- Helpers ---------- */

const CATEGORY_EMOJI = {
  dairy:      '🥛',
  meat:       '🥩',
  produce:    '🥦',
  leftovers:  '🍱',
  drinks:     '🥤',
  condiments: '🫙',
  other:      '📦',
};

const CATEGORY_LABELS = {
  dairy:      'Dairy',
  meat:       'Meat & Fish',
  produce:    'Produce',
  leftovers:  'Leftovers',
  drinks:     'Drinks',
  condiments: 'Condiments',
  other:      'Other',
};

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(dateStr + 'T00:00:00');
  return Math.round((exp - today) / 86_400_000);
}

function statusOf(item, warnDays) {
  const d = daysUntil(item.expirationDate);
  if (d < 0) return 'expired';
  if (d <= warnDays) return 'warning';
  return 'ok';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function expiryLabel(days) {
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today!';
  if (days === 1) return 'Expires tomorrow';
  return `${days} days left`;
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

/* ---------- State ---------- */

let activeFilter   = 'all';
let searchQuery    = '';
let editingItemId  = null;
let scannedBarcode = null;
let scannedProduct = null;

/* ---------- Render ---------- */

function renderList() {
  const cfg     = Storage.getConfig();
  const all     = Storage.getItems();
  const list    = document.getElementById('fridge-list');
  const empty   = document.getElementById('empty-state');
  const warnDays = Number(cfg.warnDays) || 2;

  // Stats
  let expiring = 0, expired = 0;
  all.forEach(i => {
    const s = statusOf(i, warnDays);
    if (s === 'warning') expiring++;
    if (s === 'expired') expired++;
  });
  document.getElementById('stat-total').textContent    = all.length;
  document.getElementById('stat-expiring').textContent = expiring;
  document.getElementById('stat-expired').textContent  = expired;

  // Filter + search
  let items = all.filter(i => {
    if (activeFilter === 'expiring' && statusOf(i, warnDays) !== 'warning') return false;
    if (activeFilter === 'expired'  && statusOf(i, warnDays) !== 'expired') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (i.name || '').toLowerCase().includes(q)
          || (i.brand || '').toLowerCase().includes(q)
          || (i.notes || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: expired first, then by soonest expiry
  items.sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));

  // Clear cards but keep empty state
  Array.from(list.querySelectorAll('.item-card, .list-group-header')).forEach(el => el.remove());

  if (items.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group cards
  let lastGroup = null;
  items.forEach(item => {
    const days   = daysUntil(item.expirationDate);
    const status = statusOf(item, warnDays);

    // Group header
    let group;
    if (status === 'expired')  group = '🔴 Expired';
    else if (status === 'warning') group = '⚠️ Expiring Soon';
    else if (days <= 7)        group = '📅 This Week';
    else if (days <= 30)       group = '📅 This Month';
    else                       group = '✅ Good';

    if (group !== lastGroup) {
      const h = document.createElement('div');
      h.className = 'list-group-header';
      h.textContent = group;
      list.appendChild(h);
      lastGroup = group;
    }

    const card = document.createElement('div');
    card.className = `item-card status-${status}`;
    card.dataset.id = item.id;

    const imgHtml = item.image
      ? `<img class="item-img" src="${item.image}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="item-emoji" style="display:none">${CATEGORY_EMOJI[item.category] || '📦'}</div>`
      : `<div class="item-emoji">${CATEGORY_EMOJI[item.category] || '📦'}</div>`;

    const qtyHtml  = item.quantity > 1 ? `<span class="item-qty">×${item.quantity}</span>` : '';
    const catLabel = CATEGORY_LABELS[item.category] || 'Other';

    card.innerHTML = `
      ${imgHtml}
      <div class="item-info">
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-meta">
          <span class="item-category">${catLabel}</span>
          ${qtyHtml}
        </div>
      </div>
      <div class="item-expiry">
        <span class="expiry-date">${formatDate(item.expirationDate)}</span>
        <span class="expiry-label">${expiryLabel(days)}</span>
      </div>
    `;

    card.addEventListener('click', () => openDetail(item.id));
    list.appendChild(card);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- Add Item Modal ---------- */

function openAddModal(prefill = {}) {
  editingItemId  = prefill.id || null;
  scannedBarcode = null;
  scannedProduct = null;

  // Reset form
  document.getElementById('form-name').value     = prefill.name     || '';
  document.getElementById('form-barcode').value  = prefill.barcode  || '';
  document.getElementById('form-category').value = prefill.category || 'other';
  document.getElementById('form-qty').value      = prefill.quantity  || 1;
  document.getElementById('form-expiry').value   = prefill.expirationDate || '';
  document.getElementById('form-notes').value    = prefill.notes    || '';

  // Default expiry to +7 days for new items
  if (!prefill.expirationDate) {
    const t = new Date(); t.setDate(t.getDate() + 7);
    document.getElementById('form-expiry').value = t.toISOString().slice(0, 10);
  }

  document.getElementById('modal-add-title').textContent =
    editingItemId ? 'Edit Item' : 'Add Item';

  // Editing → go straight to form; new item → show choice screen
  if (editingItemId) {
    showManualView();
  } else {
    showChoiceView();
  }

  document.getElementById('modal-add').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('modal-add').classList.add('hidden');
  editingItemId  = null;
  scannedBarcode = null;
  scannedProduct = null;
}

/* Show the two-button landing screen */
function showChoiceView() {
  document.getElementById('choice-view').classList.remove('hidden');
  document.getElementById('manual-view').classList.add('hidden');
  document.getElementById('modal-footer-actions').classList.add('hidden');
}

/* Show the manual entry form */
function showManualView() {
  document.getElementById('choice-view').classList.add('hidden');
  document.getElementById('manual-view').classList.remove('hidden');
  document.getElementById('modal-footer-actions').classList.remove('hidden');
}

/* ---------- Photo Barcode Scanning ---------- */

// capturePhoto() just clicks the permanent #photo-input that lives in the HTML.
function capturePhoto() {
  document.getElementById('photo-input').click();
}

/* Processes the photo file returned by #photo-input */
async function handlePhotoFile(file) {
  if (!file) return;

  const snapBtn = document.getElementById('btn-snap');
  snapBtn.classList.add('scanning');
  snapBtn.innerHTML = `
    <span class="choice-card-icon">🔍</span>
    <span class="choice-card-label">Scanning…</span>
    <span class="choice-card-sub">Trying all orientations</span>`;

  showToast('Scanning barcode…');

  try {
    const barcode = await scanPhotoRobust(file);
    await onBarcodeScanned(barcode);
  } catch (e) {
    console.warn('[FreshTrack] All scan strategies failed:', e?.message);
    snapBtn.classList.remove('scanning');
    snapBtn.innerHTML = `
      <span class="choice-card-icon">📷</span>
      <span class="choice-card-label">Snap Barcode</span>
      <span class="choice-card-sub">Auto-identify product from barcode</span>`;
    showToast('No barcode found — ensure barcode is flat, well-lit and fills the frame', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   scanPhotoRobust  — v3 pipeline

   Diagnosis from on-device debug panel:
   • BarcodeDetector: NOT available on iOS Safari (Chrome/Android only)
   • ZXing canvas: was downscaling to 1920px → barcode detail lost → 0 hits
     Fix: decodeFromImageUrl() lets ZXing load the blob at full resolution;
     browser applies EXIF when ZXing creates its internal <img>.
   • Quagga: 1600px cap caused 6→8 misread (too little detail at that scale)
     Fix: try 2560px with halfSample:false first.

   Pipeline:
     1. ZXing  — decodeFromImageUrl(objURL) [full-res, EXIF by browser]
     2. Quagga — 2560px (x-large / large, halfSample:false) → 1600 → 800
     3. ZXing  — canvas rotations at near-full res (handles tilted photos)
     4. Html5Qrcode — original file as last resort
   ════════════════════════════════════════════════════════════════════ */
async function scanPhotoRobust(file) {
  console.log('[FreshTrack] file:', file.name, file.type, 'size:', file.size);

  const objURL = URL.createObjectURL(file);

  try {

    // ── Strategy 1: ZXing decodeFromImageUrl — full resolution ────────────
    // ZXing creates its own <img src=objURL>, browser applies EXIF,
    // ZXing draws to its internal canvas at native size. No scaling loss.
    const zx = window.ZXing;
    if (zx?.BrowserMultiFormatReader && zx?.DecodeHintType) {
      console.log('[FreshTrack] ZXing full-res URL decode...');
      try {
        const hints = new Map([[zx.DecodeHintType.TRY_HARDER, true]]);
        const reader = new zx.BrowserMultiFormatReader(hints);
        const r = await reader.decodeFromImageUrl(objURL);
        if (r) { console.log('[FreshTrack] ZXing URL hit:', r.getText()); return r.getText(); }
      } catch(e) { console.log('[FreshTrack] ZXing URL miss:', e?.message); }
    } else {
      console.warn('[FreshTrack] ZXing NOT available');
    }

    // ── Strategy 2: QuaggaJS — high-res first, then fallbacks ────────────
    if (typeof Quagga !== 'undefined') {
      console.log('[FreshTrack] Quagga available, trying...');
      // [size, patchSize, halfSample, timeoutMs]
      const combos = [
        [2560, 'x-large', false, 15000],
        [2560, 'large',   false, 15000],
        [1600, 'medium',  true,   8000],
        [ 800, 'large',   false,  8000],
      ];
      for (const [size, patch, halfSample, ms] of combos) {
        try {
          const code = await quaggaDecode(objURL, size, patch, halfSample, ms);
          console.log(`[FreshTrack] Quagga hit (${size}px ${patch}):`, code);
          return code;
        } catch(_) {}
      }
      console.log('[FreshTrack] Quagga found nothing');
    } else {
      console.warn('[FreshTrack] Quagga NOT available');
    }

    // ── Strategy 3: ZXing canvas rotations (handles tilted photos) ────────
    if (zx?.BrowserMultiFormatReader && zx?.DecodeHintType) {
      console.log('[FreshTrack] ZXing canvas rotations...');
      const img = await loadImg(objURL);
      const nw = img.naturalWidth, nh = img.naturalHeight;
      console.log('[FreshTrack] img size (EXIF corrected):', nw, '×', nh);
      // Near-full resolution — cap at 3000px only to avoid OOM
      const scale = Math.min(1, 3000 / Math.max(nw, nh));
      const w = Math.round(nw * scale), h = Math.round(nh * scale);

      const hints = new Map([[zx.DecodeHintType.TRY_HARDER, true]]);
      const reader = new zx.BrowserMultiFormatReader(hints);
      for (const angle of [0, 90, 180, 270]) {
        try {
          const c = makeRotatedCanvas(img, angle, w, h);
          const r = reader.decodeFromCanvas(c);
          if (r) { console.log(`[FreshTrack] ZXing canvas ${angle}°:`, r.getText()); return r.getText(); }
        } catch(_) {}
      }
      console.log('[FreshTrack] ZXing canvas found nothing');
    }

    // ── Strategy 4: Html5Qrcode ────────────────────────────────────────────
    console.log('[FreshTrack] Trying Html5Qrcode...');
    const tmpId = 'photo-scan-tmp';
    let div = document.getElementById(tmpId);
    if (!div) {
      div = document.createElement('div');
      div.id = tmpId;
      div.style.cssText = 'position:fixed;top:-600px;left:0;width:300px;height:300px;opacity:0;pointer-events:none;overflow:hidden';
      document.body.appendChild(div);
    }
    try {
      const code = await new Html5Qrcode(tmpId).scanFile(file, false);
      console.log('[FreshTrack] Html5Qrcode found:', code);
      return code;
    } catch(e) { console.warn('[FreshTrack] Html5Qrcode failed:', e?.message); }

  } finally {
    URL.revokeObjectURL(objURL);
  }

  throw new Error('All strategies failed');
}

/* Load a URL into an <img> element (resolves once loaded) */
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('img load failed'));
    img.src = url;
  });
}

/* QuaggaJS single-image decode — promisified
   halfSample:false = process at full patch resolution (more accurate, slower)
   halfSample:true  = half resolution (faster, enough for large barcodes) */
function quaggaDecode(src, size, patchSize, halfSample = false, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Quagga timeout')), timeoutMs);
    Quagga.decodeSingle({
      src,
      numOfWorkers: 0,
      locate: true,
      inputStream: { size },
      locator:  { patchSize, halfSample },
      decoder:  {
        readers: ['ean_reader','ean_8_reader','upc_reader','upc_e_reader','code_128_reader','code_39_reader'],
        multiple: false,
      },
    }, (result) => {
      clearTimeout(t);
      result?.codeResult?.code ? resolve(result.codeResult.code) : reject(new Error('not found'));
    });
  });
}

/* Build a canvas from a drawable source (img/bitmap) at the given rotation */
function makeRotatedCanvas(source, angleDeg, w, h) {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  const cw = (angleDeg === 90 || angleDeg === 270) ? h : w;
  const ch = (angleDeg === 90 || angleDeg === 270) ? w : h;
  canvas.width  = cw;
  canvas.height = ch;
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

/* Called when a barcode value has been successfully decoded */
async function onBarcodeScanned(barcode) {
  if (scannedBarcode === barcode) return; // debounce
  scannedBarcode = barcode;

  showToast('Barcode found — looking up product…');

  const product = await FoodAPI.lookupBarcode(barcode);
  scannedProduct = product;

  // Pre-fill form fields
  document.getElementById('form-name').value     = product?.name     || '';
  document.getElementById('form-barcode').value  = barcode;
  document.getElementById('form-category').value = product?.category || 'other';

  // Show the form so the user can fill in the expiry date
  showManualView();

  if (product?.name) {
    showToast(`Found: ${product.name} — set the expiry date`, 'success');
  } else {
    showToast('Product not in database — fill in details below');
  }
}

/* ---------- Save Item ---------- */

function saveItem() {
  const name   = document.getElementById('form-name').value.trim();
  const expiry = document.getElementById('form-expiry').value;

  if (!name)   { showToast('Please enter a product name', 'error'); return; }
  if (!expiry) { showToast('Please set an expiration date', 'error'); return; }

  const itemData = {
    name,
    barcode:        document.getElementById('form-barcode').value.trim(),
    category:       document.getElementById('form-category').value,
    quantity:       parseInt(document.getElementById('form-qty').value, 10) || 1,
    expirationDate: expiry,
    notes:          document.getElementById('form-notes').value.trim(),
    image:          scannedProduct?.image || (editingItemId ? (Storage.getItemById(editingItemId)?.image || '') : ''),
    brand:          scannedProduct?.brand || (editingItemId ? (Storage.getItemById(editingItemId)?.brand || '') : ''),
  };

  if (editingItemId) {
    Storage.updateItem(editingItemId, itemData);
    showToast('Item updated!', 'success');
  } else {
    Storage.addItem(itemData);
    showToast('Item added to fridge!', 'success');
  }

  closeAddModal();
  renderList();
}

/* ---------- Detail Modal ---------- */

function openDetail(id) {
  const item = Storage.getItemById(id);
  if (!item) return;

  const cfg   = Storage.getConfig();
  const days  = daysUntil(item.expirationDate);
  const status = statusOf(item, Number(cfg.warnDays) || 2);

  const badgeClass = status === 'ok' ? 'badge-green' : status === 'warning' ? 'badge-orange' : 'badge-red';
  const badgeText  = expiryLabel(days);

  const imgHtml = item.image
    ? `<img src="${item.image}" class="product-img" style="width:72px;height:72px;border-radius:18px;object-fit:contain;background:var(--glass)" alt="" />`
    : `<div class="detail-emoji">${CATEGORY_EMOJI[item.category] || '📦'}</div>`;

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      ${imgHtml}
      <div>
        <div class="detail-product-name">${escHtml(item.name)}</div>
        <div class="detail-product-brand">${item.brand ? escHtml(item.brand) : CATEGORY_LABELS[item.category] || 'Other'}</div>
      </div>
    </div>
    <div class="detail-badges">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span class="badge badge-gray">${CATEGORY_LABELS[item.category] || 'Other'}</span>
      ${item.quantity > 1 ? `<span class="badge badge-gray">×${item.quantity}</span>` : ''}
    </div>
    <div class="detail-row">
      <span class="detail-row-label">Expiration Date</span>
      <span class="detail-row-value">${formatDate(item.expirationDate)}</span>
    </div>
    ${item.barcode ? `
    <div class="detail-row">
      <span class="detail-row-label">Barcode</span>
      <span class="detail-row-value">${escHtml(item.barcode)}</span>
    </div>` : ''}
    <div class="detail-row">
      <span class="detail-row-label">Added</span>
      <span class="detail-row-value">${formatDate(item.addedDate)}</span>
    </div>
    ${item.notes ? `
    <div class="detail-row">
      <span class="detail-row-label">Notes</span>
      <span class="detail-row-value">${escHtml(item.notes)}</span>
    </div>` : ''}
  `;

  document.getElementById('detail-delete').dataset.id = id;
  document.getElementById('detail-edit').dataset.id   = id;

  document.getElementById('modal-detail').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('modal-detail').classList.add('hidden');
}

/* ---------- Settings Modal ---------- */

function openSettings() {
  const cfg = Storage.getConfig();
  document.getElementById('settings-warn-days').value  = cfg.warnDays || 2;
  document.getElementById('settings-check-time').value = cfg.checkTime || 'on-open';
  document.getElementById('modal-settings').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('modal-settings').classList.add('hidden');
}

function saveSettings() {
  const cfg = Storage.getConfig();
  cfg.warnDays  = document.getElementById('settings-warn-days').value;
  cfg.checkTime = document.getElementById('settings-check-time').value;
  Storage.saveConfig(cfg);
  closeSettings();
  renderList();
  showToast('Settings saved!', 'success');
}

/* ---------- Notifications ---------- */

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifications already enabled!', 'success');
    checkAndNotify();
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('Notifications enabled!', 'success');
    checkAndNotify();
  } else {
    showToast('Notification permission denied', 'error');
  }
}

function checkAndNotify() {
  if (Notification.permission !== 'granted') return;

  const cfg      = Storage.getConfig();
  const warnDays = Number(cfg.warnDays) || 2;
  const items    = Storage.getItems();

  const expiringSoon = items.filter(i => {
    const d = daysUntil(i.expirationDate);
    return d >= 0 && d <= warnDays;
  });

  const expired = items.filter(i => daysUntil(i.expirationDate) < 0);

  if (expiringSoon.length === 0 && expired.length === 0) return;

  let body = '';
  if (expired.length)      body += `🔴 ${expired.length} item(s) have expired. `;
  if (expiringSoon.length) body += `⚠️ ${expiringSoon.length} item(s) expiring within ${warnDays} day(s).`;

  new Notification('FreshTrack – Check Your Fridge', {
    body: body.trim(),
    icon: 'icons/icon-192.png',
    tag:  'freshtrack-expiry',
  });

  cfg.lastNotifCheck = new Date().toISOString();
  Storage.saveConfig(cfg);
}

function shouldRunNotifCheck() {
  const cfg = Storage.getConfig();
  if (!cfg.lastNotifCheck) return true;
  const last = new Date(cfg.lastNotifCheck);
  const now  = new Date();
  return (now - last) > 4 * 60 * 60 * 1000;
}

/* ---------- Export ---------- */

function exportData() {
  const json = Storage.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `freshtrack-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!', 'success');
}

function clearExpired() {
  const cfg    = Storage.getConfig();
  const warnDays = Number(cfg.warnDays) || 2;
  const items  = Storage.getItems();
  const expired = items.filter(i => statusOf(i, warnDays) === 'expired');
  if (expired.length === 0) { showToast('No expired items to remove'); return; }
  if (!confirm(`Remove ${expired.length} expired item(s)?`)) return;
  expired.forEach(i => Storage.deleteItem(i.id));
  renderList();
  closeSettings();
  showToast(`Removed ${expired.length} expired item(s)`, 'success');
}

/* ---------- Event Listeners ---------- */

document.addEventListener('DOMContentLoaded', () => {

  /* FAB – open add modal */
  document.getElementById('fab-add').addEventListener('click', () => openAddModal());

  /* Settings button */
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  /* Notification bell */
  document.getElementById('notif-btn').addEventListener('click', requestNotificationPermission);

  /* Filter tabs */
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderList();
    });
  });

  /* Search */
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    renderList();
  });

  /* Add Modal – choice buttons */
  document.getElementById('btn-snap').addEventListener('click', capturePhoto);
  document.getElementById('btn-manual-entry').addEventListener('click', showManualView);
  document.getElementById('choice-cancel').addEventListener('click', closeAddModal);

  /* Add Modal – backdrop closes modal */
  document.getElementById('modal-add-backdrop').addEventListener('click', closeAddModal);

  /* Add Modal – save/cancel in form view */
  document.getElementById('modal-save').addEventListener('click', saveItem);
  document.getElementById('modal-cancel').addEventListener('click', closeAddModal);

  /* Detail Modal – edit/delete */
  document.getElementById('detail-edit').addEventListener('click', e => {
    const id = e.target.dataset.id;
    closeDetail();
    openAddModal(Storage.getItemById(id));
  });
  document.getElementById('detail-delete').addEventListener('click', e => {
    const id   = e.target.dataset.id;
    const item = Storage.getItemById(id);
    if (!item) return;
    if (!confirm(`Remove "${item.name}" from your fridge?`)) return;
    Storage.deleteItem(id);
    closeDetail();
    renderList();
    showToast('Item removed', 'success');
  });
  document.getElementById('modal-detail-backdrop').addEventListener('click', closeDetail);

  /* Settings Modal */
  document.getElementById('settings-cancel').addEventListener('click', closeSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.getElementById('modal-settings-backdrop').addEventListener('click', closeSettings);
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-clear-expired').addEventListener('click', clearExpired);

  /* Quantity +/- */
  document.getElementById('qty-up').addEventListener('click', () => {
    const inp = document.getElementById('form-qty');
    inp.value = Math.min(99, parseInt(inp.value || 1, 10) + 1);
  });
  document.getElementById('qty-down').addEventListener('click', () => {
    const inp = document.getElementById('form-qty');
    inp.value = Math.max(1, parseInt(inp.value || 1, 10) - 1);
  });

  /* Keyboard shortcut – Escape closes modals */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAddModal();
      closeDetail();
      closeSettings();
    }
  });

  /* Permanent photo-input change handler (iOS-safe — input is always in the DOM) */
  document.getElementById('photo-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same photo can be re-selected
    handlePhotoFile(file);
  });

  /* Initial render */
  renderList();

  /* On-open notification check */
  if (shouldRunNotifCheck()) checkAndNotify();
});
