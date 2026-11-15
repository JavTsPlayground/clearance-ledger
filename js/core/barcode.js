// Barcode helpers and lookup links. Pure.

/** Returns the digits when `value` is a valid UPC-A, EAN-8 or EAN-13 (check digit verified), else ''. */
export function validCode(value) {
  const t = String(value == null ? '' : value).replace(/\D/g, '');
  if (![8, 12, 13].includes(t.length)) return '';
  const d = t.split('').map(Number);
  const check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check ? t : '';
}

const enc = encodeURIComponent;

/** Search links. Amazon price and eBay sold prices must be read by the person, never guessed. */
export function lookupLinks(term) {
  const q = enc(String(term || '').trim());
  return {
    amazon: `https://www.amazon.com/s?k=${q}`,
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`,
  };
}
