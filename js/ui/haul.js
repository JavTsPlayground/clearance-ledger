// Haul tab: totals and the list of finds with status, sold price and undoable delete.
import { itemCalc, summarize, CATS, STATUSES } from '../core/items.js';
import { money } from '../core/format.js';
import { h, replace, keepFocus } from './dom.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function mountHaul(root, { store, toast }) {
  const hours = h('input', { id: 'h-hours', type: 'number', inputmode: 'decimal', step: '0.5', min: '0', placeholder: 'Sourcing, listing, shipping' });
  hours.addEventListener('change', () => {
    const n = parseFloat(hours.value);
    store.setRules({ ...store.state.rules, hours: Number.isFinite(n) && n >= 0 ? n : 0 });
  });

  const sumBox = h('div', { class: 'sum', id: 'sum' });
  const exFlag = h('p', { class: 'hint', hidden: true }, 'Totals include example rows.');
  const clearBtn = h('button', { class: 'btn ghost small', type: 'button', id: 'btn-clear-examples', hidden: true, 'data-key': 'clear' }, 'Clear examples');
  const list = h('div', { id: 'list' });

  clearBtn.addEventListener('click', () => {
    const gone = store.clearExamples();
    if (gone.length) toast(`Cleared ${gone.length} example rows.`, { label: 'Undo', onClick: () => store.restoreItems(gone) });
  });

  function itemEl(it, rules) {
    const c = itemCalc(it, rules);
    const status = h('div', { class: 'seg', role: 'group', 'aria-label': `Status of ${it.name}` },
      STATUSES.map((s) => h('button', {
        type: 'button', 'aria-pressed': String(it.status === s), 'data-key': `${it.id}:${s}`,
        onclick: () => {
          if (it.status === s) return;
          store.patchItem(it.id, s === 'sold' && !(it.soldPrice > 0) ? { status: s, soldPrice: it.sell } : { status: s });
        },
      }, cap(s))));
    const soldIn = it.status === 'sold'
      ? h('label', { class: 'soldl', for: 'sold-' + it.id }, 'Sold for $',
        h('input', {
          class: 'soldin', id: 'sold-' + it.id, type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: c.price.toFixed(2), 'data-key': `${it.id}:sold-price`,
          onchange: (e) => { const n = parseFloat(e.target.value); store.patchItem(it.id, { soldPrice: Number.isFinite(n) ? n : 0 }); },
        }))
      : null;
    const del = h('button', {
      class: 'btn ghost small', type: 'button', 'data-key': `${it.id}:delete`, 'aria-label': `Delete ${it.name}`,
      onclick: () => {
        const gone = store.removeItem(it.id);
        if (gone) toast('Item deleted.', { label: 'Undo', onClick: () => store.restoreItems([gone]) });
      },
    }, 'Delete');
    return h('div', { class: 'item', 'data-id': it.id },
      h('div', null,
        h('div', { class: 'iname' }, it.name, it.example ? h('span', { class: 'ex' }, 'Example') : null),
        h('div', { class: 'imeta' }, `${CATS[it.cat].label} · ${rules.fees[it.plat].name} · ${money(it.cost)} → ${money(c.price)}`)),
      h('div', { class: 'inet ' + (c.net >= 0 ? 'pos' : 'neg') }, money(c.net), h('small', null, c.sold ? 'made' : 'expected')),
      h('div', { class: 'ctrls' }, status, soldIn, del));
  }

  function render() {
    keepFocus(root, () => {
      const { items, rules } = store.state;
      const s = summarize(items, rules);
      replace(sumBox, [
        ['Cash in stock', money(s.stock)], ['Profit made', money(s.made)],
        ['Profit once sold', money(s.pending)], ['Per hour', s.perHour == null ? '—' : money(s.perHour)],
      ].map(([k, v]) => h('div', null, h('span', { class: 'lbl' }, k), h('b', null, v))));
      exFlag.hidden = !s.hasExample;
      clearBtn.hidden = !s.hasExample;
      if (document.activeElement !== hours) hours.value = rules.hours > 0 ? String(rules.hours) : '';
      replace(list, items.length
        ? items.map((it) => itemEl(it, rules))
        : h('p', { class: 'empty' }, 'Nothing logged yet. Check an item on the Check tab and tap Add to haul.'));
    });
  }

  replace(root,
    h('div', { class: 'card' }, sumBox,
      h('div', { class: 'field' }, h('label', { for: 'h-hours' }, 'Hours worked so far'), hours),
      exFlag),
    h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h2', null, 'Items'), clearBtn), list));

  store.subscribe(render);
  render();
}
