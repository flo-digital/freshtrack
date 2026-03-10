/* ============================================
   API – Open Food Facts integration
   ============================================ */

const FoodAPI = (() => {
  const BASE = 'https://world.openfoodfacts.org/api/v2/product';

  const FIELDS = 'product_name,brands,categories_tags,image_front_small_url,quantity';

  async function lookupBarcode(barcode) {
    try {
      const res  = await fetch(`${BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`);
      const data = await res.json();

      if (data.status !== 1 || !data.product) return null;

      const p = data.product;
      return {
        name:     p.product_name || p.brands || '',
        brand:    p.brands       || '',
        image:    p.image_front_small_url || '',
        category: mapCategory(p.categories_tags || []),
        quantity: p.quantity || '',
      };
    } catch (err) {
      console.warn('OpenFoodFacts lookup failed:', err);
      return null;
    }
  }

  function mapCategory(tags) {
    const str = tags.join(' ').toLowerCase();
    if (/dairy|milk|yogurt|cheese|cream/.test(str))  return 'dairy';
    if (/meat|fish|seafood|poultry|chicken|beef/.test(str)) return 'meat';
    if (/vegetable|fruit|produce/.test(str))          return 'produce';
    if (/beverage|drink|juice|water|soda/.test(str))  return 'drinks';
    if (/sauce|condiment|dressing|pickle/.test(str))  return 'condiments';
    return 'other';
  }

  return { lookupBarcode };
})();
