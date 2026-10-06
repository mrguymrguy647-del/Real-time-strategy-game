// Turns raw pointer events into map gestures: drag to pan, two fingers to pinch-zoom, a quick touch
// to tap, and a flick to glide. No DOM and no Phaser: it is fed plain events and calls back, so it
// is tested with scripted fingers (ARCHITECTURE §9.3).

/** A tap moves less than this many CSS pixels and lasts no longer than TAP_MS. */
export const TAP_SLOP = 8;
export const TAP_MS = 300;
/** Only the last stretch of a drag decides how fast a flick is. */
const VELOCITY_WINDOW_MS = 100;
/** Slower than this (pixels per millisecond) is a stop, not a flick. */
const MIN_FLING_SPEED = 0.25;

/**
 * @typedef {{ x: number, y: number, startX: number, startY: number, startT: number, lastX: number, lastY: number }} Finger
 * @typedef {{ scale: number, x: number, y: number, dx: number, dy: number }} Pinch  scale is the change since the last event; x,y the midpoint; dx,dy how far the midpoint moved
 * @typedef {{
 *   onPan: (dx: number, dy: number) => void,
 *   onPinch: (pinch: Pinch) => void,
 *   onTap: (x: number, y: number) => void,
 *   onFling: (vx: number, vy: number) => void,
 *   onStart?: () => void,
 * }} GestureHandlers
 */

/** @param {GestureHandlers} handlers */
export function createGestures(handlers) {
  /** @type {Map<number, Finger>} */
  const fingers = new Map();
  /** Has this touch turned into a drag, a pinch, or just something that is no longer a tap? */
  let moved = false;
  /** @type {Array<{ t: number, x: number, y: number }>} recent single-finger positions, for flick speed */
  let trail = [];

  const pair = () => {
    const [a, b] = [...fingers.values()];
    return { a, b, distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  return {
    /** @param {number} id @param {number} x @param {number} y @param {number} t milliseconds */
    down(id, x, y, t) {
      if (fingers.size === 0) {
        moved = false;
        trail = [{ t, x, y }];
        handlers.onStart?.();
      } else {
        moved = true; // a second finger never makes a tap
        trail = [];
      }
      fingers.set(id, { x, y, startX: x, startY: y, startT: t, lastX: x, lastY: y });
      if (fingers.size > 2) fingers.delete(id); // three fingers: ignore the extra one
    },

    /** @param {number} id @param {number} x @param {number} y @param {number} t */
    move(id, x, y, t) {
      const finger = fingers.get(id);
      if (!finger) return;
      if (fingers.size >= 2) {
        const before = pair();
        finger.x = finger.lastX = x;
        finger.y = finger.lastY = y;
        const after = pair();
        if (before.distance > 0 && after.distance > 0) {
          handlers.onPinch({ scale: after.distance / before.distance, x: after.x, y: after.y, dx: after.x - before.x, dy: after.y - before.y });
        }
        return;
      }
      finger.x = x;
      finger.y = y;
      if (!moved && Math.hypot(x - finger.startX, y - finger.startY) <= TAP_SLOP) return; // still within the tap slop: not a drag yet
      moved = true;
      // The first pan includes the distance covered inside the slop, so the map catches up with the finger.
      handlers.onPan(x - finger.lastX, y - finger.lastY);
      finger.lastX = x;
      finger.lastY = y;
      trail.push({ t, x, y });
      trail = trail.filter((p) => t - p.t <= VELOCITY_WINDOW_MS);
    },

    /** @param {number} id @param {number} x @param {number} y @param {number} t */
    up(id, x, y, t) {
      const finger = fingers.get(id);
      if (!finger) return;
      fingers.delete(id);
      if (fingers.size > 0) return; // one finger is still down: keep dragging with it
      if (!moved && t - finger.startT <= TAP_MS) {
        handlers.onTap(x, y);
      } else if (moved && trail.length >= 2) {
        const first = trail[0];
        const last = trail[trail.length - 1];
        const dt = last.t - first.t;
        if (dt > 0 && t - last.t <= VELOCITY_WINDOW_MS) {
          const vx = (last.x - first.x) / dt;
          const vy = (last.y - first.y) / dt;
          if (Math.hypot(vx, vy) >= MIN_FLING_SPEED) handlers.onFling(vx, vy);
        }
      }
      trail = [];
    },

    /** The system took the touch away (a call, a system gesture): drop everything without a tap. @param {number} id */
    cancel(id) {
      fingers.delete(id);
      if (fingers.size === 0) trail = [];
    },

    /** Fingers currently down. */
    get active() {
      return fingers.size;
    },
  };
}
