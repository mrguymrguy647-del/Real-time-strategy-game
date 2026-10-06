// The info panel for a tapped country (and the region inside it), or for a grey country of the rest of
// the world, which only has a name. A bottom sheet on a portrait phone, a side sheet on a wide or
// landscape screen; the layout is CSS (.sheet). It only reads data.

import { t, tn } from '../../util/i18n.js';
import { h } from '../dom.js';
import { formatMoney, formatMoneyMn, formatPercent, formatPerPerson, formatPopulation } from '../format.js';

/**
 * @param {{
 *   data: import('../../core/data.js').GameData,
 *   colorOf: (countryId: string) => string,
 *   worldName: (countryId: string) => string,
 *   onRegion: (regionId: string) => void,
 *   onClose: () => void,
 *   economyOf?: (countryId: string) => import('../economyView.js').EconomyView | null,
 *   actionsFor?: (countryId: string) => Node | null,
 * }} options
 *   `economyOf`: the money facts to show (the start of a scenario, or a running game's numbers);
 *   `actionsFor`: a button row for a playable country (Play as…, Budget)
 */
export function createCountryPanel({ data, colorOf, worldName, onRegion, onClose, economyOf, actionsFor }) {
  const el = h('aside', { class: 'sheet', role: 'region', 'aria-label': t('map.title'), hidden: true });
  /** The selection on show, so refresh() can draw it again with newer numbers. @type {{ countryId: string | null, regionId: string | null, world: boolean }} */
  let current = { countryId: null, regionId: null, world: false };

  /** @param {string} label @param {string} value */
  const fact = (label, value) => h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));

  /** @param {any} region */
  function regionSection(region) {
    const cities = region.cities.map((/** @type {any} */ c) => t('map.city', { name: c.name, tier: t(`map.tier.${c.tier}`) })).join(', ');
    return h(
      'section',
      { class: 'sheet__region', 'data-region': region.id },
      h('h3', null, t('map.panel.region'), ': ', region.name, region.contested ? h('span', { class: 'badge' }, t('map.panel.disputed')) : null),
      h(
        'dl',
        { class: 'facts' },
        fact(t('map.panel.terrain'), t(`map.terrain.${region.terrain}`)),
        fact(t('map.panel.cities'), cities || t('map.noCities')),
      ),
      region.note ? h('p', { class: 'muted sheet__note' }, region.note) : null,
    );
  }

  /** The money facts of a country: what the state takes in, what it has in the bank, what it owes. @param {import('../economyView.js').EconomyView} economy */
  function economyFacts(economy) {
    return [
      fact(t('map.panel.revenue'), t('units.ofGdp', { percent: formatPercent(economy.taxRate, { decimals: 0 }) })),
      fact(t('map.panel.treasury'), formatMoneyMn(economy.treasuryMn)),
      fact(t('map.panel.debt'), t('units.ofGdp', { percent: formatPercent(economy.debtMn / (economy.gdpBn * 1000), { decimals: 0 }) })),
    ];
  }

  return {
    el,

    /** Draw the same selection again, for example after a turn changed the numbers. */
    refresh() {
      if (!el.hidden) this.show(current);
    },

    /** Put the panel away without changing what the map has selected. */
    hide() {
      el.hidden = true;
    },

    /** @param {{ countryId: string | null, regionId: string | null, world: boolean }} selection */
    show(selection) {
      current = selection;
      const { countryId, regionId, world } = selection;
      if (!countryId) {
        el.hidden = true;
        return;
      }
      if (world) {
        el.replaceChildren(
          h(
            'header',
            { class: 'sheet__head' },
            h('span', { class: 'sheet__swatch sheet__swatch--grey' }),
            h('div', { class: 'sheet__heading' }, h('h2', { class: 'sheet__title' }, worldName(countryId)), h('p', { class: 'muted' }, t('map.panel.notPlayable'))),
            h('button', { class: 'btn btn--ghost btn--small sheet__close', type: 'button', 'aria-label': t('map.panel.close'), onclick: onClose }, '×'),
          ),
          h('p', { class: 'muted sheet__note' }, t('map.panel.notPlayableBody')),
        );
        el.hidden = false;
        el.scrollTop = 0;
        return;
      }
      const country = data.countries.byId[countryId];
      const government = data.governments.byId[country.government];
      const regionIds = data.regionsByCountry[countryId] ?? [];
      const economy = economyOf?.(countryId) ?? null;
      const gdp = economy?.gdpBn ?? country.start?.economy?.gdpBn;
      /** @type {Array<Node | null>} */
      const parts = [
        h(
          'header',
          { class: 'sheet__head' },
          h('span', { class: 'sheet__swatch', style: `background:${colorOf(countryId)}` }),
          h('div', { class: 'sheet__heading' }, h('h2', { class: 'sheet__title' }, country.name), h('p', { class: 'muted' }, `${government?.icon ?? ''} ${government?.name ?? ''}`.trim())),
          h('button', { class: 'btn btn--ghost btn--small sheet__close', type: 'button', 'aria-label': t('map.panel.close'), onclick: onClose }, '×'),
        ),
        h(
          'dl',
          { class: 'facts' },
          fact(t('map.panel.capital'), country.capital.name),
          fact(t('map.panel.population'), formatPopulation(country.population)),
          gdp ? fact(t('map.panel.gdp'), formatMoney(gdp)) : null,
          gdp ? fact(t('map.panel.gdpPerPerson'), formatPerPerson(gdp, country.population)) : null,
          fact(t('map.panel.role'), t(`map.role.${country.aiTier}`)),
          fact(t('map.panel.regions'), tn('map.panel.regionCount', regionIds.length)),
          ...(economy ? economyFacts(economy) : []),
        ),
        actionsFor?.(countryId) ?? null,
        country.note ? h('p', { class: 'muted sheet__note' }, country.note) : null,
        regionId ? regionSection(data.regions.byId[regionId]) : null,
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': t('map.panel.regions') },
          regionIds.map((/** @type {string} */ id) =>
            h('button', { class: `chip${id === regionId ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(id === regionId), 'data-region': id, onclick: () => onRegion(id) }, data.regions.byId[id].name),
          ),
        ),
      ];
      el.replaceChildren(...parts.filter((part) => part !== null)); // replaceChildren turns null into the text "null"
      el.hidden = false;
      el.scrollTop = 0;
    },
  };
}
