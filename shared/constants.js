// Shared Ludo constants — used by BOTH the server-authoritative engine and the
// React frontend. No Node built-ins, no React. Keep this file dependency-free.

export const COLORS = ['red', 'green', 'yellow', 'blue'];

export const TOKENS_PER_PLAYER = 4;

// Main ring length (absolute cells 0..51). All players share the same ring;
// each color starts at its own "start" cell (safe).
export const PATH_LENGTH = 52;

// Finish-lane length after completing the ring (progress 53..58 -> 59 = done).
export const FINISH_LENGTH = 6;
export const DONE_PROGRESS = PATH_LENGTH + FINISH_LENGTH + 1; // 59

// Absolute ring index of each color's start cell.
export const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };

// Absolute cells where tokens cannot be captured (color starts + the 4 "star"
// cells opposite them). Matches the original hook's SAFE_CELLS.
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export const ROOM_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

export const GAME_PHASE = {
  ROLL: 'roll',
  SELECT: 'select', // dice rolled, at least one legal move exists
};

// Room-code formats
export const CODE_LENGTH_NORMAL = 6; // ^\d{6}$
export const BET_CODE_PREFIX_LENGTH = 3; // ^\d{3}[A-Z]{4}$
export const BET_CODE_SUFFIX_LENGTH = 4;
