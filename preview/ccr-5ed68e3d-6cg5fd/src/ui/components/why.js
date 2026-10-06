// The "why?" of a number (pillar 2: every number can say where it comes from). A formula gives its
// value together with its parts (formulas/explain.js); this turns them into a short list: the parts
// with their labels, and the total. The labels are in data/i18n/en.json as "why.<context>.<id>".

import { t } from '../../util/i18n.js';
import { h } from '../dom.js';
import { formatMoneyMn, formatPercent } from '../format.js';

/** @typedef {(value: number) => string} Writer */

/** @type {Record<string, Writer>} */
const WRITERS = {
  money: (value) => formatMoneyMn(value),
  percent: (value) => formatPercent(value),
  percentSigned: (value) => formatPercent(value, { signed: true }),
  rate: (value) => formatPercent(value, { decimals: 2 }),
  times: (value) => `×${Math.round(value * 100) / 100}`,
};

/**
 * How the parts of each explained number are written. A context is the name of the number
 * (economy `last.why` keys); a part not listed uses the context's `default`.
 * @type {Record<string, { default: string, parts?: Record<string, string>, total: string }>}
 */
const CONTEXTS = {
  revenue: { default: 'money', parts: { taxRate: 'percent', difficulty: 'times' }, total: 'money' },
  spending: { default: 'money', total: 'money' },
  interestRate: { default: 'percent', total: 'percent' },
  interest: { default: 'money', parts: { rate: 'rate' }, total: 'money' },
  growth: { default: 'percentSigned', total: 'percentSigned' },
};

/**
 * @param {string} context for example "revenue"
 * @param {import('../../formulas/explain.js').Explained} explained
 * @returns {{ label: string, text: string, total?: boolean }[]} one line per part, then the total
 */
export function whyLines(context, explained) {
  const config = CONTEXTS[context];
  if (!config) throw new Error(`Unknown number "${context}"`);
  const lines = explained.parts.map((part, i) => ({
    label: `${explained.op === 'product' && i > 0 ? '× ' : ''}${t(`why.${context}.${part.id}`)}`,
    text: WRITERS[config.parts?.[part.id] ?? config.default](part.value),
  }));
  return [...lines, { label: t('why.total'), text: WRITERS[config.total](explained.value), total: true }];
}

/**
 * The list as an element, to show under the number it explains.
 * @param {string} context
 * @param {import('../../formulas/explain.js').Explained} explained
 */
export function whyList(context, explained) {
  return h(
    'dl',
    { class: 'why' },
    whyLines(context, explained).map((line) => h('div', { class: `why__line${line.total ? ' why__line--total' : ''}` }, h('dt', null, line.label), h('dd', null, line.text))),
  );
}
