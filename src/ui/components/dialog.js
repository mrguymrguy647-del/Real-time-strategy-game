// Modal dialogs built on the native <dialog> element (Safari 15.4+). The Android back gesture and
// the Escape key close a dialog with the value undefined.

import { h } from '../dom.js';

/**
 * @param {{ title: string, body?: string, content?: Node | null,
 *   actions: Array<{ label: string, value: any, kind?: 'primary' | 'danger' | 'ghost' }> }} options
 * @returns {Promise<any>} the value of the button that was tapped
 */
export function openDialog({ title, body, content, actions }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' });
    /** @param {any} value */
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(undefined);
    });
    dialog.append(
      h('h2', { class: 'dialog__title' }, title),
      body && h('p', { class: 'dialog__body' }, body),
      content,
      h(
        'div',
        { class: 'dialog__actions' },
        actions.map((action) =>
          h(
            'button',
            { class: `btn btn--block ${action.kind ? `btn--${action.kind}` : ''}`.trim(), type: 'button', onclick: () => finish(action.value) },
            action.label,
          ),
        ),
      ),
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * @param {{ title: string, body?: string, confirmLabel: string, cancelLabel: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
export async function confirmDialog({ title, body, confirmLabel, cancelLabel, danger = false }) {
  const answer = await openDialog({
    title,
    body,
    actions: [
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
      { label: cancelLabel, value: false, kind: 'ghost' },
    ],
  });
  return answer === true;
}
