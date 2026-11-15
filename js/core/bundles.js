// Bundle planner. Pure: takes items and rules, returns ideas. The lift values are planning
// estimates, not measured data, and the UI says so.
import { calc } from './calc.js';

export const BUNDLE_RULES = Object.freeze([
  { id: 'skin-set',    cats: ['beauty', 'beauty'],       name: 'Skincare gift set',  prem: 15, note: 'Matching scents or brands read as a set. Add a bag or ribbon.' },
  { id: 'spa-box',     cats: ['beauty', 'fragrance'],    name: 'Spa night gift box', prem: 18, note: 'A candle with bath or skincare is a common gift pairing.' },
  { id: 'cozy',        cats: ['fragrance', 'home'],      name: 'Cozy home set',      prem: 12, note: 'Candle plus decor works as a housewarming gift.' },
  { id: 'kitchen-lot', cats: ['kitchen', 'kitchen'],     name: 'Kitchen starter lot', prem: 8, note: 'Good for first apartments and dorms.' },
  { id: 'hosting',     cats: ['kitchen', 'home'],        name: 'Hosting set',        prem: 10, note: 'Serveware plus decor for entertaining.' },
  { id: 'toy-lot',     cats: ['toys', 'toys'],           name: 'Same-line toy lot',  prem: 5,  note: 'Sealed sets with solid sold comps usually do better alone. Lots suit slow movers.' },
  { id: 'pet-kit',     cats: ['pet', 'pet'],             name: 'Pet care bundle',    prem: 8,  note: 'Grooming plus treats or toys for one pet type.' },
  { id: 'workout',     cats: ['fitness', 'fitness'],     name: 'Home workout kit',   prem: 10, note: 'Bands, mat and weights sell as a starter kit.' },
]);

const EXTRA_ITEM_SHIP = 1.5; // added per extra item in one box
const BUNDLE_MIN_GAIN = 2;   // dollars the lot must beat selling apart by

const byPrice = (a, b) => b.sell - a.sell;

function makeBundle(rule, list, rules) {
  const top = [...list].sort(byPrice)[0];
  const plat = top.plat;
  const apart = list.reduce((s, i) => s + calc(i, rules).net, 0);
  const sell = list.reduce((s, i) => s + i.sell, 0) * (1 + rule.prem / 100);
  const ship = Math.max(...list.map((i) => i.ship)) + EXTRA_ITEM_SHIP * (list.length - 1);
  const cost = list.reduce((s, i) => s + i.cost, 0);
  const lot = calc({ cost, sell, ship, plat }, rules).net;
  return { rule, items: list, apart, lot, sell, ship, plat, delta: lot - apart, worth: lot - apart >= BUNDLE_MIN_GAIN };
}

/** Returns { bundles: best first, hunt: what to look for next }. Sold items are ignored. */
export function planBundles(items, rules) {
  const open = items.filter((i) => i.status !== 'sold');
  const bundles = [];
  const hunt = [];
  for (const rule of BUNDLE_RULES) {
    const [a, b] = rule.cats;
    const A = open.filter((i) => i.cat === a).sort(byPrice);
    if (a === b) {
      if (A.length >= 2) bundles.push(makeBundle(rule, A.slice(0, 4), rules));
      else if (A.length === 1) hunt.push({ rule, have: A[0], need: a, same: true });
    } else {
      const B = open.filter((i) => i.cat === b).sort(byPrice);
      if (A.length && B.length) bundles.push(makeBundle(rule, [...A.slice(0, 2), ...B.slice(0, 2)], rules));
      else if (A.length) hunt.push({ rule, have: A[0], need: b, same: false });
      else if (B.length) hunt.push({ rule, have: B[0], need: a, same: false });
    }
  }
  bundles.sort((x, y) => y.delta - x.delta);
  hunt.sort((x, y) => y.rule.prem - x.rule.prem);
  return { bundles, hunt: hunt.slice(0, 5) };
}
