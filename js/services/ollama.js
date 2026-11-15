// Talks to Ollama on Jinx. fetch and the settings are injected so this is testable without a network.
import { buildChatRequest, parseVision, VisionError } from '../core/vision.js';
import { normalizeUrl } from '../core/settings.js';

export class OllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
  }
}

const PING_MS = 8_000;
const IDENTIFY_MS = 180_000; // the first call after a pause loads the model, which can take a minute

export function createOllama({ fetch: doFetch, getSettings }) {
  function base() {
    const url = normalizeUrl(getSettings().ollamaUrl);
    if (!url) throw new OllamaError('not_configured', 'Add your Jinx address in Setup first.');
    return url;
  }

  /** fetch with a timeout and a caller-controlled cancel. Maps failures to OllamaError codes. */
  async function request(url, init, ms, signal, notFound) {
    const ctl = new AbortController();
    let why = '';
    const onAbort = () => { why = 'cancelled'; ctl.abort(); };
    if (signal) {
      if (signal.aborted) throw new OllamaError('cancelled', 'Cancelled.');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => { why = 'timeout'; ctl.abort(); }, ms);
    try {
      const res = await doFetch(url, { ...init, signal: ctl.signal });
      if (res.status === 403) {
        throw new OllamaError('forbidden', 'Ollama refused this app. Add this app’s address to OLLAMA_ORIGINS on Jinx.');
      }
      if (res.status === 404) {
        throw notFound || new OllamaError('model_missing', 'That model is not on Jinx. Pull it first, or pick another in Setup.');
      }
      if (!res.ok) throw new OllamaError('server_error', `Jinx answered with an error (${res.status}).`);
      return await res.json();
    } catch (e) {
      if (e instanceof OllamaError) throw e;
      if (why === 'cancelled') throw new OllamaError('cancelled', 'Cancelled.');
      if (why === 'timeout') throw new OllamaError('timeout', 'Jinx took too long to answer. Try again.');
      if (e && e.name === 'SyntaxError') throw new OllamaError('server_error', 'Jinx sent a reply this app could not read.');
      throw new OllamaError('unreachable', 'Cannot reach Jinx. Check that Tailscale is on, Jinx is awake and Ollama is running.');
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  return {
    isConfigured() { return !!normalizeUrl(getSettings().ollamaUrl); },

    /** Lists installed model names. Throws OllamaError. */
    async ping(signal) {
      const wrong = new OllamaError('wrong_address', 'Something answered, but it is not Ollama. Check the address in Setup.');
      const data = await request(base() + '/api/tags', { method: 'GET' }, PING_MS, signal, wrong);
      const models = Array.isArray(data && data.models) ? data.models.map((m) => m && m.name).filter(Boolean) : [];
      return { models };
    },

    /** Sends one photo (raw base64) and returns { name, brand, cat, code, confidence }. */
    async identify(imageB64, signal) {
      const { model } = getSettings();
      const body = JSON.stringify(buildChatRequest(model, imageB64));
      const reply = await request(
        base() + '/api/chat',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        IDENTIFY_MS,
        signal,
      );
      try {
        return parseVision(reply);
      } catch (e) {
        if (e instanceof VisionError) throw new OllamaError(e.code, e.message);
        throw e;
      }
    },
  };
}
