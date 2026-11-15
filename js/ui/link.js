// Tracks whether Photo ID can work right now (Jinx reachable, model installed).
import { hasModel } from '../core/settings.js';

export const LINK_LABEL = {
  off: 'Photo ID off',
  checking: 'Checking',
  ready: 'Jinx ready',
  down: 'Jinx offline',
  nomodel: 'Model missing',
};

export function createLink({ ollama, store }) {
  let kind = 'off', detail = '', models = [], token = 0;
  const subs = new Set();
  const set = (k, d) => { kind = k; detail = d; subs.forEach((fn) => fn()); };

  async function refresh() {
    const mine = ++token;
    if (!ollama.isConfigured()) {
      models = [];
      set('off', 'Photo ID is not set up. Barcode scanning still works.');
      return;
    }
    set('checking', 'Checking Jinx...');
    try {
      const r = await ollama.ping();
      if (mine !== token) return;
      models = r.models;
      const m = store.state.settings.model;
      if (hasModel(models, m)) set('ready', `Jinx is ready. Using ${m}.`);
      else if (models.length) set('nomodel', `Jinx is on, but ${m} is not installed. Pick one of its models in Setup, or run: ollama pull ${m}`);
      else set('nomodel', `Jinx is on but has no models yet. Run: ollama pull ${m}`);
    } catch (e) {
      if (mine !== token) return;
      models = [];
      set('down', e && e.message ? e.message : 'Cannot reach Jinx.');
    }
  }

  return {
    get kind() { return kind; },
    get detail() { return detail; },
    get models() { return models; },
    refresh,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
