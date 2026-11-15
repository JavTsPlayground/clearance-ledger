// Saves and loads the app state. The backend (localStorage) is injected so this is testable.
// Nothing is ever deleted on a read problem: unreadable data is set aside, not overwritten.
import { emptyState, sanitizeState } from '../core/state.js';

const KEY = 'clearance-ledger-v1';

export function createStorage({ backend, loc, now = () => Date.now(), key = KEY }) {
  return {
    /** Returns { state, firstRun, recovered }. */
    load() {
      let raw = null;
      try { raw = backend.getItem(key); } catch { /* storage blocked */ }
      if (raw == null) return { state: emptyState(now(), loc), firstRun: true, recovered: false };
      try {
        return { state: sanitizeState(JSON.parse(raw), loc), firstRun: false, recovered: false };
      } catch {
        try { backend.setItem(key + '.unreadable', raw); } catch { /* nothing more to do */ }
        return { state: emptyState(now(), loc), firstRun: true, recovered: true };
      }
    },
    /** Returns true when the write worked. */
    save(state) {
      try { backend.setItem(key, JSON.stringify(state)); return true; } catch { return false; }
    },
  };
}
