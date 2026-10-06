// The info panel for a tapped country (and the region inside it). A bottom sheet on a portrait phone,
// a side sheet on a wide or landscape screen; the layout is CSS (.sheet). It only reads data.

import { t, tn } from '../../util/i18n.js';
import { h } from '../dom.js';
import { formatMoney, formatPerPerson, formatPopulation } from '../format.js';

/**
 * @param {{
 *   data: import('../../core/data.js').GameData,
 *   colorOf: (countryId: string) => string,
 *   onRegion: (regionId: string) => void,
 *   onClose: () => void,
 * }} options
 */
export function createCountryPanel({ data, colorOf, onRegion, onClose }) {
  const el = h('aside', { class: 'sheet', role: 'region', 'aria-label': t('map.title'), hidden: true });

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

  return {
    el,

    /** @param {{ countryId: string | null, regionId: string | null }} selection */
    show({ countryId, regionId }) {
      if (!countryId) {
        el.hidden = true;
        return;
      }
      const country = data.countries.byId[countryId];
      const government = data.governments.byId[country.government];
      const regionIds = data.regionsByCountry[countryId] ?? [];
      const gdp = country.start?.economy?.gdpBn;
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
          fact(t('map.panel.regions'), tn('map.panel.regionCount', regionIds.length)),
        ),
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
