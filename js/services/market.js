// Free product lookup by barcode (UPCitemdb trial endpoint, no key). fetch is injected so this is testable.
import { parseLookup } from '../core/market.js';
import { validCode } from '../core/barcode.js';

export const LOOKUP_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const TIMEOUT_MS = 10_000;

export class MarketError extends Error {
  constructor(code, message) { super(message); this.name = 'MarketError'; this.code = code; }
}

export function createMarket({ fetch: doFetch }) {
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
    try {
      const res = await doFetch(`${LOOKUP_URL}?upc=${encodeURIComponent(code)}`, { signal: ctl.signal });
      if (res.status === 404) { cache.set(code, null); return null; }
      if (res.status === 429) throw new MarketError('limit', 'The free lookup is used up for now (about 100 a day). Try again later or type the price.');
      if (!res.ok) throw new MarketError('server', 'The price lookup had a problem. Type the price for now.');
      const found = parseLookup(await res.json());
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
