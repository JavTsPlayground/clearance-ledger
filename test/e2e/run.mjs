// End-to-end check in a phone-sized Chromium. Run by hand:  node test/e2e/run.mjs
// Needs Playwright (set PLAYWRIGHT_MODULE to its path if it is not installed in this folder).
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../..', import.meta.url).pathname;
const here = new URL('.', import.meta.url).pathname;
const shots = process.env.SHOTS || join(here, 'shots');
mkdirSync(shots, { recursive: true });
// The fake camera plays a short video of a barcode. Built from camera-frame.png when missing (needs ffmpeg).
if (!existsSync(here + 'camera.y4m')) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', here + 'camera-frame.png', '-t', '2', '-r', '10', '-pix_fmt', 'yuv420p', here + 'camera.y4m']);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const app = http.createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(4173);

let mock = { models: ['qwen2.5vl:7b'], reply: { name: 'Burt\'s Bees Honey Lip Balm 4 pk', brand: 'Burt\'s Bees', category: 'beauty', upc: '', confidence: 'high' }, status: 200, seen: [] };
const ollama = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (mock.status !== 200) { res.writeHead(mock.status, cors); res.end('{}'); return; }
  if (req.url === '/api/tags') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ models: mock.models.map((name) => ({ name })) })); return; }
  if (req.url === '/api/chat') {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      mock.seen.push(JSON.parse(body));
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(mock.reply) } }));
    });
    return;
  }
  res.writeHead(404, cors); res.end('{}');
}).listen(11500);

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${here}camera.y4m`] });
const BASE = 'http://localhost:4173/';
const upc = { status: 200, seen: [], body: { code: 'OK', items: [{ title: 'Honey Lip Balm 4 Pack', brand: "Burt's Bees", category: 'Health & Beauty > Personal Care', lowest_recorded_price: 6.5, highest_recorded_price: 14.99, offers: [{ merchant: 'Amazon', price: 9.99, condition: 'New' }, { merchant: 'Walmart', price: 8.49, condition: 'New' }, { merchant: 'eBay', price: 12.5, condition: 'New' }] }] } };
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'], acceptDownloads: true, ...opts });
  await ctx.route('https://api.upcitemdb.com/**', (route) => {
    upc.seen.push(route.request().url());
    route.fulfill({ status: upc.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(upc.status === 200 ? upc.body : {}) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  return { ctx, page, errors };
}
const tab = (page, v) => page.click(`#tab-${v}`);

try {
  console.log('First run');
  let { ctx, page, errors } = await newPage();
  await page.goto(BASE);
  await page.waitForSelector('#receipt .stamp');
  ok(await page.textContent('#stamp') === 'Buy', 'sample numbers give a Buy stamp');
  ok(await page.textContent('#net') === '$6.00', 'net profit is $6.00 for the sample: ' + await page.textContent('#net'));
  ok(await page.isVisible('#sample-note'), 'sample numbers are labelled');
  ok(await page.textContent('#chip-haul') === '4', 'haul chip counts the 4 unsold examples');
  await page.screenshot({ path: join(shots, '1-check.png'), fullPage: false });
  await page.screenshot({ path: join(shots, '1-check-full.png'), fullPage: true });

  console.log('Typing changes the verdict');
  await page.fill('#f-cost', '15'); await page.fill('#f-sell', '18');
  ok(await page.textContent('#stamp') === 'Pass', 'a bad deal is stamped Pass');
  ok((await page.textContent('#maxpay')).includes('Pay no more than') || (await page.textContent('#maxpay')).includes('No shelf price'), 'max-pay strip reacts');
  await page.fill('#f-cost', '5.99'); await page.fill('#f-sell', '19.99');

  console.log('Add to haul and undo');
  await page.fill('#f-name', 'Test <b>bold</b> item');
  await page.click('#btn-add');
  ok(await page.textContent('#chip-haul') === '5', 'haul chip goes to 5');
  ok(await page.isVisible('#toast'), 'toast shows');
  await page.click('#toast button');
  ok(await page.textContent('#chip-haul') === '4', 'Undo removes it again');
  await page.fill('#f-name', 'Test <b>bold</b> item'); await page.fill('#f-cost', '5.99'); await page.fill('#f-sell', '19.99');
  await page.click('#btn-add');

  console.log('Haul');
  await tab(page, 'haul');
  ok((await page.locator('.item .iname').first().textContent()).includes('<b>bold</b>'), 'names are shown as plain text, not HTML');
  ok(await page.locator('.item .iname b').count() === 0, 'no injected markup');
  await page.locator('.item').first().getByRole('button', { name: 'Sold' }).click();
  ok(await page.locator('.soldin').count() === 2, 'Sold shows a sold-price field (plus the sold example)');
  const myPrice = page.locator('.item').first().locator('.soldin');
  await myPrice.fill('17.50'); await myPrice.press('Tab');
  ok((await page.locator('.item').first().locator('.inet').textContent()).startsWith('$3.85'), 'sold price changes the profit: ' + await page.locator('.item').first().locator('.inet').textContent());
  ok((await page.textContent('#sum')).includes('Profit made'), 'summary shows Profit made');
  await page.fill('#h-hours', '2'); await page.press('#h-hours', 'Tab');
  ok(!(await page.textContent('#sum')).includes('—'), 'per hour shows a number once hours are set');
  await page.screenshot({ path: join(shots, '2-haul.png'), fullPage: true });
  await page.click('#btn-clear-examples');
  ok(await page.locator('.ex').count() === 0, 'examples cleared');
  await page.click('#toast button');
  ok(await page.locator('.ex').count() === 5, 'undo brings the 5 examples back');
  await page.locator('.item').first().getByRole('button', { name: 'Delete' }).click();
  await page.click('#toast button');

  console.log('Pairs');
  await tab(page, 'pairs');
  ok(await page.locator('#bundles article').count() >= 2, 'bundle ideas appear');
  ok((await page.textContent('#hunt')).includes('Look for next'), 'look-for-next shows');
  await page.screenshot({ path: join(shots, '3-pairs.png'), fullPage: true });

  console.log('Setup and Jinx connection');
  await tab(page, 'setup');
  await page.screenshot({ path: join(shots, '4-setup.png'), fullPage: true });
  ok((await page.textContent('#link-status')).includes('not set up'), 'starts as not set up');
  await page.fill('#s-url', 'localhost:11500');
  mock.status = 200;
  await page.click('#btn-test');
  await page.waitForFunction(() => document.getElementById('link').dataset.kind === 'down');
  ok((await page.inputValue('#s-url')) === 'https://localhost:11500', 'a bare address gets https, and a non-TLS server reads as unreachable');
  ok((await page.textContent('#link-status')).includes('Tailscale'), 'the offline message names the likely causes');
  await page.fill('#s-url', 'http://localhost:11500');
  await page.click('#btn-test');
  await page.waitForFunction(() => document.getElementById('link').dataset.kind === 'ready');
  ok(await page.getAttribute('#link', 'data-kind') === 'ready', 'connected: pill says Jinx ready');
  mock.models = ['llama3.1:8b'];
  await page.click('#btn-test');
  await page.waitForFunction(() => document.getElementById('link').dataset.kind === 'nomodel');
  ok((await page.textContent('#link-status')).includes('ollama pull'), 'missing model explains the fix');
  mock.models = ['qwen2.5vl:7b'];
  await page.fill('#s-model', 'qwen2.5vl:7b');
  await page.click('#btn-test');
  await page.waitForFunction(() => document.getElementById('link').dataset.kind === 'ready');

  console.log('Rules persist and change the maths');
  await page.locator('#rules summary').click();
  await page.fill('#r-roi', '120'); await page.press('#r-roi', 'Tab');
  await tab(page, 'check');
  await page.fill('#f-cost', '5.99'); await page.fill('#f-sell', '19.99');
  ok(await page.textContent('#stamp') !== 'Buy', 'raising the return target changes the stamp: ' + await page.textContent('#stamp'));
  await tab(page, 'setup');
  await page.fill('#r-roi', '40'); await page.press('#r-roi', 'Tab');

  console.log('Photo ID: barcode in the photo plus the model');
  await tab(page, 'check');
  mock.seen = [];
  await page.setInputFiles('#f-photo', join(here, 'barcode.png'));
  await page.waitForSelector('#found:not([hidden])');
  const foundText = await page.textContent('#found');
  ok(foundText.includes('Burt\'s Bees Honey Lip Balm'), 'model name shown');
  ok(foundText.includes('4006381333931'), 'barcode decoded from the photo by ZXing');
  ok(mock.seen.length === 1 && mock.seen[0].messages[0].images[0].length > 1000, 'one image was sent to Ollama');
  ok(!JSON.stringify(mock.seen[0]).match(/price/i), 'request never asks for a price');
  ok((await page.inputValue('#f-cat')) === 'beauty', 'category set from the model');
  await page.waitForFunction(() => document.getElementById('f-sell').value !== '');
  ok((await page.inputValue('#f-sell')) === '9.99', 'sell price filled in automatically from online listings');
  ok((await page.textContent('#market-note')).includes('Estimated sell price $9.99'), 'estimate is labelled as an estimate');
  ok((await page.textContent('#market-note')).includes('not sold prices') || (await page.textContent('#found')).includes('not sold prices'), 'says these are listing prices, not sold prices');
  ok(upc.seen.length >= 1 && upc.seen[0].includes('upc=4006381333931'), 'lookup sent only the barcode');
  await page.fill('#f-cost', '1.50');
  ok(['Buy', 'Thin', 'Pass'].includes(await page.textContent('#stamp')), 'with a shelf price typed, the verdict appears with no manual price research: ' + await page.textContent('#stamp'));
  await page.fill('#f-cost', ''); await page.fill('#f-sell', '');
  const amz = await page.getAttribute('#found a:nth-of-type(1)', 'href');
  ok(amz.includes('4006381333931'), 'Amazon link searches the barcode');
  ok((await page.getAttribute('#found a:nth-of-type(2)', 'href')).includes('LH_Sold=1'), 'eBay link is sold listings');
  await page.screenshot({ path: join(shots, '5-found.png'), fullPage: true });

  console.log('Photo ID: failure paths');
  mock.status = 500;
  await page.setInputFiles('#f-photo', join(here, 'no-barcode.png'));
  await page.waitForFunction(() => document.getElementById('scan-status').classList.contains('err'));
  ok((await page.textContent('#scan-status')).includes('error'), 'server error reported in words: ' + await page.textContent('#scan-status'));
  mock.status = 200;
  await page.setInputFiles('#f-photo', join(here, 'barcode.png'));
  await page.waitForFunction(() => !document.getElementById('scan-status').classList.contains('err'));
  mock.status = 500;
  await page.setInputFiles('#f-photo', join(here, 'barcode.png'));
  await page.waitForFunction(() => document.getElementById('scan-status').textContent.includes('Barcode kept'));
  ok(true, 'when Jinx fails but the photo has a barcode, the barcode is kept');
  mock.status = 200;

  console.log('Live camera scan (fake camera showing a barcode)');
  await page.fill('#f-name', ''); 
  await page.click('#btn-scan');
  await page.waitForSelector('#scan-layer:not([hidden])');
  ok(await page.isVisible('#scan-layer video'), 'scanner opens with camera view');
  await page.waitForFunction(() => document.getElementById('scan-layer').hidden, null, { timeout: 15000 });
  ok((await page.textContent('#found')).includes('4006381333931'), 'live scan read the barcode');
  ok((await page.textContent('#found')).includes('scanned'), 'source is shown as scanned');
  const tracksLive = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject).length);
  ok(tracksLive === 0, 'camera is released after the scan');
  await page.click('#btn-scan');
  await page.waitForSelector('#scan-layer:not([hidden])');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.getElementById('scan-layer').hidden), 'Escape cancels the scanner');

  console.log('Lookup failure paths');
  await page.reload(); // clears the in-memory lookup cache
  await page.waitForSelector('#btn-scan');
  upc.status = 404;
  await page.fill('#f-name', ''); await page.fill('#f-sell', '');
  await page.click('#btn-scan');
  await page.waitForFunction(() => document.getElementById('scan-layer').hidden, null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('scan-status').textContent.includes('Not in the free database'));
  ok((await page.inputValue('#f-sell')) === '', 'unknown barcode leaves the price blank, with links still offered');
  await page.reload();
  await page.waitForSelector('#btn-scan');
  upc.status = 429;
  await page.fill('#f-name', '');
  await page.click('#btn-scan');
  await page.waitForFunction(() => document.getElementById('scan-layer').hidden, null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('scan-status').classList.contains('err'));
  ok((await page.textContent('#scan-status')).includes('used up'), 'daily limit explained in words: ' + await page.textContent('#scan-status'));
  upc.status = 200;

  console.log('Backup and restore');
  await tab(page, 'setup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-backup')]);
  const path = await dl.path();
  const text = readFileSync(path, 'utf8');
  ok(JSON.parse(text).app === 'clearance-ledger', 'backup file is a Clearance Ledger backup: ' + dl.suggestedFilename());
  await page.click('#btn-reset');
  ok(await page.textContent('#chip-haul') === '0', 'reset clears the haul');
  await page.click('#toast button');
  ok(await page.textContent('#chip-haul') !== '0', 'undo restores it');
  await page.click('#btn-reset');
  await page.setInputFiles('#s-restore', path);
  await page.waitForFunction(() => document.getElementById('data-status').textContent.startsWith('Restored'));
  ok(await page.textContent('#chip-haul') !== '0', 'restore from the backup file works');
  await page.setInputFiles('#s-restore', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => document.getElementById('data-status').classList.contains('err'));
  ok((await page.textContent('#data-status')).includes('not a Clearance Ledger backup'), 'wrong file gives a plain message');

  console.log('Persistence across reloads');
  await page.reload();
  await page.waitForSelector('#receipt');
  ok(await page.textContent('#chip-haul') !== '0', 'haul survives a reload');
  ok((await page.getAttribute('#link', 'data-kind')) !== null, 'link pill rendered');

  console.log('Offline');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#receipt');
  ok(await page.isVisible('#btn-add'), 'app opens with no network');
  ok(await page.evaluate(async () => (await caches.keys()).length === 1), 'one cache present');
  await page.waitForFunction(() => ['down', 'off', 'ready'].includes(document.getElementById('link').dataset.kind));
  ok(['down'].includes(await page.getAttribute('#link', 'data-kind')), 'Jinx pill says offline when the phone is: ' + await page.getAttribute('#link', 'data-kind'));
  await tab(page, 'haul');
  ok(await page.locator('.item').count() > 0, 'haul readable offline');
  await ctx.setOffline(false);
  ok(errors.filter((e) => !/Failed to load resource|net::ERR|Failed to fetch/.test(e)).length === 0, 'no console errors: ' + JSON.stringify(errors.slice(0, 3)));
  await ctx.close();

  console.log('Dark mode and small screen');
  ({ ctx, page, errors } = await newPage({ colorScheme: 'dark', viewport: { width: 375, height: 667 } }));
  await page.goto(BASE);
  await page.waitForSelector('#receipt .stamp');
  await page.screenshot({ path: join(shots, '6-dark-check.png') });
  await tab(page, 'haul'); await page.screenshot({ path: join(shots, '6-dark-haul.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok(!overflow, 'no sideways scrolling at 375px');
  await tab(page, 'setup');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'setup fits at 375px');
  await ctx.close();

  console.log('Storage blocked');
  ({ ctx, page, errors } = await newPage());
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await page.goto(BASE);
  await page.waitForSelector('#receipt .stamp');
  await page.fill('#f-cost', '5'); await page.fill('#f-sell', '20'); await page.click('#btn-add');
  ok(await page.textContent('#chip-haul') === '5', 'works for the session when storage is blocked');
  await ctx.close();
} catch (e) {
  failures++; console.log('  CRASH ' + (e && e.stack || e));
} finally {
  await browser.close(); app.close(); ollama.close();
}
console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
