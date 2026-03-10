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
// A permanent DOM input is required for iOS Safari — dynamically created inputs
// don't reliably fire the 'change' event after the user taps "Use Photo".
function capturePhoto() {
  document.getElementById('photo-input').click();
}

/* Processes the photo file returned by #photo-input */
async function handlePhotoFile(file) {
  if (!file) return;

  // Show scanning state on the Snap card
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
    // Don't reset button — onBarcodeScanned switches to manual view
  } catch (e) {
    console.warn('All scan strategies failed:', e?.message);
    // Reset the snap button back to its original state
    snapBtn.classList.remove('scanning');
    snapBtn.innerHTML = `
      <span class="choice-card-icon">📷</span>
      <span class="choice-card-label">Snap Barcode</span>
      <span class="choice-card-sub">Auto-identify product from barcode</span>`;
    showToast('No barcode found — ensure good lighting and try again', 'error');
  }
}

/* ─────────────────────────────────────────────────────────────────────
   scanPhotoRobust – tries three increasingly capable strategies,
   each at all four rotations (0°, 90°, 180°, 270°) to handle:

   • EXIF orientation (iPhone always records in landscape, rotates via metadata)
   • Phone held in any orientation while taking the photo
   • Barcodes printed on the top/side/bottom of packaging

   Strategy order:
     1. Native BarcodeDetector  – fast, no extra library needed
     2. ZXing (BrowserMultiFormatReader + TRY_HARDER)  – most powerful
     3. Html5Qrcode.scanFile  – last resort
   ───────────────────────────────────────────────────────────────────── */
async function scanPhotoRobust(file) {

  // Step 1: Load image with EXIF rotation applied via createImageBitmap.
  // On iOS Safari 15.4+ and Chrome 85+, { imageOrientation: 'from-image' }
  // reads the EXIF data and rotates the pixel buffer accordingly.
  // Without this, a photo taken in portrait mode appears sideways on canvas
  // and no decoder can read the barcode.
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch(_) {
    bitmap = await createImageBitmap(file); // fallback without EXIF hint
  }

  // Step 2: Downscale large images — 12 MP iPhone photos are 4032×3024.
  // Most decoders work better (and faster) on images ≤ 1920px.
  const MAX_DIM = 1920;
  let { width: w, height: h } = bitmap;
  if (w > MAX_DIM || h > MAX_DIM) {
    const s = MAX_DIM / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const ROTATIONS = [0, 90, 180, 270];

  // ── Strategy 1: Native BarcodeDetector ──────────────────────────────
  if ('BarcodeDetector' in window) {
    let detector;
    try {
      // Use every format the browser supports (don't hand-pick and miss one)
      const supported = await BarcodeDetector.getSupportedFormats();
      detector = new BarcodeDetector({ formats: supported });
    } catch(_) {
      try { detector = new BarcodeDetector(); } catch(_) {}
    }
    if (detector) {
      for (const angle of ROTATIONS) {
        try {
          const canvas = makeRotatedCanvas(bitmap, angle, w, h);
          const results = await detector.detect(canvas);
          if (results.length > 0) {
            console.log(`BarcodeDetector found at ${angle}°:`, results[0].rawValue);
            return results[0].rawValue;
          }
        } catch(_) {}
      }
    }
  }

  // ── Strategy 2: ZXing BrowserMultiFormatReader (TRY_HARDER) ─────────
  // ZXing is much more aggressive in locating barcodes within an image.
  // TRY_HARDER enables exhaustive scanning (slower but far more reliable).
  const zx = window.ZXing;
  if (zx?.BrowserMultiFormatReader && zx?.DecodeHintType) {
    const hints = new Map([[zx.DecodeHintType.TRY_HARDER, true]]);
    const reader = new zx.BrowserMultiFormatReader(hints);
    for (const angle of ROTATIONS) {
      try {
        const canvas = makeRotatedCanvas(bitmap, angle, w, h);
        const result = reader.decodeFromCanvas(canvas);
        if (result) {
          console.log(`ZXing found at ${angle}°:`, result.getText());
          return result.getText();
        }
      } catch(_) {} // ZXing throws NotFoundException — that's expected
    }
  }

  // ── Strategy 3: Html5Qrcode.scanFile ────────────────────────────────
  const tmpId = 'photo-scan-tmp';
  let tmpDiv = document.getElementById(tmpId);
  if (!tmpDiv) {
    tmpDiv = document.createElement('div');
    tmpDiv.id = tmpId;
    tmpDiv.style.cssText = 'position:fixed;top:-600px;left:0;width:300px;height:300px;opacity:0;pointer-events:none;overflow:hidden';
    document.body.appendChild(tmpDiv);
  }
  try {
    const scanner = new Html5Qrcode(tmpId);
    const barcode = await scanner.scanFile(file, false);
    console.log('Html5Qrcode found:', barcode);
    return barcode;
  } catch(_) {}

  throw new Error('No barcode detected after all strategies');
}

/* Build a canvas from a bitmap at the given rotation angle */
function makeRotatedCanvas(source, angleDeg, w, h) {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  // For 90° / 270°, width and height swap
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
