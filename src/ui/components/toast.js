// Short messages that appear above the bottom bar and fade away; optionally with one action.

import { h } from '../dom.js';

/** @param {HTMLElement} root */
export function createToasts(root) {
  const layer = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  root.append(layer);

  return {
    /**
     * @param {string} message
     * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
     *   duration 0 keeps the toast until it is dismissed
     * @returns {() => void} dismiss
     */
    show(message, { actionLabel, onAction, duration = 4500 } = {}) {
      const toast = h(
        'div',
        { class: 'toast' },
        h('span', null, message),
        actionLabel &&
          h(
            'button',
            {
              class: 'toast__action',
              type: 'button',
              onclick: () => {
                onAction?.();
                toast.remove();
              },
            },
            actionLabel,
          ),
      );
      layer.append(toast);
      if (duration > 0) setTimeout(() => toast.remove(), duration);
      return () => toast.remove();
    },
  };
}
