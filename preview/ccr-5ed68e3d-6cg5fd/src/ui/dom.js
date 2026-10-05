// Tiny DOM helpers (T-15). Panels are plain functions that return elements; there is no framework.

/** @typedef {Node | string | number | null | undefined | false} Child */

/** Properties that must be set on the element object rather than as attributes. */
const PROPERTIES = new Set(['value', 'checked', 'disabled', 'readOnly', 'selected']);

/**
 * Create an element: h('button', { class: 'btn', onclick }, 'text', childNode).
 * Falsy props and children (null, undefined, false) are skipped, so conditions read naturally.
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...(Child | Child[])} children
 * @returns {any} the element (typed loosely so call sites stay readable)
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROPERTIES.has(key)) /** @type {any} */ (el)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/**
 * @param {Element | DocumentFragment} parent
 * @param {Array<Child | Child[]>} children
 */
export function append(parent, children) {
  for (const child of /** @type {Child[]} */ (children.flat(Infinity))) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Look up an element that must exist.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any}
 */
export function must(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
