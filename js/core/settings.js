// Connection settings for the Ollama server. Pure.

export const OLLAMA_HTTPS_PORT = 8443; // the port `tailscale serve` exposes Ollama on

export const RECOMMENDED_MODEL = 'qwen2.5vl:7b';

export const DEFAULT_SETTINGS = Object.freeze({
  ollamaUrl: '',
  model: RECOMMENDED_MODEL,
});

const VISION_NAME = /(vl|vision|llava|gemma3|minicpm-v|moondream|granite3\.2-vision)/i;

/**
 * Cleans what the person typed. Returns '' when it cannot be a usable address.
 * Only http and https are accepted; a trailing slash or /api is dropped.
 */
export function normalizeUrl(input) {
  let s = String(input == null ? '' : input).trim();
  if (!s) return '';
  if (/^(javascript|data|vbscript|file|blob):/i.test(s)) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (!u.hostname) return '';
  const path = u.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${u.protocol}//${u.host}${path}`;
}

/** When the app is opened from a Tailscale address, Ollama is on the same host, port 8443. */
export function defaultOllamaUrl(loc) {
  const host = loc && loc.hostname;
  if (host && /\.ts\.net$/i.test(host)) return `https://${host}:${OLLAMA_HTTPS_PORT}`;
  return '';
}

export function sanitizeSettings(raw, loc) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const url = normalizeUrl(d.ollamaUrl) || defaultOllamaUrl(loc);
  const model = String(d.model || '').trim().slice(0, 80);
  return { ollamaUrl: url, model: model || RECOMMENDED_MODEL };
}

/** Picks the saved model if installed, else the first installed model that looks like a vision model. */
export function pickModel(installed, preferred) {
  const names = (installed || []).filter((n) => typeof n === 'string');
  if (preferred && names.includes(preferred)) return preferred;
  return names.find((n) => VISION_NAME.test(n)) || '';
}

/** True when the model is installed. Ollama names carry a tag; a bare name means :latest. */
export function hasModel(installed, model) {
  const names = (installed || []).filter((n) => typeof n === 'string');
  const m = String(model || '').trim();
  if (!m) return false;
  return names.includes(m) || (!m.includes(':') && names.includes(m + ':latest'));
}
