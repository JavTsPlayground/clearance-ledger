import test from 'node:test';
import assert from 'node:assert/strict';
import { calc, verdict, maxPay, mergeRules, feeOf, DEFAULT_RULES } from '../js/core/calc.js';
import { normItem, itemCalc, summarize, exampleItems, defaultShip } from '../js/core/items.js';
import { planBundles } from '../js/core/bundles.js';

const rules = mergeRules();
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('calc: receipt line items add up', () => {
  const c = calc({ cost: 5.99, sell: 19.99, ship: 4.5, plat: 'ebay' }, rules);
  close(c.tax, 5.99 * 0.0635);
  close(c.fee, 19.99 * 0.136 + 0.4);
  close(c.net, 19.99 - c.fee - 4.5 - 5.99 - c.tax);
  close(c.roi, c.net / (5.99 + c.tax));
  close(c.margin, c.net / 19.99);
});

test('calc: free local sale has no fee and no fixed fee', () => {
  assert.equal(feeOf(24, 'fbm', rules), 0);
  assert.equal(feeOf(0, 'ebay', rules), 0);
});

test('calc: bad input never produces NaN', () => {
  const c = calc({ cost: 'abc', sell: undefined, ship: -3, plat: 'nope' }, rules);
  for (const v of Object.values(c)) assert.ok(Number.isFinite(v));
});

test('verdict: buy, thin, pass', () => {
  assert.equal(verdict(calc({ cost: 5.99, sell: 19.99, ship: 4.5, plat: 'ebay' }, rules), rules), 'buy');
  assert.equal(verdict(calc({ cost: 10, sell: 21, ship: 4.5, plat: 'ebay' }, rules), rules), 'thin');
  assert.equal(verdict(calc({ cost: 15, sell: 18, ship: 4.5, plat: 'ebay' }, rules), rules), 'pass');
});

test('maxPay: paying it clears both rules, paying a bit more does not', () => {
  for (const sell of [12, 19.99, 35, 80]) {
    for (const plat of ['ebay', 'amazon', 'mercari', 'fbm']) {
      const ship = plat === 'fbm' ? 0 : 5;
      const m = maxPay({ sell, ship, plat }, rules);
      if (m <= 0) continue;
      const at = calc({ cost: m, sell, ship, plat }, rules);
      assert.ok(at.net >= rules.minProfit - 1e-9, `profit at max ${sell}/${plat}`);
      assert.ok(at.roi * 100 >= rules.targetRoi - 1e-9, `roi at max ${sell}/${plat}`);
      const over = calc({ cost: m + 0.25, sell, ship, plat }, rules);
      assert.notEqual(verdict(over, rules), 'buy');
    }
  }
});

test('maxPay: 0 when the sale cannot clear the rules, and when sell price is empty', () => {
  assert.equal(maxPay({ sell: 6, ship: 5, plat: 'ebay' }, rules), 0);
  assert.equal(maxPay({ sell: 0, ship: 0, plat: 'ebay' }, rules), 0);
});

test('mergeRules: drops unknown keys, rejects negatives, keeps saved fees', () => {
  const r = mergeRules({ targetRoi: 55, minProfit: -2, bogus: 1, fees: { ebay: { pct: 10, fix: 0.3 }, hax: { pct: 99 } } });
  assert.equal(r.targetRoi, 55);
  assert.equal(r.minProfit, DEFAULT_RULES.minProfit);
  assert.equal(r.fees.ebay.pct, 10);
  assert.ok(!('hax' in r.fees) && !('bogus' in r));
});

test('normItem: unknown values fall back to safe ones', () => {
  const it = normItem({ id: 'a b/c', name: '  ', cat: 'weapons', plat: 'x', cost: -5, sell: 'z', status: 'lost', code: '12' });
  assert.equal(it.id, 'abc');
  assert.equal(it.name, 'Untitled');
  assert.equal(it.cat, 'home');
  assert.equal(it.plat, 'ebay');
  assert.equal(it.cost, 0);
  assert.equal(it.sell, 0);
  assert.equal(it.status, 'bought');
  assert.equal(it.code, '');
});

test('itemCalc: a sold item uses the real sold price', () => {
  const it = normItem({ cost: 10, sell: 30, ship: 5, plat: 'ebay', status: 'sold', soldPrice: 20 });
  const c = itemCalc(it, rules);
  assert.equal(c.price, 20);
  assert.equal(c.sold, true);
});

test('summarize: stock, made, pending and per hour', () => {
  const items = exampleItems(1000);
  const s = summarize(items, { ...rules, hours: 2 });
  assert.equal(s.open, 4);
  assert.ok(s.hasExample);
  assert.ok(s.stock > 0 && s.pending > 0);
  close(s.perHour, s.made / 2);
  assert.equal(summarize(items, rules).perHour, null);
});

test('defaultShip: local pickup is free, FBA is inbound only', () => {
  assert.equal(defaultShip('kitchen', 'fbm'), 0);
  assert.equal(defaultShip('kitchen', 'amazon'), 1.5);
  assert.equal(defaultShip('toys', 'ebay'), 8);
});

test('bundles: the example haul pairs skincare and the candle, and sold items are ignored', () => {
  const { bundles, hunt } = planBundles(exampleItems(1000), rules);
  const names = bundles.map((b) => b.rule.id);
  assert.ok(names.includes('skin-set'));
  assert.ok(names.includes('spa-box'));
  assert.ok(!names.includes('toy-lot'), 'the toy is sold, so no toy lot');
  for (let i = 1; i < bundles.length; i++) assert.ok(bundles[i - 1].delta >= bundles[i].delta);
  assert.ok(hunt.length <= 5);
});

test('bundles: lot economics use one shipment and one fee', () => {
  const items = exampleItems(1000).filter((i) => i.cat === 'beauty');
  const { bundles } = planBundles(items, rules);
  const b = bundles.find((x) => x.rule.id === 'skin-set');
  close(b.sell, (19.99 + 14.99) * 1.15);
  close(b.ship, 4.5 + 1.5);
  const apart = items.reduce((s, i) => s + calc(i, rules).net, 0);
  close(b.apart, apart);
  assert.equal(b.worth, b.delta >= 2);
});

test('bundles: a lone item produces a hunt suggestion, not a bundle', () => {
  const only = exampleItems(1000).filter((i) => i.cat === 'kitchen');
  const { bundles, hunt } = planBundles(only, rules);
  assert.equal(bundles.length, 0);
  assert.ok(hunt.some((h) => h.rule.id === 'kitchen-lot' && h.same));
});
