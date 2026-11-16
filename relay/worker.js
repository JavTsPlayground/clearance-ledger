// Cloudflare Worker: one free lookup that asks several free sources and answers in a single shape.
//  - UPCitemdb (free trial): name, brand, category, online listing prices
//  - Open Food / Beauty / Products / Pet Food Facts (free, no key): names for items UPCitemdb lacks
//  - eBay Browse (free key, optional): current eBay listing prices for the barcode
// Set EBAY_APP_ID and EBAY_CERT_ID as Worker secrets to turn eBay on. Without them the rest still works.
// The reply matches UPCitemdb's shape, so the app reads it unchanged.
const ALLOWED_ORIGIN = 'https://javtsplayground.github.io';
const UPCITEMDB = 'https://api.upcitemdb.com/prod/trial/lookup';
const OPEN_FACTS = ['https://world.openfoodfacts.org', 'https://world.openbeautyfacts.org', 'https://world.openproductsfacts.org', 'https://world.openpetfoodfacts.org'];

const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };

async function getJson(url, init) {
  try { const r = await fetch(url, init); return r.ok ? await r.json() : null; } catch { return null; }
}

async function ebayToken(env) {
  if (!env.EBAY_APP_ID || !env.EBAY_CERT_ID) return '';
  try {
    const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${env.EBAY_APP_ID}:${env.EBAY_CERT_ID}`) },
      body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    });
    return r.ok ? (await r.json()).access_token || '' : '';
  } catch { return ''; }
}

async function ebayOffers(upc, env) {
  const token = await ebayToken(env);
  if (!token) return [];
  const j = await getJson(`https://api.ebay.com/buy/browse/v1/item_summary/search?gtin=${upc}&limit=50`, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
  return ((j && j.itemSummaries) || [])
    .map((i) => ({ merchant: 'eBay', price: money(i.price && i.price.value), condition: /new/i.test(String(i.condition)) ? 'New' : 'Used' }))
    .filter((o) => o.price > 0);
}

export async function lookup(upc, env = {}) {
  const [price, openReplies, ebay] = await Promise.all([
    getJson(`${UPCITEMDB}?upc=${upc}`),
    Promise.all(OPEN_FACTS.map((b) => getJson(`${b}/api/v2/product/${upc}.json?fields=product_name,product_name_en,brands,categories`))),
    ebayOffers(upc, env),
  ]);
  const item = (price && price.items && price.items[0]) || null;
  const open = openReplies.map((r) => r && r.status === 1 && r.product).find((p) => p && (p.product_name || p.product_name_en));
  const title = (item && item.title) || (open && (open.product_name || open.product_name_en)) || '';
  if (!title && !ebay.length) return { code: 'OK', total: 0, items: [] };
  return { code: 'OK', total: 1, items: [{
    title,
    brand: (item && item.brand) || (open && String(open.brands || '').split(',')[0].trim()) || '',
    category: (item && item.category) || (open && open.categories) || '',
    lowest_recorded_price: item && item.lowest_recorded_price,
    highest_recorded_price: item && item.highest_recorded_price,
    offers: [...((item && item.offers) || []), ...ebay],
  }] };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN, Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return json({}, 405, cors);
    const upc = new URL(request.url).searchParams.get('upc') || '';
    if (!/^\d{8}$|^\d{12,13}$/.test(upc)) return json({ code: 'INVALID_UPC' }, 400, cors);
    return json(await lookup(upc, env), 200, cors);
  },
};
