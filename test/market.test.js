import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLookup, median, mapCategory } from '../js/core/market.js';
import { createMarket, MarketError } from '../js/services/market.js';

const reply = { code: 'OK', items: [{
  title: 'Honey Lip Balm 4 Pack', brand: "Burt's Bees", category: 'Health & Beauty > Personal Care > Cosmetics',
  lowest_recorded_price: 6.5, highest_recorded_price: 14.99,
  offers: [
    { merchant: 'Amazon', price: 9.99, condition: 'New' },
    { merchant: 'Walmart', price: 8.49, condition: 'New' },
    { merchant: 'eBay', price: 12.5, condition: 'New' },
    { merchant: 'eBay', price: 3, condition: 'Used' },
    { merchant: 'Bad', price: 'x', condition: 'New' },
  ] }] };

test('parseLookup: median of new offers, brand added, category mapped, junk dropped', () => {
  const m = parseLookup(reply);
  assert.equal(m.estimate, 9.99);
  assert.equal(m.name, "Burt's Bees Honey Lip Balm 4 Pack");
  assert.equal(m.cat, 'beauty');
  assert.equal(m.low, 6.5);
  assert.equal(m.high, 14.99);
  assert.equal(m.offers.length, 3);
  assert.ok(m.offers.every((o) => !o.used));
});

test('parseLookup: nothing found, no offers, and hostile text', () => {
  assert.equal(parseLookup({ items: [] }), null);
  assert.equal(parseLookup(null), null);
  assert.equal(parseLookup('x'), null);
  const m = parseLookup({ items: [{ title: '<img src=x onerror=1>', lowest_recorded_price: 4, highest_recorded_price: 8 }] });
  assert.equal(m.estimate, 6);
  assert.equal(m.name, '<img src=x onerror=1>'); // kept as plain text; the UI inserts text only
});

test('median and mapCategory', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
  assert.equal(mapCategory('Home & Garden > Candles'), 'fragrance');
  assert.equal(mapCategory('Toys & Games'), 'toys');
  assert.equal(mapCategory('Vehicles'), '');
});

const res = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj });

test('market.lookup: validates the code, calls once, and caches', async () => {
  let n = 0, url = '';
  const market = createMarket({ fetch: async (u) => { n++; url = u; return res(reply); } });
  await assert.rejects(() => market.lookup('123'), (e) => e.code === 'bad_code');
  const a = await market.lookup('4006381333931');
  const b = await market.lookup('4006381333931');
  assert.equal(a.estimate, 9.99);
  assert.equal(a, b);
  assert.equal(n, 1);
  assert.match(url, /upc=4006381333931$/);
});

test('market.lookup: not found, rate limit, server error, offline, cancel, timeout', async () => {
  const code = '4006381333931';
  assert.equal(await createMarket({ fetch: async () => res({}, 404) }).lookup(code), null);
  await assert.rejects(() => createMarket({ fetch: async () => res({}, 429) }).lookup(code), (e) => e.code === 'limit');
  await assert.rejects(() => createMarket({ fetch: async () => res({}, 500) }).lookup(code), (e) => e.code === 'server');
  await assert.rejects(() => createMarket({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).lookup(code), (e) => e instanceof MarketError && e.code === 'unreachable');
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => createMarket({ fetch: async () => res(reply) }).lookup(code, ctl.signal), (e) => e.code === 'cancelled');
  const slow = createMarket({ fetch: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  const c2 = new AbortController();
  const p = slow.lookup(code, c2.signal);
  c2.abort();
  await assert.rejects(() => p, (e) => e.code === 'cancelled');
});

test('market.lookup: uses the relay address when one is saved', async () => {
  let url = '';
  const market = createMarket({ fetch: async (u) => { url = u; return res(reply); }, getSettings: () => ({ lookupUrl: 'https://relay.example.workers.dev' }) });
  await market.lookup('4006381333931');
  assert.equal(url, 'https://relay.example.workers.dev?upc=4006381333931');
});
