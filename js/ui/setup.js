// Setup tab: Jinx connection, rules and fees, backup and restore, reset.
import { PLATFORMS } from '../core/calc.js';
import { RECOMMENDED_MODEL, OLLAMA_HTTPS_PORT } from '../core/settings.js';
import { exportText, parseImport } from '../core/state.js';
import { h, replace, labelled } from './dom.js';
import { LINK_LABEL } from './link.js';

const VERSION = '1.1.0';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = h('textarea', { 'aria-hidden': 'true', class: 'offscreen' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function mountSetup(root, { store, link, toast }) {
  /* ---------- Jinx ---------- */
  const url = h('input', { id: 's-url', type: 'url', class: 'mono', inputmode: 'url', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'https://jinx.xxxx.ts.net:' + OLLAMA_HTTPS_PORT });
  const model = h('input', { id: 's-model', type: 'text', class: 'mono', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', list: 's-models' });
  const modelList = h('datalist', { id: 's-models' });
  const linkLine = h('p', { class: 'status', id: 'link-status', role: 'status' });
  const testBtn = h('button', { class: 'btn', type: 'button', id: 'btn-test' }, 'Save and test');

  async function saveAndTest() {
    store.setSettings({ ollamaUrl: url.value, model: model.value });
    url.value = store.state.settings.ollamaUrl;
    testBtn.disabled = true;
    await link.refresh();
    testBtn.disabled = false;
  }
  testBtn.addEventListener('click', saveAndTest);

  function renderLink() {
    linkLine.textContent = `${LINK_LABEL[link.kind]}. ${link.detail}`;
    linkLine.classList.toggle('err', link.kind === 'down' || link.kind === 'nomodel');
    replace(modelList, link.models.map((m) => h('option', { value: m })));
  }

  const origin = location.origin;
  const copyBtn = (text, label) => h('button', { class: 'btn ghost small', type: 'button', onclick: async () => toast((await copyText(text)) ? 'Copied.' : 'Could not copy. Select the text and copy it.') }, label);
  const jinxCard = h('div', { class: 'card' },
    h('h2', null, 'Photo ID on Jinx'),
    h('p', { class: 'hint' }, 'Scanning a barcode works with no setup. Photo ID sends one small photo to the Ollama vision model on Jinx over Tailscale. Nothing goes to any other server.'),
    h('div', { class: 'fields' }, labelled('s-url', 'Jinx address', url, true), labelled('s-model', 'Vision model', model, true), modelList),
    h('div', { class: 'actions' }, testBtn),
    linkLine,
    h('details', null,
      h('summary', null, 'Commands for Jinx'),
      h('p', { class: 'hint' }, '1. Download the model once, in PowerShell:'),
      h('pre', { class: 'cmd' }, `ollama pull ${RECOMMENDED_MODEL}`),
      h('p', { class: 'hint' }, `2. Let this app talk to Ollama. Set the Windows user variable OLLAMA_ORIGINS to this app's address, then quit and reopen Ollama:`),
      h('pre', { class: 'cmd' }, origin),
      copyBtn(origin, 'Copy address'),
      h('p', { class: 'hint' }, `3. Share Ollama over Tailscale, in PowerShell run as Administrator:`),
      h('pre', { class: 'cmd' }, `tailscale serve --bg --https=${OLLAMA_HTTPS_PORT} http://127.0.0.1:11434`),
      copyBtn(`tailscale serve --bg --https=${OLLAMA_HTTPS_PORT} http://127.0.0.1:11434`, 'Copy command')));

  /* ---------- rules and fees ---------- */
  const inputs = {};
  const numIn = (id, step) => { const el = h('input', { id, type: 'number', inputmode: 'decimal', step, min: '0' }); inputs[id] = el; return el; };
  const roi = numIn('r-roi', '1'), minp = numIn('r-minp', '0.5'), tax = numIn('r-tax', '0.01');
  const feeRows = [h('span', { class: 'lbl' }, 'Marketplace'), h('span', { class: 'lbl' }, 'Fee %'), h('span', { class: 'lbl' }, 'Fixed $')];
  const feeIn = {};
  for (const p of PLATFORMS) {
    feeIn[p] = { pct: numIn(`fee-${p}-pct`, '0.1'), fix: numIn(`fee-${p}-fix`, '0.05') };
    feeIn[p].pct.setAttribute('aria-label', `${p} fee percent`);
    feeIn[p].fix.setAttribute('aria-label', `${p} fixed fee`);
    feeRows.push(h('span', { class: 'nm', id: `nm-${p}` }), feeIn[p].pct, feeIn[p].fix);
  }
  const rulesCard = h('details', { class: 'card', id: 'rules' },
    h('summary', null, 'Your rules and fees'),
    h('div', { class: 'fields' },
      labelled('r-roi', 'Min return on cost %', roi), labelled('r-minp', 'Min profit $', minp), labelled('r-tax', 'Sales tax at the register %', tax)),
    h('h3', null, 'Marketplace fees'),
    h('div', { class: 'feegrid' }, feeRows),
    h('p', { class: 'hint' }, 'These are estimates. Check each marketplace’s current fee page and edit the numbers to match. Amazon FBA shows a flat per-unit fee; use Ship / prep for inbound and prep costs.'));

  rulesCard.addEventListener('change', () => {
    const cur = store.state.rules;
    const n = (el, fallback) => { const v = parseFloat(el.value); return Number.isFinite(v) && v >= 0 ? v : fallback; };
    const fees = {};
    for (const p of PLATFORMS) fees[p] = { pct: n(feeIn[p].pct, cur.fees[p].pct), fix: n(feeIn[p].fix, cur.fees[p].fix) };
    store.setRules({ ...cur, targetRoi: n(roi, cur.targetRoi), minProfit: n(minp, cur.minProfit), tax: n(tax, cur.tax), fees });
  });

  /* ---------- data ---------- */
  const dataMsg = h('p', { class: 'status', id: 'data-status', role: 'status' });
  const restore = h('input', { id: 's-restore', type: 'file', accept: 'application/json,.json', tabindex: '-1', 'aria-label': 'Choose a backup file' });

  async function saveBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([exportText(store.state)], `clearance-ledger-${stamp}.json`, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); dataMsg.textContent = 'Backup shared.'; return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const href = URL.createObjectURL(file);
    const a = h('a', { href, download: file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    dataMsg.textContent = 'Backup saved to your downloads.';
  }

  restore.addEventListener('change', async () => {
    const file = restore.files && restore.files[0];
    restore.value = '';
    if (!file) return;
    dataMsg.classList.remove('err');
    const parsed = parseImport(await file.text(), location);
    if (!parsed.ok) { dataMsg.textContent = parsed.error; dataMsg.classList.add('err'); return; }
    const prev = store.state;
    store.replaceAll(parsed.state);
    dataMsg.textContent = `Restored ${parsed.state.items.length} items.`;
    toast('Backup restored.', { label: 'Undo', onClick: () => store.replaceAll(prev) });
  });

  const standalone = (navigator.standalone === true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const dataCard = h('div', { class: 'card' },
    h('h2', null, 'Your data'),
    h('p', { class: 'hint' }, 'Everything is saved on this phone only. Save a backup now and then, and before you delete the app.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn wide', type: 'button', id: 'btn-backup', onclick: saveBackup }, 'Save backup'),
      h('button', { class: 'btn ghost wide', type: 'button', id: 'btn-restore', onclick: () => restore.click() }, 'Restore backup'), restore),
    dataMsg,
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn ghost small', type: 'button', id: 'btn-reset',
        onclick: () => { const prev = store.resetAll(); toast('Everything cleared.', { label: 'Undo', onClick: () => store.replaceAll(prev) }); },
      }, 'Reset everything')),
    standalone ? null : h('p', { class: 'hint', id: 'install-hint' }, 'To install: in Safari tap the Share button, then Add to Home Screen. It then opens full screen and works offline.'));

  const aboutCard = h('div', { class: 'card' },
    h('h2', null, 'What this can and cannot do'),
    h('ul', { class: 'huntlist' },
      h('li', null, h('span', { class: 'hint' }, 'Scanning a barcode looks the item up for free and fills in an estimated sell price from current online listings (Amazon, eBay, Walmart and others). It is not Amazon’s own data and not sold prices, so confirm with the eBay sold link before buying a lot. The free lookup allows about 100 scans a day.')),
      h('li', null, h('span', { class: 'hint' }, 'The vision model names the item. It is never asked for a price.')),
      h('li', null, h('span', { class: 'hint' }, 'Photo ID needs Jinx on, Tailscale on and Ollama running. Barcode scan, the maths and your haul work without them.')),
      h('li', null, h('span', { class: 'hint' }, 'iPhone may ask for camera permission each time the app opens. Photo mode never needs it.'))),
    h('p', { class: 'hint' }, `Clearance Ledger ${VERSION}`));

  /* ---------- render ---------- */
  function syncInputs() {
    const { rules, settings } = store.state;
    const set = (el, v) => { if (document.activeElement !== el) el.value = String(v); };
    set(url, settings.ollamaUrl); set(model, settings.model);
    set(roi, rules.targetRoi); set(minp, rules.minProfit); set(tax, rules.tax);
    for (const p of PLATFORMS) {
      set(feeIn[p].pct, rules.fees[p].pct); set(feeIn[p].fix, rules.fees[p].fix);
      document.getElementById(`nm-${p}`).textContent = rules.fees[p].name;
    }
  }

  replace(root, jinxCard, rulesCard, dataCard, aboutCard);
  store.subscribe(syncInputs);
  link.subscribe(renderLink);
  syncInputs();
  renderLink();
}
