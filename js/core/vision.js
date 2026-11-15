// Photo identification through a local Ollama vision model. Pure: builds the request and
// validates the reply. The network call lives in services/ollama.js.
import { CAT_KEYS } from './items.js';
import { validCode } from './barcode.js';

export class VisionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'VisionError';
    this.code = code;
  }
}

// No prices on purpose. A 7B model does not know resale prices, and a made-up number looks real.
export const VISION_PROMPT = [
  'You are helping a reseller identify a retail product from a photo of its package or shelf tag.',
  'Reply with one JSON object only.',
  '"name": brand, product and size or count, worded like an Amazon title. Use "" if you cannot read it.',
  '"brand": the brand, or "".',
  `"category": exactly one of ${CAT_KEYS.join(', ')}, or "" if none fit.`,
  '"upc": barcode digits only if they are clearly printed and legible in the photo, otherwise "".',
  '"confidence": "high" if you read the name on the package, "medium" if you inferred it, "low" if unsure.',
  'Never invent a barcode, brand or size. Say "" when unsure.',
].join(' ');

export const VISION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    name: { type: 'string' },
    brand: { type: 'string' },
    category: { type: 'string' },
    upc: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['name', 'brand', 'category', 'upc', 'confidence'],
});

/** Body for POST /api/chat. `imageB64` is raw base64 with no data: prefix. */
export function buildChatRequest(model, imageB64, keepAlive = '10m') {
  return {
    model,
    stream: false,
    keep_alive: keepAlive,
    format: VISION_SCHEMA,
    options: { temperature: 0, num_predict: 300 },
    messages: [{ role: 'user', content: VISION_PROMPT, images: [imageB64] }],
  };
}

function parseLooseJson(text) {
  const s = String(text || '');
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ }
  }
  return null;
}

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

/** Turns an Ollama /api/chat reply into a safe result, or throws VisionError. */
export function parseVision(reply) {
  const content = reply && reply.message && reply.message.content;
  const d = parseLooseJson(content);
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    throw new VisionError('bad_response', 'The model did not return readable data.');
  }
  const code = validCode(d.upc);
  const name = clip(d.name, 120);
  if (!name && !code) throw new VisionError('nothing_found', 'The model could not tell what the item is.');
  return {
    name: name || `Barcode ${code}`,
    brand: clip(d.brand, 60),
    cat: CAT_KEYS.includes(d.category) ? d.category : '',
    code,
    confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'low',
  };
}
