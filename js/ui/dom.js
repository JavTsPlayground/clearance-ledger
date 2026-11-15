// Tiny element builder. Text is always inserted as text, never parsed as HTML, so names that come
// from a photo or a backup file cannot inject markup.

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (PROPS.has(k)) el[k] = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export function replace(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
}

/** Re-renders `fn` but keeps keyboard focus on the same control (matched by data-key). */
export function keepFocus(root, fn) {
  const active = document.activeElement;
  const key = active && root.contains(active) ? active.getAttribute('data-key') : null;
  fn();
  if (key) {
    const again = [...root.querySelectorAll('[data-key]')].find((n) => n.getAttribute('data-key') === key);
    if (again) again.focus({ preventScroll: true });
  }
}

export function labelled(id, text, input, full = false) {
  return h('div', { class: 'field' + (full ? ' full' : '') }, h('label', { for: id }, text), input);
}
