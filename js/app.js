// Wires the pieces together. No business logic lives here.
import { createStorage } from './services/storage.js';
import { createOllama } from './services/ollama.js';
import { createCamera } from './services/camera.js';
import { createMarket } from './services/market.js';
import { createStore } from './store.js';
import { summarize } from './core/items.js';
import { createLink, LINK_LABEL } from './ui/link.js';
import { h, replace } from './ui/dom.js';
import { mountCheck } from './ui/check.js';
import { mountHaul } from './ui/haul.js';
import { mountPairs } from './ui/pairs.js';
import { mountSetup } from './ui/setup.js';

/* ---------- storage that never throws ---------- */
function safeBackend() {
  try {
    const ls = window.localStorage;
    ls.getItem('x');
    return ls;
  } catch {
    const m = new Map(); // blocked: keep working for this session only
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
  }
}

/* ---------- toast with optional action ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(text, opts = {}) {
  clearTimeout(toastTimer);
  toastEl.classList.toggle('err', !!opts.error);
  replace(toastEl, h('span', null, text), opts.label ? h('button', { type: 'button', onclick: () => { hide(); opts.onClick(); } }, opts.label) : null);
  toastEl.hidden = false;
  toastTimer = setTimeout(hide, opts.ms || (opts.label ? 7000 : opts.error ? 6000 : 3500));
}
function hide() { toastEl.hidden = true; }

/* ---------- services and state ---------- */
const store = createStore({
  storage: createStorage({ backend: safeBackend(), loc: location }),
  loc: location,
  onSaveError: () => toast('Could not save. Storage may be full or blocked. Save a backup in Setup.', { error: true }),
});
const ollama = createOllama({ fetch: (...a) => window.fetch(...a), getSettings: () => store.state.settings });
const camera = createCamera({ zxing: window.ZXing, mediaDevices: navigator.mediaDevices, doc: document });
const market = createMarket({ fetch: (...a) => window.fetch(...a), getSettings: () => store.state.settings });
const link = createLink({ ollama, store });
const ctx = { store, ollama, camera, market, link, toast };

/* ---------- header link pill ---------- */
const linkBtn = document.getElementById('link');
function paintLink() {
  linkBtn.dataset.kind = link.kind;
  linkBtn.textContent = LINK_LABEL[link.kind];
  linkBtn.setAttribute('aria-label', `${LINK_LABEL[link.kind]}. ${link.detail} Tap to check again.`);
}
linkBtn.addEventListener('click', async () => { await link.refresh(); toast(link.detail, { error: link.kind === 'down' || link.kind === 'nomodel' }); });
link.subscribe(paintLink);
paintLink();

/* ---------- tabs ---------- */
const tabs = [...document.querySelectorAll('.tab')];
function show(view) {
  for (const t of tabs) {
    const on = t.dataset.view === view;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById('v-' + t.dataset.view).hidden = !on;
  }
  window.scrollTo(0, 0);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => show(t.dataset.view));
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = tabs[(i + d + tabs.length) % tabs.length];
    next.focus();
    show(next.dataset.view);
  });
});

mountCheck(document.getElementById('v-check'), { ...ctx, go: show });
mountHaul(document.getElementById('v-haul'), ctx);
mountPairs(document.getElementById('v-pairs'), ctx);
mountSetup(document.getElementById('v-setup'), ctx);

const chipHaul = document.getElementById('chip-haul');
const paintChip = () => { chipHaul.textContent = String(summarize(store.state.items, store.state.rules).open); };
store.subscribe(paintChip);
paintChip();

if (store.recovered) toast('Saved data could not be read, so the app started fresh. The old data was kept aside.', { error: true, ms: 9000 });

/* ---------- connection check, once at start and when the phone comes back online ---------- */
link.refresh();
window.addEventListener('online', () => link.refresh());

/* ---------- keep data from being evicted, and work offline ---------- */
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* optional */ }

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => toast('A new version is ready.', {
      label: 'Reload', ms: 15000,
      onClick: () => worker.postMessage('skip-waiting'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* the app still works online without it */ });
  // Reload only when a newer worker replaces an older one, never on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}
