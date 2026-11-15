// Turns a UPCitemdb lookup reply into the facts the Check tab needs. Pure.
// Prices here are current online listing prices (Amazon, eBay, Walmart...), NOT sold prices.

const price = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : 0; };
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

export function median(nums) {
  const a = nums.filter((n) => n > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 100) / 100;
}

/** Google product taxonomy text -> one of our category keys, or ''. */
export function mapCategory(text) {
  const t = String(text || '').toLowerCase();
  const rules = [
    ['fragrance', /candle|fragrance|perfume|cologne|incense|air freshener/],
    ['beauty', /beauty|skin|hair|cosmetic|makeup|personal care|bath|body|soap|lotion|health/],
    ['toys', /toy|game|puzzle|doll|hobby|craft/],
    ['kitchen', /kitchen|cookware|bakeware|dining|appliance|food storage|cutlery/],
    ['shoes', /shoe|apparel|clothing|footwear|handbag|accessor|jewel|watch/],
    ['pet', /\bpet|animal|dog|cat\b/],
    ['fitness', /fitness|exercise|sport|outdoor|yoga|athletic/],
    ['home', /home|decor|furniture|garden|bedding|storage|lighting|rug|frame/],
  ];
  for (const [key, re] of rules) if (re.test(t)) return key;
  return '';
}

/**
 * Reads a lookup reply. Returns null when there is no item.
 * estimate = median of new-condition offers; range comes from the item's recorded low and high.
 */
export function parseLookup(reply) {
  const item = reply && Array.isArray(reply.items) ? reply.items[0] : null;
  if (!item || typeof item !== 'object') return null;
  const offers = (Array.isArray(item.offers) ? item.offers : [])
    .map((o) => ({
      merchant: clip(o && (o.merchant || o.domain), 40),
      price: price(o && o.price),
      used: /used|refurb/i.test(String(o && o.condition)),
    }))
    .filter((o) => o.price > 0);
  const fresh = offers.filter((o) => !o.used);
  const basis = fresh.length ? fresh : offers;
  const low = price(item.lowest_recorded_price);
  const high = price(item.highest_recorded_price);
  let estimate = median(basis.map((o) => o.price));
  if (!estimate && low && high) estimate = Math.round(((low + high) / 2) * 100) / 100;
  const brand = clip(item.brand, 60);
  let name = clip(item.title, 120);
  if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
  return {
    name,
    brand,
    cat: mapCategory(item.category),
    estimate,
    low: low || (basis.length ? Math.min(...basis.map((o) => o.price)) : 0),
    high: high || (basis.length ? Math.max(...basis.map((o) => o.price)) : 0),
    offers: basis.slice(0, 5),
    offerCount: offers.length,
  };
}
