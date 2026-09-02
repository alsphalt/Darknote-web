// Server-authoritative Ludo engine.
//
// The SERVER runs every rule in this file and broadcasts the resulting state.
// The client only renders the state it receives and sends intent
// ("I want to move token #2"). Dice values are produced by the server.
//
// Progress model per token:
//   0            home (yard)
//   1..52        on the shared ring  (world cell = (START + progress - 1) % 52)
//   53..58       private finish lane (entered after completing the ring)
//   59           done (finished)
//
// Rules enforced here:
//   - leaving home requires an exact 6
//   - a token may not land on its own token
//   - landing beyond the finish lane (overshoot) is illegal
//   - captures happen only on non-safe ring cells
//   - rolling a 6 grants an extra turn after the move
//   - win = all 4 tokens finished
//
// Pure module: no Math.random, no Node built-ins, no React.

import {
  TOKENS_PER_PLAYER,
  PATH_LENGTH,
  FINISH_LENGTH,
  DONE_PROGRESS,
  START_INDEX,
  SAFE_CELLS,
  GAME_PHASE,
} from './constants.js';

export { DONE_PROGRESS, PATH_LENGTH, FINISH_LENGTH };

/** Deep clone a small state object (pure engine never mutates input). */
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** World ring cell for a color's progress (1..52) — null otherwise. */
export function worldCellOf(color, progress) {
  if (progress < 1 || progress > PATH_LENGTH) return null;
  return (START_INDEX[color] + progress - 1) % PATH_LENGTH;
}

/** Human status of a token for rendering: 'home' | 'ring' | 'lane' | 'done'. */
export function tokenStatus(color, progress) {
  if (progress === 0) return 'home';
  if (progress <= PATH_LENGTH) return 'ring';
  if (progress < DONE_PROGRESS) return 'lane';
  return 'done';
}

/**
 * Create the initial authoritative game state.
 * @param {{roomId:string, players:Array<{userId:string, username?:string, color:string}>}} input
 *   players must be ordered (seat order); color pre-assigned by the room service.
 */
export function createGame({ roomId, players }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new Error('A Ludo game needs between 2 and 4 players.');
  }
  const seen = new Set();
  for (const p of players) {
    if (!p.userId || !p.color || seen.has(p.userId)) {
      throw new Error('Each player needs a unique userId and an assigned color.');
    }
    seen.add(p.userId);
  }
  return {
    roomId: roomId ?? null,
    players: players.map((p) => ({
      userId: p.userId,
      username: p.username ?? null,
      color: p.color,
      connected: true,
      progress: Array(TOKENS_PER_PLAYER).fill(0),
    })),
    currentPlayer: 0,
    diceValue: null,
    phase: GAME_PHASE.ROLL,
    winner: null,
    updatedAt: Date.now(),
  };
}

/** Color of the player whose turn it is. */
export function currentPlayerColor(state) {
  return state.players[state.currentPlayer]?.color ?? null;
}

function nextPlayerIndex(state) {
  return (state.currentPlayer + 1) % state.players.length;
}

function ownTokenBlocks(state, player, tokenIdx, targetProgress) {
  if (targetProgress === 0 || targetProgress === DONE_PROGRESS) return false; // home & done can stack
  return player.progress.some((op, oi) => oi !== tokenIdx && op === targetProgress);
}

/**
 * Can `tokenIdx` of `playerIdx` move `steps` in the given state?
 * Used for both full validation and computing legal moves.
 */
export function canTokenMove(state, playerIdx, tokenIdx, steps) {
  const player = state.players[playerIdx];
  if (!player || !Number.isInteger(steps) || steps < 1 || steps > 6) return false;
  const pr = player.progress[tokenIdx];
  if (typeof pr !== 'number') return false;

  if (pr === 0) return steps === 6; // must roll 6 to leave home
  const target = pr + steps;
  if (target > DONE_PROGRESS) return false; // overshoot
  if (ownTokenBlocks(state, player, tokenIdx, target)) return false; // own token in the way
  return true;
}

/**
 * Legal token indexes for the CURRENT player, given state.diceValue.
 * Empty array when the dice has no legal target (server passes/rolls on).
 */
export function legalTokenIndexes(state) {
  if (!state || state.winner !== null || state.phase !== GAME_PHASE.SELECT) return [];
  const steps = state.diceValue;
  if (!Number.isInteger(steps)) return [];
  const out = [];
  const playerIdx = state.currentPlayer;
  const count = state.players[playerIdx]?.progress.length ?? 0;
  for (let t = 0; t < count; t += 1) {
    if (canTokenMove(state, playerIdx, t, steps)) out.push(t);
  }
  return out;
}

/** Set the authoritative dice value and enter the 'select' phase. Pure. */
export function setDice(state, value) {
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error('Dice value must be an integer 1..6');
  }
  const next = cloneState(state);
  next.diceValue = value;
  next.phase = GAME_PHASE.SELECT;
  next.updatedAt = Date.now();
  return next;
}

/**
 * Advance turn after a roll that produced NO legal moves.
 * Rolling a 6 still grants another roll to the same player; otherwise pass.
 * Pure.
 */
export function resolveNoMove(state) {
  const next = cloneState(state);
  const extraTurn = next.diceValue === 6;
  if (!extraTurn) next.currentPlayer = nextPlayerIndex(next);
  next.diceValue = null;
  next.phase = GAME_PHASE.ROLL;
  next.updatedAt = Date.now();
  return next;
}

/**
 * Move the CURRENT player's token. Fully validates legality. Pure.
 * @returns {{state:object, error?:string, captured:number, finished:boolean, extraTurn:boolean, winner:number|null}}
 */
export function moveToken(state, tokenIdx) {
  if (state.winner !== null) return { state, error: 'Game already finished.' };
  if (state.phase !== GAME_PHASE.SELECT) return { state, error: 'Roll the dice first.' };
  const steps = state.diceValue;
  if (!Number.isInteger(steps)) return { state, error: 'No dice value.' };

  const playerIdx = state.currentPlayer;
  const player = state.players[playerIdx];
  if (!player || !Number.isInteger(tokenIdx) || tokenIdx < 0 || tokenIdx >= player.progress.length) {
    return { state, error: 'Invalid token.' };
  }
  if (!canTokenMove(state, playerIdx, tokenIdx, steps)) {
    return { state, error: 'Illegal move for this token.' };
  }

  const next = cloneState(state);
  const playerTokens = next.players[playerIdx].progress;
  const from = playerTokens[tokenIdx];
  // Leaving home consumes the 6 to ENTER the board: token lands on its own
  // (safe) start cell = progress 1, not progress 6.
  const np = from === 0 ? 1 : from + steps;
  playerTokens[tokenIdx] = np;

  let captured = 0;
  // Capture on ring cells only, and never on safe cells.
  if (np >= 1 && np <= PATH_LENGTH) {
    const world = worldCellOf(player.color, np);
    if (!SAFE_CELLS.has(world)) {
      for (let o = 0; o < next.players.length; o += 1) {
        if (o === playerIdx) continue;
        const opp = next.players[o];
        for (let t = 0; t < opp.progress.length; t += 1) {
          const op = opp.progress[t];
          if (op >= 1 && op <= PATH_LENGTH && worldCellOf(opp.color, op) === world) {
            opp.progress[t] = 0;
            captured += 1;
          }
        }
      }
    }
  }

  const finished = np === DONE_PROGRESS;
  const extraTurn = steps === 6;
  const allDone = next.players[playerIdx].progress.every((p) => p === DONE_PROGRESS);
  const winner = allDone ? playerIdx : null;

  next.diceValue = null;
  next.phase = GAME_PHASE.ROLL;
  if (winner === null) {
    if (!extraTurn) next.currentPlayer = nextPlayerIndex(next);
  } else {
    next.winner = winner;
  }
  next.updatedAt = Date.now();
  return { state: next, captured, finished, extraTurn, winner };
}
