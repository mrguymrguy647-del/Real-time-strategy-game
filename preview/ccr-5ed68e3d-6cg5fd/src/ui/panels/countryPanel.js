// The info panel for a tapped country (and the region inside it), or for a grey country of the rest of
// the world, which only has a name. A bottom sheet on a portrait phone, a side sheet on a wide or
// landscape screen; the layout is CSS (.sheet). It only reads data.

import { t, tn } from '../../util/i18n.js';
import { h } from '../dom.js';
import { formatMoney, formatMoneyMn, formatPercent, formatPerPerson, formatPopulation } from '../format.js';
import { lastsText, positionText } from '../resourceText.js';

/**
 * @param {{
 *   data: import('../../core/data.js').GameData,
 *   colorOf: (countryId: string) => string,
 *   worldName: (countryId: string) => string,
 *   onRegion: (regionId: string) => void,
 *   onClose: () => void,
 *   economyOf?: (countryId: string) => import('../economyView.js').EconomyView | null,
 *   resourcesOf?: (countryId: string) => import('../resourcesView.js').ResourceLine[] | null,
 *   actionsFor?: (countryId: string) => Node | null,
 *   regionExtra?: (regionId: string) => Node | null,
 *   regionFirst?: boolean,
 * }} options
 *   `economyOf`: the money facts to show (the start of a scenario, or a running game's numbers);
 *   `resourcesOf`: what the country makes, uses and keeps, the same way;
 *   `actionsFor`: a button row for a playable country (Play as…, Budget);
 *   `regionExtra`: more for the tapped region (the game adds what holding it would be worth);
 *   `regionFirst`: show the tapped region right under the title, above the country (the game: it is what was tapped for)
 */
export function createCountryPanel({ data, colorOf, worldName, onRegion, onClose, economyOf, resourcesOf, actionsFor, regionExtra, regionFirst = false }) {
  const el = h('aside', { class: 'sheet', role: 'region', 'aria-label': t('map.title'), hidden: true });
  /** The selection on show, so refresh() can draw it again with newer numbers. @type {{ countryId: string | null, regionId: string | null, world: boolean }} */
  let current = { countryId: null, regionId: null, world: false };

  /** @param {string} label @param {string} value */
  const fact = (label, value) => h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));

  /** @param {any} region */
  function regionSection(region) {
    const cities = region.cities.map((/** @type {any} */ c) => t('map.city', { name: c.name, tier: t(`map.tier.${c.tier}`) })).join(', ');
    // what the region makes, as shares of its country's output (the shares are in regions.json)
    const makes = data.activeResources
      .filter((/** @type {any} */ resource) => (region.output?.[resource.id] ?? 0) >= 0.01)
      .map((/** @type {any} */ resource) => t('map.panel.makesItem', { icon: resource.icon, name: resource.name, percent: formatPercent(region.output[resource.id], { decimals: 0 }) }));
    return h(
      'section',
      { class: 'sheet__region', 'data-region': region.id },
      h('h3', null, t('map.panel.region'), ': ', region.name, region.contested ? h('span', { class: 'badge' }, t('map.panel.disputed')) : null),
      regionExtra?.(region.id) ?? null, // what holding it would be worth comes first: it is what a player taps a region for
      h(
        'dl',
        { class: 'facts' },
        fact(t('map.panel.terrain'), t(`map.terrain.${region.terrain}`)),
        fact(t('map.panel.cities'), cities || t('map.noCities')),
        region.popShare === undefined ? null : fact(t('map.panel.share'), t('map.panel.shareValue', { people: formatPercent(region.popShare, { decimals: 0 }), economy: formatPercent(region.gdpShare, { decimals: 0 }) })),
        makes.length > 0 ? fact(t('map.panel.makes'), makes.join(' · ')) : null,
      ),
      makes.length > 0 ? h('p', { class: 'muted sheet__note' }, t('map.panel.makesNote')) : null,
      region.note ? h('p', { class: 'muted sheet__note' }, region.note) : null,
    );
  }

  /**
   * What the country makes, uses and keeps, and the straits its sea trade passes: the resource picture of a country.
   * @param {any} country its entry in countries.json
   * @param {import('../resourcesView.js').ResourceLine[]} lines
   */
  function resourceSection(country, lines) {
    const routes = Object.entries(country.chokepoints ?? {})
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b[1] - a[1])
      .map(([id, share]) => t('map.panel.routeItem', { name: data.chokepoints.byId[id]?.name ?? id, percent: formatPercent(/** @type {number} */ (share), { decimals: 0 }) }));
    return h(
      'section',
      { class: 'sheet__resources' },
      h('h3', null, t('map.panel.resources')),
      h(
        'dl',
        { class: 'facts facts--resources' },
        lines.map((line) => {
          const resource = data.resources.byId[line.id];
          const lasts = lastsText(line);
          return h('div', { class: 'fact', 'data-resource': line.id }, h('dt', null, `${resource.icon} ${resource.name}`), h('dd', null, positionText(line), lasts ? h('small', { class: 'muted fact__more' }, lasts) : null));
        }),
      ),
      routes.length > 0 ? h('p', { class: 'muted sheet__note' }, t('map.panel.routes', { list: routes.join(', ') })) : null,
    );
  }

  /** The money facts of a country: what the state takes in, what it has in the bank, what it owes. @param {import('../economyView.js').EconomyView} economy */
  function economyFacts(economy) {
    const income = economy.taxRate + economy.resourceShare;
    return [
      h(
        'div',
        { class: 'fact' },
        h('dt', null, t('map.panel.revenue')),
        h('dd', null, t('units.ofGdp', { percent: formatPercent(income, { decimals: 0 }) }), economy.resourceShare >= 0.005 ? h('small', { class: 'muted fact__more' }, t('map.panel.revenueSplit', { taxes: formatPercent(economy.taxRate, { decimals: 0 }), resources: formatPercent(economy.resourceShare, { decimals: 0 }) })) : null),
      ),
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
      const resources = resourcesOf?.(countryId) ?? null;
      const gdp = economy?.gdpBn ?? country.start?.economy?.gdpBn;
      const regionPart = regionId ? regionSection(data.regions.byId[regionId]) : null;
      /** @type {Array<Node | null>} */
      const parts = [
        h(
          'header',
          { class: 'sheet__head' },
          h('span', { class: 'sheet__swatch', style: `background:${colorOf(countryId)}` }),
          h('div', { class: 'sheet__heading' }, h('h2', { class: 'sheet__title' }, country.name), h('p', { class: 'muted' }, `${government?.icon ?? ''} ${government?.name ?? ''}`.trim())),
          h('button', { class: 'btn btn--ghost btn--small sheet__close', type: 'button', 'aria-label': t('map.panel.close'), onclick: onClose }, '×'),
        ),
        regionFirst ? regionPart : null,
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
        resources ? resourceSection(country, resources) : null,
        country.note ? h('p', { class: 'muted sheet__note' }, country.note) : null,
        regionFirst ? null : regionPart,
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
