// Which map labels to show. Pure, so it can be tested: given the labels in priority order, keep one
// only when it lies fully inside the part of the screen no panel covers (a name cut off by the edge
// reads like a bug) and does not sit on top of a label that was already kept (names never pile up).

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} LabelBox  centre and size in CSS pixels
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Area  a rectangle in CSS pixels
 */

/** @param {LabelBox} box @param {Area} area */
export function isInside(box, area) {
  return box.x - box.w / 2 >= area.left && box.x + box.w / 2 <= area.right && box.y - box.h / 2 >= area.top && box.y + box.h / 2 <= area.bottom;
}

/** Whether two boxes touch, keeping `gap` pixels free around each. @param {LabelBox} a @param {LabelBox} b @param {number} [gap] */
export function boxesOverlap(a, b, gap = 4) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;
}

/**
 * @param {Array<LabelBox | null>} boxes in priority order, best first; null for a label that is not wanted at all
 * @param {Area} area where labels may be drawn
 * @param {LabelBox[]} [reserved] places something else sits on (buttons, a title): no label may touch them
 * @returns {boolean[]} for each label, whether it is shown
 */
export function chooseLabels(boxes, area, reserved = []) {
  /** @type {LabelBox[]} */
  const kept = [...reserved];
  return boxes.map((box) => {
    if (!box || !isInside(box, area) || kept.some((other) => boxesOverlap(box, other))) return false;
    kept.push(box);
    return true;
  });
}
