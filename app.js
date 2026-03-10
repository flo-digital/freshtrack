/* ============================================
   APP – FreshTrack Main Application Logic
   ============================================ */

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
   scanPhotoRobust  — revised pipeline

   Key insight: EXIF rotation is best handled by the BROWSER via a plain
   <img> element. Safari 14+ / Chrome 80+ automatically apply EXIF when:
     • Displaying an <img>              → naturalWidth/Height are rotated
     • BarcodeDetector.detect(imgEl)   → sees correctly-oriented pixels
     • ctx.drawImage(imgEl, …)         → canvas gets rotated pixels

   So the safest pipeline is:
     1. QuaggaJS  — pass the original file as an object URL directly;
                    Quagga loads it as <img> (EXIF applied), locate:true
                    searches the whole image, multiple patchSizes tried
     2. BarcodeDetector — detect(imgEl) first, then canvas rotations
     3. ZXing     — canvas rotations from the img element
     4. Html5Qrcode — original file as last resort
   ════════════════════════════════════════════════════════════════════ */
async function scanPhotoRobust(file) {
  console.log('[FreshTrack] file:', file.name, file.type, 'size:', file.size);

  // Object URL lets libraries load the file as-is (no size limit issues,
  // browser applies EXIF when the library creates its own <img> element)
  const objURL = URL.createObjectURL(file);

  try {

    // ── Strategy 1: QuaggaJS (original file, multiple patch sizes) ───────
    if (typeof Quagga !== 'undefined') {
      console.log('[FreshTrack] Quagga available, trying...');
      for (const [size, patch] of [[1600,'large'],[1600,'medium'],[800,'large'],[800,'medium']]) {
        try {
          const code = await quaggaDecode(objURL, size, patch);
          console.log(`[FreshTrack] Quagga found (size=${size} patch=${patch}):`, code);
          return code;
        } catch(_) {}
      }
      console.log('[FreshTrack] Quagga found nothing');
    } else {
      console.warn('[FreshTrack] Quagga NOT available (load failed?)');
    }

    // Load into <img> — browser applies EXIF rotation automatically
    const img = await loadImg(objURL);
    const nw = img.naturalWidth, nh = img.naturalHeight;
    console.log('[FreshTrack] img natural size (EXIF corrected by browser):', nw, '×', nh);

    // Scale for canvas — cap at 1920px on longest side
    const scale = Math.min(1, 1920 / Math.max(nw, nh));
    const w = Math.round(nw * scale);
    const h = Math.round(nh * scale);

    // ── Strategy 2: BarcodeDetector ───────────────────────────────────────
    if ('BarcodeDetector' in window) {
      console.log('[FreshTrack] BarcodeDetector available, trying...');
      let det;
      try {
        const fmts = await BarcodeDetector.getSupportedFormats();
        console.log('[FreshTrack] formats:', fmts);
        det = new BarcodeDetector({ formats: fmts.length ? fmts : ['ean_13','ean_8','upc_a','upc_e','code_128'] });
      } catch(_) { try { det = new BarcodeDetector(); } catch(_) {} }

      if (det) {
        // First pass: detect directly from the <img> element
        // (no canvas — browser has already applied EXIF)
        try {
          const r = await det.detect(img);
          if (r.length) { console.log('[FreshTrack] BD direct hit:', r[0].rawValue); return r[0].rawValue; }
        } catch(_) {}

        // Second pass: canvas at all 4 rotations
        for (const angle of [0, 90, 180, 270]) {
          try {
            const c = makeRotatedCanvas(img, angle, w, h);
            const r = await det.detect(c);
            if (r.length) { console.log(`[FreshTrack] BD canvas ${angle}°:`, r[0].rawValue); return r[0].rawValue; }
          } catch(_) {}
        }
        console.log('[FreshTrack] BarcodeDetector found nothing');
      }
    } else {
      console.warn('[FreshTrack] BarcodeDetector NOT available');
    }

    // ── Strategy 3: ZXing (canvas rotations from img) ─────────────────────
    const zx = window.ZXing;
    if (zx?.BrowserMultiFormatReader && zx?.DecodeHintType) {
      console.log('[FreshTrack] ZXing available, trying...');
      const reader = new zx.BrowserMultiFormatReader(new Map([[zx.DecodeHintType.TRY_HARDER, true]]));
      for (const angle of [0, 90, 180, 270]) {
        try {
          const c = makeRotatedCanvas(img, angle, w, h);
          const r = reader.decodeFromCanvas(c);
          if (r) { console.log(`[FreshTrack] ZXing ${angle}°:`, r.getText()); return r.getText(); }
        } catch(_) {}
      }
      console.log('[FreshTrack] ZXing found nothing');
    } else {
      console.warn('[FreshTrack] ZXing NOT available');
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

/* QuaggaJS single-image decode — promisified with 8 s timeout */
function quaggaDecode(src, size, patchSize) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Quagga timeout')), 8000);
    Quagga.decodeSingle({
      src,
      numOfWorkers: 0,
      locate: true,
      inputStream: { size },
      locator:  { patchSize, halfSample: size > 800 },
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
