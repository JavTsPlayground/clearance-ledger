// Item model: categories, normalising stored data, per-item and haul totals.
import { calc, toNumber, PLATFORMS } from './calc.js';

export const CATS = Object.freeze({
  beauty:    { label: 'Beauty & skincare',   ship: 4.5 },
  fragrance: { label: 'Candles & fragrance', ship: 6 },
  toys:      { label: 'Toys & games',        ship: 8 },
  kitchen:   { label: 'Kitchen',             ship: 9 },
  home:      { label: 'Home decor',          ship: 10 },
  shoes:     { label: 'Shoes & apparel',     ship: 12 },
  pet:       { label: 'Pet',                 ship: 6 },
  fitness:   { label: 'Fitness',             ship: 9 },
});
export const CAT_KEYS = Object.keys(CATS);
export const STATUSES = ['bought', 'listed', 'sold'];

export function defaultShip(cat, plat) {
  if (plat === 'fbm') return 0;
  if (plat === 'amazon') return 1.5;
  return (CATS[cat] || CATS.home).ship;
}

let seq = 0;
export function newId(now = Date.now()) {
  seq = (seq + 1) % 1296;
  return 'i' + now.toString(36) + seq.toString(36).padStart(2, '0');
}

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

/** Always returns a safe item. Anything unknown falls back to a safe default. */
export function normItem(raw, fallbackId) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const id = clip(d.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || fallbackId || newId();
  return {
    id,
    name: clip(d.name, 120) || 'Untitled',
    cat: CATS[d.cat] ? d.cat : 'home',
    plat: PLATFORMS.includes(d.plat) ? d.plat : 'ebay',
    cost: Math.max(0, toNumber(d.cost)),
    sell: Math.max(0, toNumber(d.sell)),
    ship: Math.max(0, toNumber(d.ship)),
    status: STATUSES.includes(d.status) ? d.status : 'bought',
    soldPrice: Math.max(0, toNumber(d.soldPrice)),
    code: /^\d{8,14}$/.test(String(d.code || '')) ? String(d.code) : '',
    createdAt: toNumber(d.createdAt),
    example: d.example === true,
  };
}

/** Profit for one item. A sold item uses what it really sold for. */
export function itemCalc(item, rules) {
  const sold = item.status === 'sold';
  const price = sold && item.soldPrice > 0 ? item.soldPrice : item.sell;
  return { ...calc({ ...item, sell: price }, rules), sold, price };
}

export function summarize(items, rules) {
  let stock = 0, made = 0, pending = 0, hasExample = false;
  for (const it of items) {
    const c = itemCalc(it, rules);
    if (it.example) hasExample = true;
    if (it.status === 'sold') made += c.net;
    else { stock += c.all; pending += c.net; }
  }
  return {
    stock, made, pending, hasExample,
    perHour: rules.hours > 0 ? made / rules.hours : null,
    open: items.filter((i) => i.status !== 'sold').length,
  };
}

/** Marked sample rows so the app opens in a working state. They are never presented as real. */
export function exampleItems(now = Date.now()) {
  const row = (n, d) => normItem({ id: 'ex' + n, createdAt: now - n, example: true, soldPrice: 0, status: 'bought', ...d });
  return [
    row(1, { name: 'Grapefruit body wash set', cat: 'beauty',    plat: 'ebay', cost: 5.99,  sell: 19.99, ship: 4.5 }),
    row(2, { name: 'Honey face mask trio',     cat: 'beauty',    plat: 'ebay', cost: 4.99,  sell: 14.99, ship: 4 }),
    row(3, { name: 'Eucalyptus spa candle',    cat: 'fragrance', plat: 'ebay', cost: 6.99,  sell: 22,    ship: 6 }),
    row(4, { name: '10in nonstick pan',        cat: 'kitchen',   plat: 'fbm',  cost: 12.99, sell: 24,    ship: 0, status: 'listed' }),
    row(5, { name: 'Sealed building set',      cat: 'toys',      plat: 'ebay', cost: 9.99,  sell: 24.99, ship: 7, status: 'sold', soldPrice: 23.5 }),
  ];
}
