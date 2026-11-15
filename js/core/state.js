// App state shape, validation and backup text. Pure.
import { mergeRules } from './calc.js';
import { normItem, exampleItems } from './items.js';
import { sanitizeSettings } from './settings.js';

export const STATE_VERSION = 1;
export const APP_ID = 'clearance-ledger';
const MAX_ITEMS = 2000;
const MAX_IMPORT_CHARS = 2_000_000;

export function emptyState(now = Date.now(), loc) {
  return {
    v: STATE_VERSION,
    rules: mergeRules(),
    items: exampleItems(now),
    settings: sanitizeSettings(null, loc),
  };
}

/** Accepts anything, returns a state that is safe to use. */
export function sanitizeState(raw, loc) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const items = [];
  for (const r of Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS) : []) {
    const it = normItem(r);
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }
  return {
    v: STATE_VERSION,
    rules: mergeRules(d.rules),
    items,
    settings: sanitizeSettings(d.settings, loc),
  };
}

export function exportText(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, exportedAt: now.toISOString(), ...state }, null, 2);
}

/** Returns { ok: true, state } or { ok: false, error } with a message fit to show. */
export function parseImport(text, loc) {
  const s = String(text == null ? '' : text);
  if (!s.trim()) return { ok: false, error: 'That file is empty.' };
  if (s.length > MAX_IMPORT_CHARS) return { ok: false, error: 'That file is too large to be a backup.' };
  let d;
  try { d = JSON.parse(s); } catch { return { ok: false, error: 'That file is not a Clearance Ledger backup.' }; }
  if (!d || d.app !== APP_ID || !Array.isArray(d.items)) {
    return { ok: false, error: 'That file is not a Clearance Ledger backup.' };
  }
  return { ok: true, state: sanitizeState(d, loc) };
}
