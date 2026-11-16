// Cloudflare Worker: a tiny relay so the phone app can use the free UPCitemdb lookup.
// Browsers block the direct call; this adds the permission header. It forwards only the barcode digits.
const ALLOWED_ORIGIN = 'https://javtsplayground.github.io';
const UPSTREAM = 'https://api.upcitemdb.com/prod/trial/lookup';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return new Response('{}', { status: 405, headers: cors });
    const upc = new URL(request.url).searchParams.get('upc') || '';
    if (!/^\d{8}$|^\d{12,13}$/.test(upc)) return new Response('{"code":"INVALID_UPC"}', { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const res = await fetch(`${UPSTREAM}?upc=${upc}`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } });
  },
};
