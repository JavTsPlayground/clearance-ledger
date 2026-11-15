import test from 'node:test';
import assert from 'node:assert/strict';
import { createOllama, OllamaError } from '../js/services/ollama.js';
import { createStorage } from '../js/services/storage.js';
import { createStore } from '../js/store.js';
import { exampleItems } from '../js/core/items.js';

const settings = { ollamaUrl: 'https://jinx.tail1.ts.net:8443', model: 'qwen2.5vl:7b' };
const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj });
const good = { message: { content: JSON.stringify({ name: 'Candle 8oz', brand: 'X', category: 'fragrance', upc: '', confidence: 'high' }) } };

function ollamaWith(fetch, s = settings) {
  return createOllama({ fetch, getSettings: () => s });
}

test('ollama.identify: posts the chat request to the saved address and parses the reply', async () => {
  let seen;
  const o = ollamaWith(async (url, init) => { seen = { url, init }; return json(good); });
  const r = await o.identify('QUJD');
  assert.equal(seen.url, 'https://jinx.tail1.ts.net:8443/api/chat');
  assert.equal(seen.init.method, 'POST');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'qwen2.5vl:7b');
  assert.deepEqual(body.messages[0].images, ['QUJD']);
  assert.equal(r.name, 'Candle 8oz');
  assert.equal(r.cat, 'fragrance');
});

test('ollama: not set up, unreachable, forbidden and missing model have distinct codes', async () => {
  const none = ollamaWith(async () => json(good), { ollamaUrl: '', model: 'm' });
  await assert.rejects(none.ping(), (e) => e.code === 'not_configured');
  assert.equal(none.isConfigured(), false);

  const down = ollamaWith(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(down.ping(), (e) => e instanceof OllamaError && e.code === 'unreachable');

  const forbidden = ollamaWith(async () => json({}, 403));
  await assert.rejects(forbidden.identify('x'), (e) => e.code === 'forbidden' && /OLLAMA_ORIGINS/.test(e.message));

  const missing = ollamaWith(async () => json({ error: 'model not found' }, 404));
  await assert.rejects(missing.identify('x'), (e) => e.code === 'model_missing');
  await assert.rejects(missing.ping(), (e) => e.code === 'wrong_address');

  const broken = ollamaWith(async () => json({}, 500));
  await assert.rejects(broken.identify('x'), (e) => e.code === 'server_error');
});

test('ollama.ping: lists model names', async () => {
  const o = ollamaWith(async (url) => { assert.ok(url.endsWith('/api/tags')); return json({ models: [{ name: 'a:1' }, { name: 'b:2' }, {}] }); });
  assert.deepEqual((await o.ping()).models, ['a:1', 'b:2']);
});

test('ollama: the person can cancel, and a stuck server times out', async () => {
  const hangs = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const o = ollamaWith(hangs);
  const ctl = new AbortController();
  const p = o.identify('x', ctl.signal);
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(p, (e) => e.code === 'cancelled');
  const already = new AbortController(); already.abort();
  await assert.rejects(o.identify('x', already.signal), (e) => e.code === 'cancelled');
});

test('ollama: an unreadable model reply is reported, not thrown raw', async () => {
  const o = ollamaWith(async () => json({ message: { content: 'sorry' } }));
  await assert.rejects(o.identify('x'), (e) => e instanceof OllamaError && e.code === 'bad_response');
  const empty = ollamaWith(async () => json({ message: { content: '{"name":"","brand":"","category":"","upc":"","confidence":"low"}' } }));
  await assert.rejects(empty.identify('x'), (e) => e.code === 'nothing_found');
});

function fakeBackend(initial) {
  const m = new Map(initial ? Object.entries(initial) : []);
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

test('storage: first run gives marked examples, then saves and reloads', () => {
  const backend = fakeBackend();
  const st = createStorage({ backend, loc: null, now: () => 5000 });
  const first = st.load();
  assert.equal(first.firstRun, true);
  assert.ok(first.state.items.every((i) => i.example));
  assert.equal(st.save(first.state), true);
  const again = st.load();
  assert.equal(again.firstRun, false);
  assert.equal(again.state.items.length, 5);
});

test('storage: unreadable data is set aside, never overwritten', () => {
  const backend = fakeBackend({ 'clearance-ledger-v1': '{broken' });
  const st = createStorage({ backend, loc: null });
  const r = st.load();
  assert.equal(r.recovered, true);
  assert.equal(backend.m.get('clearance-ledger-v1.unreadable'), '{broken');
  assert.equal(backend.m.get('clearance-ledger-v1'), '{broken', 'the original is untouched until the next save');
});

test('storage: blocked storage does not crash', () => {
  const backend = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const st = createStorage({ backend, loc: null });
  assert.equal(st.load().firstRun, true);
  assert.equal(st.save({}), false);
});

function makeStore() {
  const backend = fakeBackend();
  const errors = [];
  const store = createStore({ storage: createStorage({ backend, loc: null, now: () => 1000 }), loc: null, onSaveError: () => errors.push(1) });
  return { store, backend, errors };
}

test('store: add, patch, remove and undo keep data consistent and saved', () => {
  const { store, backend } = makeStore();
  const before = store.state.items.length;
  const it = store.addItem({ name: 'New find', cat: 'pet', plat: 'ebay', cost: 3, sell: 12, ship: 5 });
  assert.equal(store.state.items.length, before + 1);
  assert.equal(it.example, false);
  store.patchItem(it.id, { status: 'sold', soldPrice: 11 });
  assert.equal(store.state.items.find((i) => i.id === it.id).status, 'sold');
  const gone = store.removeItem(it.id);
  assert.equal(store.state.items.length, before);
  store.restoreItems([gone]);
  assert.equal(store.state.items.length, before + 1);
  store.restoreItems([gone]);
  assert.equal(store.state.items.length, before + 1, 'undo twice does not duplicate');
  assert.equal(JSON.parse(backend.m.get('clearance-ledger-v1')).items.length, before + 1);
});

test('store: clear examples is undoable and leaves real finds alone', () => {
  const { store } = makeStore();
  store.addItem({ name: 'Mine', cost: 1, sell: 9 });
  const gone = store.clearExamples();
  assert.equal(gone.length, 5);
  assert.deepEqual(store.state.items.map((i) => i.name), ['Mine']);
  store.restoreItems(gone);
  assert.equal(store.state.items.length, 6);
});

test('store: rules and settings are validated, and subscribers hear changes', () => {
  const { store } = makeStore();
  let heard = 0;
  const off = store.subscribe(() => heard++);
  store.setRules({ targetRoi: 50, tax: -1 });
  assert.equal(store.state.rules.targetRoi, 50);
  assert.equal(store.state.rules.tax, 6.35);
  store.setSettings({ ollamaUrl: 'javascript:1', model: 'm1' });
  assert.equal(store.state.settings.ollamaUrl, '');
  assert.equal(store.state.settings.model, 'm1');
  off();
  store.setRules({});
  assert.equal(heard, 2);
});

test('store: a failed save is reported but the change stays on screen', () => {
  const backend = fakeBackend();
  const errors = [];
  const store = createStore({ storage: createStorage({ backend, loc: null }), loc: null, onSaveError: () => errors.push(1) });
  backend.setItem = () => { throw new Error('full'); };
  store.addItem({ name: 'x', cost: 1, sell: 5 });
  assert.equal(errors.length, 1);
  assert.equal(store.state.items[0].name, 'x');
});

test('store: reset empties the haul and returns the old state for undo', () => {
  const { store } = makeStore();
  const prev = store.resetAll();
  assert.equal(store.state.items.length, 0);
  assert.equal(prev.items.length, 5);
  store.replaceAll(prev);
  assert.equal(store.state.items.length, 5);
});
