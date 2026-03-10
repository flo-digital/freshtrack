/* ============================================
   STORAGE – localStorage wrapper for FreshTrack
   ============================================ */

const Storage = (() => {
  const ITEMS_KEY  = 'freshtrack_items';
  const CONFIG_KEY = 'freshtrack_config';

  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
    } catch { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  }

  function addItem(item) {
    const items = getItems();
    item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    item.addedDate = new Date().toISOString().slice(0, 10);
    items.push(item);
    saveItems(items);
    return item;
  }

  function updateItem(id, updates) {
    const items = getItems();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...updates };
    saveItems(items);
    return items[idx];
  }

  function deleteItem(id) {
    const items = getItems().filter(i => i.id !== id);
    saveItems(items);
  }

  function getItemById(id) {
    return getItems().find(i => i.id === id) || null;
  }

  function getConfig() {
    try {
      return {
        warnDays: 2,
        checkTime: 'on-open',
        lastNotifCheck: null,
        ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
      };
    } catch { return { warnDays: 2, checkTime: 'on-open', lastNotifCheck: null }; }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function exportJSON() {
    return JSON.stringify({ items: getItems(), config: getConfig() }, null, 2);
  }

  return { getItems, addItem, updateItem, deleteItem, getItemById, getConfig, saveConfig, exportJSON };
})();
