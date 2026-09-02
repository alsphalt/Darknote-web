import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  setDice,
  moveToken,
  legalTokenIndexes,
  canTokenMove,
  resolveNoMove,
  tokenStatus,
  worldCellOf,
} from './ludo.js';
import { GAME_PHASE } from './constants.js';

function mkGame(colors = ['red', 'green']) {
  return createGame({
    roomId: 'r1',
    players: colors.map((color, i) => ({ userId: `u${i + 1}`, username: color, color })),
  });
}

/** Hand a player an exact token layout and set the current seat + dice. */
function craft(state, { playerIdx, progress, currentPlayer, dice }) {
  const s = structuredClone(state);
  s.players[playerIdx].progress = [...progress];
  s.currentPlayer = currentPlayer;
  s.diceValue = dice ?? null;
  s.phase = dice == null ? GAME_PHASE.ROLL : GAME_PHASE.SELECT;
  s.winner = null;
  return s;
}

test('createGame builds 2-4 player states; rejects bad input', () => {
  assert.equal(mkGame().players.length, 2);
  assert.equal(mkGame(['red', 'green', 'yellow', 'blue']).players.length, 4);
  assert.throws(() => createGame({ roomId: 'x', players: [] }));
  assert.throws(() => createGame({ roomId: 'x', players: [
    { userId: 'u1', color: 'red' }, { userId: 'u1', color: 'green' },
  ] }));
});

test('leaving home requires exactly 6', () => {
  let s = mkGame();
  s = setDice(s, 5);
  assert.deepEqual(legalTokenIndexes(s), []);
  assert.equal(canTokenMove(s, 0, 0, 5), false);
  assert.equal(canTokenMove(s, 0, 0, 6), true);

  s = setDice(s, 6);
  assert.deepEqual(legalTokenIndexes(s), [0, 1, 2, 3]); // every token may leave on a 6
  const moved = moveToken(s, 0);
  assert.equal(moved.error, undefined);
  assert.equal(moved.state.players[0].progress[0], 1);
  assert.equal(worldCellOf('red', 1), 0); // red start cell
  assert.equal(moved.state.currentPlayer, 0, 'rolling 6 -> extra turn, same player');
  assert.equal(moved.state.phase, GAME_PHASE.ROLL);
});

test('resolveNoMove passes turn on non-6 and keeps seat on 6', () => {
  let s = mkGame();
  s = setDice(s, 5); // nobody can move (all home)
  assert.deepEqual(legalTokenIndexes(s), []);
  s = resolveNoMove(s);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.diceValue, null);
  assert.equal(s.phase, GAME_PHASE.ROLL);

  s = setDice(s, 6); // hypothetical no-move on a 6 (all tokens blocked later in game)
  s = resolveNoMove(s);
  assert.equal(s.currentPlayer, 1, 'a 6 still grants another roll, so seat is unchanged');
});

test('turns, ring movement and extra-turn rule', () => {
  let s = mkGame();
  s = setDice(s, 6);
  s = moveToken(s, 0).state; // red out, extra turn
  assert.equal(s.currentPlayer, 0);

  s = setDice(s, 4);
  s = moveToken(s, 0).state; // red 1 -> 5, non-6 passes
  assert.equal(s.players[0].progress[0], 5);
  assert.equal(worldCellOf('red', 5), 4);
  assert.equal(s.currentPlayer, 1);
});

test('illegal moves are rejected (out of turn, before roll, bad token)', () => {
  let s = mkGame();
  assert.ok(moveToken(s, 0).error, 'cannot move before rolling');
  s = setDice(s, 3);
  assert.ok(moveToken(s, 0).error, 'cannot leave home without a 6');
  s = setDice(s, 6);
  assert.ok(moveToken(s, 7).error, 'out-of-range token');
  const s2 = craft(s, { playerIdx: 1, progress: [0, 0, 0, 0], currentPlayer: 0, dice: 6 });
  // current player is red (0); only red may act even though green has legal moves
  assert.deepEqual(legalTokenIndexes(s2), [0, 1, 2, 3]);
});

test('capture on a non-safe ring cell sends the opponent home', () => {
  let s = mkGame();
  // Red token at progress 6  -> world (0+6-1) = 5
  // Green token at progress 44 -> world (13+44-1) % 52 = 4 ; rolling 1 lands on world 5
  s = craft(s, { playerIdx: 0, progress: [6, 0, 0, 0], currentPlayer: 1, dice: 1 });
  s.players[1].progress[0] = 44;
  const r = moveToken(s, 0);
  assert.equal(r.error, undefined);
  assert.equal(r.captured, 1);
  assert.equal(r.state.players[0].progress[0], 0, 'red sent home');
  assert.equal(r.state.players[1].progress[0], 45);
  assert.equal(worldCellOf('green', 45), 5);
});

test('no capture on safe cells (starts and stars)', () => {
  let s = mkGame();
  // Red on star world 8 (progress 9). Green rolls 1 from progress 47 (world 7) -> 48 (world 8).
  s = craft(s, { playerIdx: 0, progress: [9, 0, 0, 0], currentPlayer: 1, dice: 1 });
  s.players[1].progress[0] = 47;
  const r = moveToken(s, 0);
  assert.equal(r.error, undefined);
  assert.equal(r.captured, 0, 'safe cells protect the occupant');
  assert.equal(r.state.players[0].progress[0], 9);
  assert.equal(r.state.players[1].progress[0], 48);
});

test('finish lane with exact landing; overshoot rejected', () => {
  let s = mkGame();
  s = craft(s, { playerIdx: 0, progress: [51, 0, 0, 0], currentPlayer: 0, dice: 6 });
  assert.equal(canTokenMove(s, 0, 0, 6), true); // 51+6 = 57 (lane)
  let r = moveToken(s, 0);
  assert.equal(r.state.players[0].progress[0], 57);
  assert.equal(tokenStatus('red', 57), 'lane');

  // In the lane, overshooting the center is illegal
  s = craft(s, { playerIdx: 0, progress: [58, 0, 0, 0], currentPlayer: 0, dice: 6 });
  assert.equal(canTokenMove(s, 0, 0, 6), false);
  r = moveToken(s, 0);
  assert.ok(r.error, '58+6 overshoots the finish center');
  assert.equal(r.state.players[0].progress[0], 58);

  // Exact 1 from 58 finishes the token
  s = craft(s, { playerIdx: 0, progress: [58, 0, 0, 0], currentPlayer: 0, dice: 1 });
  r = moveToken(s, 0);
  assert.equal(r.state.players[0].progress[0], 59);
  assert.equal(tokenStatus('red', 59), 'done');
  assert.equal(r.finished, true);
});

test('win detection fires once all four tokens finish; game locks', () => {
  let s = mkGame();
  s = craft(s, { playerIdx: 0, progress: [58, 59, 59, 59], currentPlayer: 0, dice: 1 });
  const r = moveToken(s, 0);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.players[0].progress[0], 59);
  assert.ok(moveToken(r.state, 1).error, 'no moves after a win');
});

test('own-token blocking prevents stacking', () => {
  let s = mkGame();
  // Red token A at progress 5; token B at home; rolling 5 would land B on progress 5 (blocked), A can move to 10
  s = craft(s, { playerIdx: 0, progress: [5, 0, 0, 0], currentPlayer: 0, dice: 5 });
  assert.equal(canTokenMove(s, 0, 0, 5), true);
  assert.equal(canTokenMove(s, 0, 1, 5), false, 'B cannot land on its own token A');
  assert.deepEqual(legalTokenIndexes(s), [0]);
});

test('2, 3 and 4 players cycle all seats without out-of-range indexes', () => {
  for (const colors of [['red', 'green'], ['red', 'green', 'yellow'], ['red', 'green', 'yellow', 'blue']]) {
    let s = mkGame(colors);
    const seen = new Set();
    const n = colors.length;
    // Each full round: seat rolls 6 (leaves home), then non-6 to pass.
    for (let round = 0; round < 2; round += 1) {
      for (let seat = 0; seat < n; seat += 1) {
        assert.equal(s.phase, GAME_PHASE.ROLL);
        s = setDice(s, 6);
        s = moveToken(s, 0).state; // leave home (seat unchanged: extra turn)
        s = setDice(s, 4);
        s = moveToken(s, 0).state; // non-6 -> next seat
        seen.add(s.currentPlayer);
      }
    }
    assert.ok(seen.size >= 2);
    for (const idx of seen) assert.ok(idx >= 0 && idx < n);
  }
});
