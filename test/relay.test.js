import test from 'node:test';
import assert from 'node:assert/strict';
import { lookup } from '../relay/worker.js';

function withFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => handler(String(u), init || {});
  return fn().finally(() => { globalThis.fetch = real; });
}
const ok = (obj) => ({ ok: true, status: 200, json: async () => obj });
const no = () => ({ ok: false, status: 404, json: async () => ({}) });

test('relay: merges UPCitemdb prices with an Open Facts name and eBay listings', async () => {
  const r = await withFetch((u) => {
    if (u.includes('upcitemdb')) return ok({ items: [{ title: '', offers: [{ merchant: 'Amazon', price: 10, condition: 'New' }], lowest_recorded_price: 8, highest_recorded_price: 15 }] });
    if (u.includes('openbeautyfacts')) return ok({ status: 1, product: { product_name: 'Lip Balm', brands: 'Acme, X', categories: 'Beauty' } });
    if (u.includes('oauth2/token')) return ok({ access_token: 't' });
    if (u.includes('item_summary/search')) return ok({ itemSummaries: [{ price: { value: '11.50' }, condition: 'New' }, { price: { value: '5' }, condition: 'Used' }] });
    return no();
  }, () => lookup('4006381333931', { EBAY_APP_ID: 'a', EBAY_CERT_ID: 'b' }));
  const it = r.items[0];
  assert.equal(it.title, 'Lip Balm');
  assert.equal(it.brand, 'Acme');
  assert.equal(it.offers.length, 3);
  assert.equal(it.lowest_recorded_price, 8);
});

test('relay: works with no eBay keys, and reports nothing when no source knows the barcode', async () => {
  const none = await withFetch(() => no(), () => lookup('4006381333931', {}));
  assert.equal(none.total, 0);
  const named = await withFetch((u) => (u.includes('openfoodfacts') ? ok({ status: 1, product: { product_name: 'Cereal' } }) : no()), () => lookup('4006381333931', {}));
  assert.equal(named.items[0].title, 'Cereal');
  assert.deepEqual(named.items[0].offers, []);
});
