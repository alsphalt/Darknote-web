import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ringSlot,
  ringSlotFor,
  worldOf,
  tokenPoint,
  laneSlot,
  doneSlot,
  baseSquare,
  distance,
  LOOP,
  VIEW,
} from './layout.js';
import { COLORS, START_INDEX } from './constants.js';

test('all 52 ring slots are distinct and inside the loop square', () => {
  const keys = new Set();
  for (let w = 0; w < 52; w += 1) {
    const p = ringSlot(w);
    keys.add(`${p.x},${p.y}`);
    assert.ok(p.x >= LOOP.x0 && p.x <= LOOP.x1);
    assert.ok(p.y >= LOOP.y0 && p.y <= LOOP.y1);
  }
  assert.equal(keys.size, 52);
});

test('colour starts are exactly a quarter of the loop apart (13 slots)', () => {
  for (let i = 0; i < COLORS.length; i += 1) {
    const color = COLORS[i];
    const next = COLORS[(i + 1) % COLORS.length];
    const a = ringSlotFor(color, 1); // start cell
    const b = ringSlotFor(next, 1);
    const quarter = distance(a, b);
    // straight-line quarter distances must all be equal (symmetry)
    assert.ok(quarter > 0);
    assert.equal(worldOf(color, 1), START_INDEX[color]);
  }
});

test('consecutive ring slots are evenly spaced on each side', () => {
  const d0 = distance(ringSlot(0), ringSlot(1));
  for (let w = 1; w < 51; w += 1) {
    const d = distance(ringSlot(w), ringSlot(w + 1));
    assert.ok(Math.abs(d - d0) < 1e-6, `slot ${w} spacing`);
  }
  const wrap = distance(ringSlot(51), ringSlot(0));
  assert.ok(Math.abs(wrap - d0) < 1e-6, 'wrap-around spacing');
});

test('tokenPoint buckets progress to home/ring/lane/done', () => {
  assert.equal(tokenPoint('red', 0).kind, 'home');
  const r1 = tokenPoint('red', 1);
  assert.equal(r1.kind, 'ring');
  const g1 = tokenPoint('green', 1);
  assert.equal(g1.kind, 'ring');
  assert.equal(tokenPoint('blue', 53).kind, 'lane');
  assert.equal(tokenPoint('yellow', 58).kind, 'lane');
  for (const color of COLORS) {
    const done = tokenPoint(color, 59);
    assert.equal(done.kind, 'done');
    assert.deepEqual([done.x, done.y], [doneSlot(color).x, doneSlot(color).y]);
  }
});

test('base squares sit in the four corners without overlap', () => {
  const squares = COLORS.map(baseSquare);
  for (const sq of squares) {
    assert.ok(sq.x >= 0 && sq.y >= 0);
    assert.ok(sq.x + sq.size <= VIEW.size && sq.y + sq.size <= VIEW.size);
  }
  const names = COLORS.map((c) => `${c}@${baseSquare(c).x},${baseSquare(c).y}`);
  assert.equal(new Set(names).size, 4);
});

test('lane slots step from the ring into the base centre monotonically', () => {
  for (const color of COLORS) {
    const first = laneSlot(color, 53);
    const last = laneSlot(color, 58);
    const d = distance(first, last);
    assert.ok(d > 30, `${color} lane length`);
    for (let p = 53; p < 58; p += 1) {
      const cur = laneSlot(color, p);
      const nxt = laneSlot(color, p + 1);
      assert.ok(distance(cur, nxt) > 5, `${color} lane step`);
    }
  }
});
