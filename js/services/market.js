// Free product lookup by barcode. fetch is injected so this is testable.
// Order: your relay (if saved), else UPCitemdb directly. If that cannot be reached, the Open Facts
// databases give at least a product name. Prices only ever come from listings, never guesses.
import { parseLookup } from '../core/market.js';
import { validCode } from '../core/barcode.js';

export const LOOKUP_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
export const OPEN_FACTS = [
  'https://world.openfoodfacts.org',
  'https://world.openbeautyfacts.org',
  'https://world.openproductsfacts.org',
  'https://world.openpetfoodfacts.org',
];
const TIMEOUT_MS = 10_000;

export class MarketError extends Error {
  constructor(code, message) { super(message); this.name = 'MarketError'; this.code = code; }
}

/** Open Facts reply -> the same shape the price service uses (a name, no offers). */
export function openFactsToItems(reply) {
  const p = reply && reply.status === 1 && reply.product;
  const title = p && String(p.product_name || p.product_name_en || '').trim();
  if (!title) return null;
  return { items: [{ title, brand: String(p.brands || '').split(',')[0].trim(), category: String(p.categories || ''), offers: [] }] };
}

export function createMarket({ fetch: doFetch, getSettings = () => ({}) }) {
  const cache = new Map();

  async function lookup(rawCode, signal) {
    const code = validCode(rawCode);
    if (!code) throw new MarketError('bad_code', 'That is not a valid barcode.');
    if (cache.has(code)) return cache.get(code);

    const ctl = new AbortController();
    let why = '';
    const onAbort = () => { why = 'cancelled'; ctl.abort(); };
    if (signal) {
      if (signal.aborted) throw new MarketError('cancelled', 'Cancelled.');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => { why = 'timeout'; ctl.abort(); }, TIMEOUT_MS);

    async function priceService() {
      const relay = String((getSettings() || {}).lookupUrl || '');
      const res = await doFetch(`${relay || LOOKUP_URL}?upc=${encodeURIComponent(code)}`, { signal: ctl.signal });
      if (res.status === 404) return { found: null };
      if (res.status === 429) throw new MarketError('limit', 'The free price lookup is used up for now (about 100 a day).');
      if (!res.ok) throw new MarketError('server', 'The price lookup had a problem.');
      return { found: parseLookup(await res.json()) };
    }

    async function names() {
      const replies = await Promise.all(OPEN_FACTS.map(async (base) => {
        try {
          const res = await doFetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,categories`, { signal: ctl.signal });
          return res.ok ? openFactsToItems(await res.json()) : null;
        } catch { return null; }
      }));
      const hit = replies.find(Boolean);
      return hit ? parseLookup(hit) : null;
    }

    try {
      let found = null, blocked = null;
      try {
        ({ found } = await priceService());
      } catch (e) {
        if (why) throw e;
        blocked = e;
      }
      if (!found || !found.name) {
        const named = await names();
        if (named) found = found ? { ...found, name: named.name, brand: found.brand || named.brand, cat: found.cat || named.cat } : named;
      }
      if (!found && blocked) throw (blocked instanceof MarketError ? blocked : new MarketError('unreachable', 'Could not reach the price lookup. Check your signal, or type the price.'));
      cache.set(code, found);
      return found;
    } catch (e) {
      if (e instanceof MarketError) throw e;
      if (why === 'cancelled') throw new MarketError('cancelled', 'Cancelled.');
      if (why === 'timeout') throw new MarketError('timeout', 'The price lookup took too long. Type the price for now.');
      throw new MarketError('unreachable', 'Could not reach the price lookup. Check your signal, or type the price.');
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  return { lookup };
}
