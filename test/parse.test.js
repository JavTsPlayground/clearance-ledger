import test from 'node:test';
import assert from 'node:assert/strict';
import { validCode, lookupLinks } from '../js/core/barcode.js';
import { buildChatRequest, parseVision, VisionError, VISION_SCHEMA } from '../js/core/vision.js';
import { normalizeUrl, defaultOllamaUrl, sanitizeSettings, pickModel, hasModel, RECOMMENDED_MODEL } from '../js/core/settings.js';
import { emptyState, sanitizeState, exportText, parseImport } from '../js/core/state.js';

test('validCode: real UPC-A, EAN-13 and EAN-8 pass, a wrong check digit fails', () => {
  assert.equal(validCode('036000291452'), '036000291452');
  assert.equal(validCode('4006381333931'), '4006381333931');
  assert.equal(validCode('96385074'), '96385074');
  assert.equal(validCode('036000291453'), '');
  assert.equal(validCode('4006381333932'), '');
});

test('validCode: strips spaces, rejects wrong lengths and junk', () => {
  assert.equal(validCode('0 36000 29145 2'), '036000291452');
  assert.equal(validCode('12345'), '');
  assert.equal(validCode(''), '');
  assert.equal(validCode(null), '');
});

test('lookupLinks: encodes the term and asks eBay for sold, completed listings', () => {
  const l = lookupLinks('Burt\'s Bees & Co 6oz');
  assert.ok(l.amazon.startsWith('https://www.amazon.com/s?k='));
  assert.ok(!l.amazon.includes('&Co'));
  assert.ok(l.ebaySold.includes('LH_Sold=1') && l.ebaySold.includes('LH_Complete=1'));
});

test('vision request: json schema, zero temperature, one image, keep alive', () => {
  const r = buildChatRequest('qwen2.5vl:7b', 'AAAA');
  assert.equal(r.model, 'qwen2.5vl:7b');
  assert.equal(r.stream, false);
  assert.equal(r.options.temperature, 0);
  assert.deepEqual(r.messages[0].images, ['AAAA']);
  assert.equal(r.format, VISION_SCHEMA);
  assert.ok(r.keep_alive);
  assert.ok(!/price|worth|value|\$/i.test(r.messages[0].content), 'the prompt must not ask the model for prices');
});

const reply = (obj) => ({ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } });

test('parseVision: reads a good reply and keeps only a checksum-valid barcode', () => {
  const r = parseVision(reply({ name: 'Burt\'s Bees Honey Lip Balm 4 pk', brand: 'Burt\'s Bees', category: 'beauty', upc: '036000291452', confidence: 'high' }));
  assert.equal(r.cat, 'beauty');
  assert.equal(r.code, '036000291452');
  assert.equal(r.confidence, 'high');
  const bad = parseVision(reply({ name: 'Thing', brand: '', category: 'beauty', upc: '036000291459', confidence: 'medium' }));
  assert.equal(bad.code, '');
});

test('parseVision: unknown category and confidence fall back, long names are cut', () => {
  const r = parseVision(reply({ name: 'x'.repeat(500), brand: 'b', category: 'cars', upc: '', confidence: 'sure' }));
  assert.equal(r.cat, '');
  assert.equal(r.confidence, 'low');
  assert.equal(r.name.length, 120);
});

test('parseVision: JSON wrapped in prose is still read', () => {
  const r = parseVision(reply('Here you go: {"name":"Candle","brand":"","category":"fragrance","upc":"","confidence":"low"} done'));
  assert.equal(r.name, 'Candle');
});

test('parseVision: nothing readable throws the right error codes', () => {
  assert.throws(() => parseVision(reply('no json here')), (e) => e instanceof VisionError && e.code === 'bad_response');
  assert.throws(() => parseVision({}), (e) => e.code === 'bad_response');
  assert.throws(() => parseVision(reply({ name: '', brand: '', category: '', upc: '', confidence: 'low' })), (e) => e.code === 'nothing_found');
});

test('parseVision: a barcode alone is enough to name the item', () => {
  const r = parseVision(reply({ name: '', brand: '', category: '', upc: '036000291452', confidence: 'low' }));
  assert.equal(r.name, 'Barcode 036000291452');
});

test('normalizeUrl: adds https, drops trailing slash and /api, rejects other schemes', () => {
  assert.equal(normalizeUrl('jinx.tail1234.ts.net:8443/'), 'https://jinx.tail1234.ts.net:8443');
  assert.equal(normalizeUrl('http://192.168.1.5:11434/api'), 'http://192.168.1.5:11434');
  assert.equal(normalizeUrl('javascript:alert(1)'), '');
  assert.equal(normalizeUrl('ftp://x.y'), '');
  assert.equal(normalizeUrl('   '), '');
  assert.equal(normalizeUrl('https://'), '');
});

test('defaultOllamaUrl: only for Tailscale hosts', () => {
  assert.equal(defaultOllamaUrl({ hostname: 'jinx.tail1234.ts.net' }), 'https://jinx.tail1234.ts.net:8443');
  assert.equal(defaultOllamaUrl({ hostname: 'javtsplayground.github.io' }), '');
  assert.equal(defaultOllamaUrl(null), '');
});

test('sanitizeSettings: saved address wins, empty falls back to the default and model', () => {
  const loc = { hostname: 'jinx.tail1234.ts.net' };
  assert.equal(sanitizeSettings({ ollamaUrl: 'https://x.ts.net:8443' }, loc).ollamaUrl, 'https://x.ts.net:8443');
  assert.equal(sanitizeSettings({}, loc).ollamaUrl, 'https://jinx.tail1234.ts.net:8443');
  assert.equal(sanitizeSettings({ model: ' ' }, loc).model, RECOMMENDED_MODEL);
});

test('pickModel: saved model if installed, else a vision-looking one, else none', () => {
  assert.equal(pickModel(['llama3.1:8b', 'qwen2.5vl:7b'], 'qwen2.5vl:7b'), 'qwen2.5vl:7b');
  assert.equal(pickModel(['llama3.1:8b', 'llama3.2-vision:11b'], 'qwen2.5vl:7b'), 'llama3.2-vision:11b');
  assert.equal(pickModel(['llama3.1:8b', 'mistral:7b'], 'qwen2.5vl:7b'), '');
  assert.equal(pickModel(null, 'x'), '');
});

test('state: first run has marked examples; sanitize drops duplicates and junk', () => {
  const s = emptyState(1000);
  assert.equal(s.items.length, 5);
  assert.ok(s.items.every((i) => i.example));
  const t = sanitizeState({ items: [{ id: 'a', name: 'One' }, { id: 'a', name: 'Dupe' }, 7, null], rules: { tax: 'bad' }, settings: 5 });
  assert.equal(t.items.length >= 1, true);
  assert.equal(t.items.filter((i) => i.id === 'a').length, 1);
  assert.equal(t.rules.tax, 6.35);
});

test('backup: export then import round-trips; wrong files give a plain message', () => {
  const s = sanitizeState(emptyState(1000));
  const text = exportText(s, new Date('2026-11-11T12:00:00Z'));
  const back = parseImport(text);
  assert.ok(back.ok);
  assert.deepEqual(back.state.items, s.items);
  assert.deepEqual(back.state.rules, s.rules);
  assert.equal(parseImport('{"hello":1}').ok, false);
  assert.equal(parseImport('not json').ok, false);
  assert.equal(parseImport('').ok, false);
  assert.match(parseImport('{"hello":1}').error, /not a Clearance Ledger backup/);
});

test('hasModel: exact name, or a bare name that means :latest', () => {
  assert.equal(hasModel(['qwen2.5vl:7b'], 'qwen2.5vl:7b'), true);
  assert.equal(hasModel(['gemma3:latest'], 'gemma3'), true);
  assert.equal(hasModel(['gemma3:12b'], 'gemma3'), false);
  assert.equal(hasModel([], 'x'), false);
  assert.equal(hasModel(['x:1'], ''), false);
});
