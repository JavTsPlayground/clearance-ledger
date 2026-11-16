// The one place state changes. Every change is saved, then views are told.
import { mergeRules } from './core/calc.js';
import { normItem, newId } from './core/items.js';
import { emptyState, sanitizeState } from './core/state.js';
import { sanitizeSettings } from './core/settings.js';

export function createStore({ storage, loc, onSaveError = () => {} }) {
  const loaded = storage.load();
  let state = loaded.state;
  const subs = new Set();

  function commit(next) {
    state = next;
    if (!storage.save(state)) onSaveError();
    subs.forEach((fn) => fn(state));
  }

  return {
    get state() { return state; },
    firstRun: loaded.firstRun,
    recovered: loaded.recovered,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    addItem(data) {
      const item = normItem({ ...data, id: newId(), createdAt: Date.now(), example: false });
      commit({ ...state, items: [item, ...state.items] });
      return item;
    },
    patchItem(id, patch) {
      commit({ ...state, items: state.items.map((i) => (i.id === id ? normItem({ ...i, ...patch, id }) : i)) });
    },
    removeItem(id) {
      const gone = state.items.find((i) => i.id === id);
      if (!gone) return null;
      commit({ ...state, items: state.items.filter((i) => i.id !== id) });
      return gone;
    },
    /** Puts back items removed earlier (undo), keeping the newest-first order. */
    restoreItems(items) {
      const have = new Set(state.items.map((i) => i.id));
      const back = items.filter((i) => !have.has(i.id));
      const all = [...back, ...state.items].sort((a, b) => b.createdAt - a.createdAt);
      commit({ ...state, items: all });
    },
    clearExamples() {
      const gone = state.items.filter((i) => i.example);
      if (gone.length) commit({ ...state, items: state.items.filter((i) => !i.example) });
      return gone;
    },
    setRules(rules) { commit({ ...state, rules: mergeRules(rules) }); },
    setSettings(s) { commit({ ...state, settings: sanitizeSettings({ ...state.settings, ...s }, loc) }); },
    replaceAll(next) { commit(sanitizeState(next, loc)); },
    /** Wipes everything back to first-run. Returns the previous state for undo. */
    resetAll() {
      const prev = state;
      commit({ ...emptyState(Date.now(), loc), items: [] });
      return prev;
    },
  };
}
