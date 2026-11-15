// Pure money math. No DOM, no storage, no network.

export const DEFAULT_RULES = Object.freeze({
  targetRoi: 40,   // minimum return on cost, percent
  minProfit: 5,    // minimum profit per item, dollars
  tax: 6.35,       // sales tax paid at the register, percent (Connecticut)
  hours: 0,        // hours spent so far, for profit per hour
  fees: {
    ebay:    { name: 'eBay',                 pct: 13.6, fix: 0.4 },
    amazon:  { name: 'Amazon FBA',           pct: 15,   fix: 4 },
    mercari: { name: 'Mercari',              pct: 12.9, fix: 0.5 },
    fbm:     { name: 'FB Marketplace, local', pct: 0,    fix: 0 },
  },
});

export const PLATFORMS = Object.keys(DEFAULT_RULES.fees);

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const nonNeg = (v) => Math.max(0, num(v));

export const toNumber = num;

/** Fresh rules object, optionally overlaid with saved values. Unknown keys are dropped. */
export function mergeRules(saved) {
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  if (!saved || typeof saved !== 'object') return rules;
  for (const k of ['targetRoi', 'minProfit', 'tax', 'hours']) {
    if (typeof saved[k] === 'number' && Number.isFinite(saved[k]) && saved[k] >= 0) rules[k] = saved[k];
  }
  if (saved.fees && typeof saved.fees === 'object') {
    for (const p of PLATFORMS) {
      const f = saved.fees[p];
      if (f && typeof f === 'object') {
        rules.fees[p].pct = nonNeg(f.pct);
        rules.fees[p].fix = nonNeg(f.fix);
      }
    }
  }
  return rules;
}

export function feeOf(price, plat, rules) {
  const f = rules.fees[plat] || rules.fees.ebay;
  return price > 0 ? (price * f.pct) / 100 + f.fix : 0;
}

/**
 * Profit breakdown for one item.
 * cost = shelf price, sell = price it sells for, ship = shipping and prep cost.
 */
export function calc({ cost, sell, ship, plat }, rules) {
  const c = nonNeg(cost), s = nonNeg(sell), sh = nonNeg(ship);
  const tax = (c * rules.tax) / 100;
  const fee = feeOf(s, plat, rules);
  const all = c + tax;
  const net = s - fee - sh - all;
  return {
    tax, fee, all, net,
    roi: all > 0 ? net / all : 0,
    margin: s > 0 ? net / s : 0,
  };
}

/** 'buy' clears both rules, 'thin' makes some money, 'pass' does not. */
export function verdict(result, rules) {
  if (result.net >= rules.minProfit && result.roi * 100 >= rules.targetRoi) return 'buy';
  if (result.net > 0 && result.roi * 100 >= rules.targetRoi / 2) return 'thin';
  return 'pass';
}

/** The most to pay on the shelf and still clear both rules. 0 when nothing clears. */
export function maxPay({ sell, ship, plat }, rules) {
  const s = nonNeg(sell);
  if (s <= 0) return 0;
  const avail = s - feeOf(s, plat, rules) - nonNeg(ship);
  const allIn = Math.min(avail - rules.minProfit, avail / (1 + rules.targetRoi / 100));
  return allIn > 0 ? allIn / (1 + rules.tax / 100) : 0;
}
