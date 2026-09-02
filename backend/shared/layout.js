// Pure board GEOMETRY for the SVG renderer (no DOM, no React, unit-tested).
//
// The 52 ring slots are evenly spaced on a square loop (viewBox 0 0 600 600).
// Four colour start cells sit exactly one quarter of the loop apart:
//   red world 0    -> top side, moving clockwise
//   green world 13 -> right side
//   yellow world 26-> bottom side
//   blue world 39  -> left side
//
// Engine worlds are mapped to slots with:
//   slot = ringPoint((START_INDEX[color] + progress - 1) % 52)

import { START_INDEX } from './constants.js';

export const VIEW = { size: 600, center: 300 };
export const LOOP = { x0: 110, y0: 110, x1: 490, y1: 490 }; // square ring
export const BASE_SIZE = 110; // corner base squares (0..110 / 490..600)
export const CENTRE = { x0: 262, y0: 262, x1: 338, y1: 338 };

/** Position of ring slot `world` (0..51) as {x, y}. Slot 0 is at the top
 * side near the top-left corner; increasing index moves clockwise. */
export function ringSlot(world) {
  const n = (world % 52 + 52) % 52;
  const side = Math.floor(n / 13); // 0 top, 1 right, 2 bottom, 3 left
  const t = (n % 13) / 13; // 0..1 along the side (clockwise direction)
  const { x0, y0, x1, y1 } = LOOP;
  if (side === 0) return { x: x0 + t * (x1 - x0), y: y0 }; // left -> right
  if (side === 1) return { x: x1, y: y0 + t * (y1 - y0) }; // top -> bottom
  if (side === 2) return { x: x1 - t * (x1 - x0), y: y1 }; // right -> left
  return { x: x0, y: y1 - t * (y1 - y0) }; // bottom -> top
}

/** World index of the ring slot for (color, progress). */
export function worldOf(color, progress) {
  return (START_INDEX[color] + progress - 1) % 52;
}

/** Ring slot position for a token (color, progress 1..52). */
export function ringSlotFor(color, progress) {
  return ringSlot(worldOf(color, progress));
}

/** Corner base square for a colour: {x, y} top-left, size BASE_SIZE. */
export function baseSquare(color) {
  const s = BASE_SIZE;
  const out = VIEW.size - s;
  switch (color) {
    case 'red': return { x: 0, y: 0, size: s };
    case 'green': return { x: out, y: 0, size: s };
    case 'yellow': return { x: out, y: out, size: s };
    case 'blue': return { x: 0, y: out, size: s };
    default: return { x: 0, y: 0, size: s };
  }
}

/** Vector from a base's outer corner towards its centre. */
function baseInward(color) {
  const s = BASE_SIZE;
  const half = s / 2;
  const { x, y } = baseSquare(color);
  return { x: x + half, y: y + half };
}

/** Home-token slot (0..3) inside the colour's base (2×2 near outer corner). */
export function homeSlot(color, index) {
  const { x, y, size } = baseSquare(color);
  const pad = 22;
  const step = (size - pad * 2) / 2;
  const dx = index % 2;
  const dy = Math.floor(index / 2);
  // near the outer corner: for red/yellow x grows left->right etc. Keep simple:
  // place slots adjacent to the corner facing the ring start of that colour.
  const corner = { red: { x, y }, green: { x: x + size, y }, yellow: { x: x + size, y: y + size }, blue: { x, y: y + size } }[color];
  const signX = color === 'red' || color === 'blue' ? 1 : -1;
  const signY = color === 'red' || color === 'green' ? 1 : -1;
  return {
    x: corner.x + signX * (pad + dx * step),
    y: corner.y + signY * (pad + dy * step),
  };
}

/**
 * Lane (home-stretch) slot for (color, progress 53..58). The lane runs in a
 * straight line from just inside the ring (near the colour's start) into the
 * base centre; index 0 (progress 53) is closest to the ring.
 */
export function laneSlot(color, progress) {
  const i = progress - 53; // 0..5
  const start = ringSlotFor(color, 52); // token just before the home lane on the ring
  const entry = ringSlotFor(color, 1); // the colour's start cell
  const baseCenter = baseInward(color);
  // Draw the lane from the ring corner (between entry and the previous slot)
  // into the base centre, 6 steps.
  const from = {
    x: (start.x + entry.x) / 2,
    y: (start.y + entry.y) / 2,
  };
  const t = (i + 1) / 6; // first step 1/6 .. last step 1
  return {
    x: from.x + (baseCenter.x - from.x) * t,
    y: from.y + (baseCenter.y - from.y) * t,
  };
}

/** Where a finished (done) token of `color` is displayed. */
export function doneSlot(color) {
  const pad = 18;
  const { x0, y0, x1, y1 } = CENTRE;
  switch (color) {
    case 'red': return { x: x0 + pad, y: y0 + pad };
    case 'green': return { x: x1 - pad, y: y0 + pad };
    case 'yellow': return { x: x1 - pad, y: y1 - pad };
    default: return { x: x0 + pad, y: y1 - pad };
  }
}

/** Full position description for one token. */
export function tokenPoint(color, progress) {
  if (progress === 0) return { kind: 'home' };
  if (progress <= 52) return { kind: 'ring', ...ringSlotFor(color, progress) };
  if (progress <= 58) return { kind: 'lane', ...laneSlot(color, progress) };
  return { kind: 'done', ...doneSlot(color) };
}

/** Unit-test helper: straight-line distance between two points. */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
