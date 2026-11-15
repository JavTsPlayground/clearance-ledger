// Pairs tab: which unsold items sell better together, and what to look for next.
import { planBundles } from '../core/bundles.js';
import { CATS } from '../core/items.js';
import { money } from '../core/format.js';
import { h, replace } from './dom.js';

export function mountPairs(root, { store }) {
  const bundlesBox = h('div', { class: 'view', id: 'bundles' });
  const huntBox = h('div', { class: 'card', id: 'hunt' });

  function bundleEl(b, rules) {
    return h('article', { class: 'card' },
      h('div', { class: 'bhead' }, h('h3', null, b.rule.name), h('span', { class: 'pill ' + (b.worth ? 'good' : 'warn') }, b.worth ? 'Bundle it' : 'Keep separate')),
      h('ul', { class: 'blist' }, b.items.map((i) => h('li', null, h('span', null, i.name), h('span', null, money(i.sell))))),
      h('div', { class: 'cmp' },
        h('div', null, h('span', { class: 'lbl' }, 'Sold apart'), h('b', null, money(b.apart))),
        h('div', null, h('span', { class: 'lbl' }, 'As one lot'), h('b', null, money(b.lot))),
        h('div', null, h('span', { class: 'lbl' }, 'Difference'), h('b', { class: b.delta >= 0 ? 'pos' : 'neg' }, (b.delta >= 0 ? '+' : '') + money(b.delta)))),
      h('p', { class: 'hint' }, `One listing instead of ${b.items.length}. Lot at ${money(b.sell)} (+${b.rule.prem}%) on ${rules.fees[b.plat].name}, ships for ${money(b.ship)}. ${b.rule.note}`));
  }

  function render() {
    const { items, rules } = store.state;
    const plan = planBundles(items, rules);
    replace(bundlesBox, plan.bundles.length
      ? plan.bundles.map((b) => bundleEl(b, rules))
      : h('div', { class: 'card' }, h('h2', null, 'No bundles yet'),
        h('p', { class: 'hint' }, 'Bundles show up when your unsold items share a theme, like two skincare items or a candle with bath products. Log a few finds and check back.')));
    replace(huntBox, h('h2', null, 'Look for next'),
      plan.hunt.length
        ? h('ul', { class: 'huntlist' }, plan.hunt.map((x) => h('li', null,
          h('strong', null, `${x.rule.name} (+${x.rule.prem}%)`),
          h('span', { class: 'hint' }, `You have ${x.have.name}. ${x.same ? 'One more' : 'Add a'} ${CATS[x.need].label.toLowerCase()} item to unlock it.`))))
        : h('p', { class: 'hint' }, 'Nothing to chase right now. Add finds from more than one category and ideas will appear here.'));
    document.getElementById('chip-pairs').textContent = String(plan.bundles.length);
  }

  replace(root, bundlesBox, huntBox,
    h('p', { class: 'hint' }, 'Lot price is the sum of expected prices plus the lift on each idea. One shipment costs the largest single ship cost plus $1.50 per extra item, with one marketplace fee. The lift is a planning estimate, not measured data. Test one lot before buying more to fill it.'));
  store.subscribe(render);
  render();
}
