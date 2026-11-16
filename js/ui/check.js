// Check tab: scan or photograph an item, enter the prices, see the verdict.
import { calc, verdict, maxPay, PLATFORMS } from '../core/calc.js';
import { CATS, CAT_KEYS, defaultShip } from '../core/items.js';
import { money, pct } from '../core/format.js';
import { lookupLinks } from '../core/barcode.js';
import { h, replace, labelled } from './dom.js';
import { openScanner } from './scan.js';

const num = (el) => { const n = parseFloat(el.value); return Number.isFinite(n) ? Math.max(0, n) : 0; };

export function mountCheck(root, { store, ollama, camera, market, link, toast, go }) {
  const sample = store.firstRun; // first run opens with marked sample numbers
  let shipDirty = false, sellAuto = false, found = null, abort = null;

  const name = h('input', { id: 'f-name', type: 'text', autocomplete: 'off', autocapitalize: 'words', placeholder: 'Brand and product', value: sample ? 'Grapefruit body wash set' : '' });
  const cat = h('select', { id: 'f-cat' }, CAT_KEYS.map((k) => h('option', { value: k }, CATS[k].label)));
  const plat = h('select', { id: 'f-plat' }, PLATFORMS.map((k) => h('option', { value: k }, store.state.rules.fees[k].name)));
  const cost = h('input', { id: 'f-cost', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: sample ? '5.99' : '' });
  const sell = h('input', { id: 'f-sell', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: sample ? '19.99' : '' });
  const ship = h('input', { id: 'f-ship', type: 'number', inputmode: 'decimal', step: '0.01', min: '0' });
  const photo = h('input', { id: 'f-photo', type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': 'Take a photo of the item', tabindex: '-1' });
  const sampleNote = h('p', { class: 'hint', id: 'sample-note' }, 'Sample numbers. Replace them with the tag in front of you. Use the typical price from recent sold listings.');
  if (!sample) sampleNote.hidden = true;

  const scanBtn = h('button', { class: 'btn wide', type: 'button', id: 'btn-scan', onclick: startScan }, 'Scan barcode');
  const photoBtn = h('button', { class: 'btn ghost wide', type: 'button', id: 'btn-photo', onclick: () => photo.click() }, 'Photo ID');
  const cancelBtn = h('button', { class: 'btn ghost small', type: 'button', id: 'btn-cancel', hidden: true, onclick: () => abort && abort.abort() }, 'Cancel');
  const scanStatus = h('p', { class: 'status', id: 'scan-status', role: 'status' });
  const foundBox = h('div', { class: 'found', hidden: true, id: 'found' });

  const maxEl = h('div', { class: 'maxpay', id: 'maxpay' });
  const receipt = h('div', { class: 'receipt', id: 'receipt' });
  const addMsg = h('span', { class: 'status', id: 'add-status', role: 'status' });

  ship.value = defaultShip(cat.value, plat.value).toFixed(2);

  function setStatus(text, err) {
    scanStatus.textContent = text;
    scanStatus.classList.toggle('err', !!err);
  }
  function setBusy(on) {
    scanBtn.disabled = on;
    photoBtn.disabled = on;
    cancelBtn.hidden = !on;
  }

  /* ---------- receipt ---------- */
  function row(label, value, cls) { return h('div', { class: 'rrow' + (cls ? ' ' + cls : '') }, h('span', null, label), value); }

  function renderReceipt() {
    const rules = store.state.rules;
    const f = { cost: num(cost), sell: num(sell), ship: num(ship), plat: plat.value };
    const ok = f.cost > 0 && f.sell > 0;
    const c = calc(f, rules);
    const v = ok ? verdict(c, rules) : null;
    const cls = v === 'buy' ? 'good' : v === 'thin' ? 'warn' : 'bad';
    const label = v === 'buy' ? 'Buy' : v === 'thin' ? 'Thin' : 'Pass';
    const fee = rules.fees[f.plat];
    const mp = maxPay(f, rules);

    replace(maxEl, mp > 0
      ? [h('span', { class: 'lead' }, 'Pay no more than'), h('b', null, money(mp)), h('small', null, `Clears ${rules.targetRoi}% return and ${money(rules.minProfit)} profit after fees, shipping and tax.`)]
      : [h('span', { class: 'lead' }, f.sell > 0 ? 'No shelf price clears your rules at this sell price' : 'Enter an expected sell price')]);

    replace(receipt,
      h('div', { class: 'rtop' }, h('div', { class: 'rhead' }, 'Clearance receipt'), ok ? h('div', { class: 'stamp ' + cls, id: 'stamp' }, label) : null),
      row('Sells for', h('span', null, money(f.sell))),
      row(`${fee.name} fee (${fee.pct}%${fee.fix ? ' + ' + money(fee.fix) : ''})`, h('span', null, money(-c.fee))),
      row('Ship / prep', h('span', null, money(-f.ship))),
      row('Shelf price', h('span', null, money(-f.cost))),
      row(`Sales tax (${rules.tax}%)`, h('span', null, money(-c.tax))),
      h('div', { class: 'rrow total' }, h('span', null, 'Net profit'), h('span', { class: c.net >= 0 ? 'pos' : 'neg', id: 'net' }, money(c.net))),
      h('div', { class: 'rsub' }, h('span', null, 'Return on cost ', h('b', null, pct(c.roi))), h('span', null, 'Margin ', h('b', null, pct(c.margin)))));
  }

  /* ---------- what the scan found ---------- */
  function renderFound() {
    foundBox.hidden = !found;
    if (!found) { replace(foundBox); return; }
    const links = lookupLinks(found.code || found.name);
    const meta = [];
    if (found.brand) meta.push(found.brand);
    if (found.confidence) meta.push('Match: ' + found.confidence);
    meta.push(found.code ? `Barcode ${found.code} (${found.src})` : 'No barcode read');
    replace(foundBox,
      h('div', { class: 'iname' }, found.name),
      h('div', { class: 'imeta' }, meta.join(' · ')),
      h('div', { class: 'linkrow' },
        h('a', { class: 'btn small', href: links.amazon, target: '_blank', rel: 'noopener' }, 'Amazon price'),
        h('a', { class: 'btn small ghost', href: links.ebaySold, target: '_blank', rel: 'noopener' }, 'eBay sold'),
        h('a', { class: 'btn small ghost', href: links.web, target: '_blank', rel: 'noopener' }, 'Web search')),
      priceBox(),
      h('p', { class: 'hint' }, found.market ? 'Online listing prices, not sold prices. Tap eBay sold to confirm before you buy a lot of them.' : 'Open both links, note the typical sold price, then type it in as the expected sell price.'));
  }

  function priceBox() {
    const m = found && found.market;
    if (found && found.marketNote) return h('p', { class: 'hint', id: 'market-note' }, found.marketNote);
    if (!m || !m.estimate) return null;
    const range = m.low && m.high && m.high > m.low ? ` Seen from ${money(m.low)} to ${money(m.high)}.` : '';
    const where = m.offers.length ? ' ' + m.offers.map((o) => `${o.merchant} ${money(o.price)}`).join(' · ') : '';
    return h('p', { class: 'hint', id: 'market-note' }, `Estimated sell price ${money(m.estimate)} (middle of ${m.offerCount} online listing${m.offerCount === 1 ? '' : 's'}).${range}${where}`);
  }

  async function autoLookup(code, lead = '') {
    if (!code) return;
    const say = (t, err) => setStatus(lead ? `${lead} ${t}` : t, err);
    abort = new AbortController();
    setBusy(true);
    say('Looking up the item and its price...');
    try {
      const m = await market.lookup(code, abort.signal);
      if (!found || found.code !== code) return;
      if (!m) {
        found.marketNote = 'No listing found for this barcode. Name it yourself or use Photo ID, then check the links.';
        say('Barcode read. Not in the free database.');
      } else {
        found.market = m;
        if (m.name && !found.name) { found.name = m.name; name.value = m.name; }
        if (m.brand && !found.brand) found.brand = m.brand;
        if (m.cat && !found.cat) { found.cat = m.cat; cat.value = m.cat; if (!shipDirty) ship.value = defaultShip(cat.value, plat.value).toFixed(2); }
        if (m.estimate && !num(sell)) { sell.value = m.estimate.toFixed(2); sellAuto = true; }
        say(m.estimate ? 'Found it. Type the shelf price and you get your answer.' : 'Found the name, but no price. Use the links.');
      }
    } catch (e) {
      if (e.code === 'cancelled') { setStatus('Cancelled.'); return; }
      if (found && found.code === code) found.marketNote = e.message;
      say(e.message, true);
    } finally {
      setBusy(false);
      abort = null;
      if (found && found.code === code) renderFound();
      renderReceipt();
    }
  }

  function applyFound(f) {
    found = f;
    if (f.name) name.value = f.name;
    if (f.cat) cat.value = f.cat;
    if (!shipDirty) ship.value = defaultShip(cat.value, plat.value).toFixed(2);
    cost.value = '';
    sell.value = '';
    sellAuto = false;
    sampleNote.hidden = true;
    renderFound();
    renderReceipt();
    foundBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- scanning ---------- */
  function startScan() {
    setStatus('');
    openScanner({
      layer: document.getElementById('scan-layer'),
      camera,
      onCode: (code) => {
        applyFound({ name: '', code, src: 'scanned', brand: '', confidence: '', cat: '' });
        name.value = '';
        name.placeholder = `Barcode ${code}`;
        autoLookup(code);
      },
      onPhoto: () => photo.click(),
      onClose: () => scanBtn.focus(),
    });
  }

  async function onPhoto() {
    const file = photo.files && photo.files[0];
    photo.value = '';
    if (!file) return;
    abort = new AbortController();
    setBusy(true);
    setStatus('Reading the photo...');
    try {
      const { code, b64 } = await camera.readPhoto(file);
      let result = { name: '', brand: '', cat: '', code, confidence: '', src: 'scanned from the photo' };
      let note = '';
      if (ollama.isConfigured()) {
        setStatus('Jinx is identifying the item. The first photo after a pause can take a minute.');
        try {
          const r = await ollama.identify(b64, abort.signal);
          result = { ...r, code: code || r.code, src: code ? 'scanned from the photo' : 'read by the model, check digits verified' };
        } catch (e) {
          if (e.code === 'cancelled') { setStatus('Cancelled.'); return; }
          if (!code) throw e;
          note = ' ' + e.message;
        }
      } else if (!code) {
        setStatus('No barcode found in that photo. To name items from a photo, set up Jinx in Setup.', true);
        return;
      }
      applyFound(result);
      setStatus(note ? 'Barcode kept.' + note : 'Done.', !!note);
      if (code) { abort = null; setBusy(false); await autoLookup(code, note ? 'Barcode kept.' : ''); }
    } catch (e) {
      setStatus(e && e.message ? e.message : 'That photo could not be read. Try again.', true);
    } finally {
      setBusy(false);
      abort = null;
      link.refresh();
    }
  }
  photo.addEventListener('change', onPhoto);

  /* ---------- add to haul ---------- */
  function add() {
    if (!(num(cost) > 0 && num(sell) > 0)) {
      addMsg.textContent = 'Enter a shelf price and an expected sell price first.';
      addMsg.classList.add('err');
      return;
    }
    addMsg.textContent = '';
    addMsg.classList.remove('err');
    const label = name.value.trim() || (found && found.code ? `Barcode ${found.code}` : CATS[cat.value].label);
    const item = store.addItem({ name: label, cat: cat.value, plat: plat.value, cost: num(cost), sell: num(sell), ship: num(ship), status: 'bought', code: found ? found.code : '' });
    toast('Added to your haul.', { label: 'Undo', onClick: () => store.removeItem(item.id) });
    name.value = ''; name.placeholder = 'Brand and product';
    cost.value = ''; sell.value = '';
    found = null; renderFound(); setStatus('');
    sampleNote.hidden = true;
    renderReceipt();
  }

  /* ---------- wiring ---------- */
  [name, cost, sell].forEach((el) => el.addEventListener('input', () => { sampleNote.hidden = true; if (el === sell) sellAuto = false; renderReceipt(); }));
  ship.addEventListener('input', () => { shipDirty = true; renderReceipt(); });
  [cat, plat].forEach((el) => el.addEventListener('change', () => {
    if (!shipDirty) ship.value = defaultShip(cat.value, plat.value).toFixed(2);
    renderReceipt();
  }));
  store.subscribe(() => { // fee names or rules may have changed in Setup
    [...plat.options].forEach((o) => { o.textContent = store.state.rules.fees[o.value].name; });
    renderReceipt();
  });

  replace(root,
    h('div', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h2', null, 'Scan')),
      h('div', { class: 'actions' }, scanBtn, photoBtn, photo),
      h('div', { class: 'actions' }, cancelBtn, scanStatus),
      foundBox),
    h('div', { class: 'card' },
      h('div', { class: 'fields' },
        labelled('f-name', 'Item', name, true),
        labelled('f-cat', 'Category', cat),
        labelled('f-plat', 'Sell on', plat),
        labelled('f-cost', 'Shelf price $', cost),
        labelled('f-sell', 'Expected sell price $', sell),
        labelled('f-ship', 'Ship / prep $', ship)),
      sampleNote),
    maxEl,
    receipt,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'btn-add', onclick: add }, 'Add to haul'), addMsg));

  renderReceipt();
  return { focus: () => name.focus() };
}
