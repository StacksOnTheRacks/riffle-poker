import { applyAction } from '../../rules/apply.js';
import {
  bigBlindSeatId,
  firstToActPostflop,
  firstToActPreflop,
  getHandMeta,
  postBlind,
  seatIndex,
  smallBlindSeatId,
} from '../../rules/state.js';
import type { Card, HandState, SeatState, Street } from '../../rules/types.js';
import {
  isActionPayload,
  isStreetDealPayload,
  type HandOpenPayload,
  type MoveLogItem,
  type StreetDealPayload,
} from './move-types.js';
import { cloneShoeView, type ShoeView } from './shoe.js';

export type ReconstructFailure =
  | 'holes_not_dealt'
  | 'invalid_view'
  | 'reconstruct_failed';

export type ReconstructResult =
  | { ok: true; value: HandState }
  | { ok: false; error: ReconstructFailure };

export function findLatestHandOpen(moves: MoveLogItem[]): HandOpenPayload | null {
  let latest: HandOpenPayload | null = null;
  for (const item of moves) {
    if (
      typeof item.payload === 'object' &&
      item.payload !== null &&
      (item.payload as { kind?: string }).kind === 'hand_open'
    ) {
      latest = item.payload as HandOpenPayload;
    }
  }
  return latest;
}

export function actionsAfterHandOpen(moves: MoveLogItem[]): MoveLogItem[] {
  let handOpenIndex = -1;
  for (let i = 0; i < moves.length; i += 1) {
    const payload = moves[i]?.payload;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { kind?: string }).kind === 'hand_open'
    ) {
      handOpenIndex = i;
    }
  }
  if (handOpenIndex === -1) {
    return [];
  }
  return moves.slice(handOpenIndex + 1);
}

function expectedBoardLengthForStreet(street: Street): number | null {
  switch (street) {
    case 'flop':
      return 3;
    case 'turn':
      return 4;
    case 'river':
      return 5;
    default:
      return null;
  }
}

function expectedStreetFromBoardLength(length: number): Street | null {
  if (length === 3) {
    return 'flop';
  }
  if (length === 4) {
    return 'turn';
  }
  if (length === 5) {
    return 'river';
  }
  return null;
}

function applyStreetDealFromLog(
  state: HandState,
  payload: StreetDealPayload,
  workingShoe: ShoeView | null,
): ReconstructResult {
  const expectedStreet = expectedStreetFromBoardLength(payload.board.length);
  if (!expectedStreet || expectedStreet !== payload.street) {
    return { ok: false, error: 'reconstruct_failed' };
  }

  const expectedLength = expectedBoardLengthForStreet(
    state.street === 'preflop'
      ? 'flop'
      : state.street === 'flop'
        ? 'turn'
        : state.street === 'turn'
          ? 'river'
          : state.street,
  );

  if (state.street === 'river' || expectedLength === null) {
    return { ok: false, error: 'reconstruct_failed' };
  }

  const drawCount = state.street === 'preflop' ? 3 : 1;

  if (workingShoe) {
    if (workingShoe.deckRemaining.length < drawCount + 1) {
      return { ok: false, error: 'reconstruct_failed' };
    }
    workingShoe.burns.push(workingShoe.deckRemaining.shift()!);
    const drawn: Card[] = [];
    for (let i = 0; i < drawCount; i += 1) {
      drawn.push(workingShoe.deckRemaining.shift()!);
    }
    const expectedBoard = [...state.board, ...drawn];
    if (
      expectedBoard.length !== payload.board.length ||
      !expectedBoard.every((card, index) => card === payload.board[index])
    ) {
      return { ok: false, error: 'reconstruct_failed' };
    }
    state.deckRemaining = [...workingShoe.deckRemaining];
    state.burns = [...workingShoe.burns];
  }

  state.board = [...payload.board];
  state.street = payload.street;

  for (const seat of state.seats) {
    seat.streetCommitted = 0;
  }
  state.currentBet = 0;
  state.lastRaiseSize = state.blinds.bigBlind;
  state.phase = 'betting';

  const meta = getHandMeta(state);
  meta.actedThisStreet.clear();
  meta.lastAggressorSeatId = null;

  state.currentSeatId = firstToActPostflop(state);

  return { ok: true, value: state };
}

function buildInitialState(
  handOpen: HandOpenPayload,
  holesBySeat: Map<string, [Card, Card]>,
  shoe: ShoeView | null,
): ReconstructResult {
  const seatStates: SeatState[] = [];

  for (const seat of handOpen.seats) {
    const hole = holesBySeat.get(seat.seatId);
    if (!hole) {
      return { ok: false, error: 'holes_not_dealt' };
    }
    seatStates.push({
      seatId: seat.seatId,
      stack: seat.stack,
      hole,
      folded: false,
      streetCommitted: 0,
      handCommitted: 0,
    });
  }

  const state: HandState = {
    seats: seatStates,
    buttonSeatId: handOpen.buttonSeatId,
    blinds: { ...handOpen.blinds },
    street: 'preflop',
    phase: 'betting',
    currentSeatId: null,
    board: [],
    pot: 0,
    currentBet: 0,
    lastRaiseSize: handOpen.blinds.bigBlind,
    deckRemaining: shoe ? [...shoe.deckRemaining] : [],
    burns: shoe ? [...shoe.burns] : [],
    winners: null,
    completeReason: null,
  };

  const sbSeat = state.seats[seatIndex(state, smallBlindSeatId(state))];
  const bbSeat = state.seats[seatIndex(state, bigBlindSeatId(state))];

  if (
    sbSeat.stack <= handOpen.blinds.smallBlind ||
    bbSeat.stack <= handOpen.blinds.bigBlind
  ) {
    return { ok: false, error: 'reconstruct_failed' };
  }

  state.pot = postBlind(sbSeat, handOpen.blinds.smallBlind, state.pot);
  state.pot = postBlind(bbSeat, handOpen.blinds.bigBlind, state.pot);
  state.currentBet = handOpen.blinds.bigBlind;
  state.lastRaiseSize = handOpen.blinds.bigBlind;
  state.currentSeatId = firstToActPreflop(state);

  const meta = getHandMeta(state);
  meta.actedThisStreet.clear();
  meta.lastAggressorSeatId = null;

  return { ok: true, value: state };
}

export function reconstructHand(input: {
  handOpen: HandOpenPayload;
  actions: MoveLogItem[];
  holesBySeat: Map<string, [Card, Card]>;
  shoe?: ShoeView | null;
}): ReconstructResult {
  const workingShoe = input.shoe ? cloneShoeView(input.shoe) : null;
  const initial = buildInitialState(input.handOpen, input.holesBySeat, input.shoe ?? null);
  if (!initial.ok) {
    return initial;
  }

  let state = initial.value;

  for (const item of input.actions) {
    if (isActionPayload(item.payload)) {
      const applied = applyAction(state, item.seatId, item.payload.action);
      if (!applied.ok) {
        return { ok: false, error: 'reconstruct_failed' };
      }
      state = applied.value;
      continue;
    }

    if (isStreetDealPayload(item.payload)) {
      const applied = applyStreetDealFromLog(state, item.payload, workingShoe);
      if (!applied.ok) {
        return applied;
      }
      state = applied.value;
      continue;
    }

    return { ok: false, error: 'reconstruct_failed' };
  }

  return { ok: true, value: state };
}

export function parseActionBody(action: unknown): import('../../rules/types.js').Action | null {
  if (typeof action !== 'object' || action === null) {
    return null;
  }
  const record = action as Record<string, unknown>;
  const type = record.type;
  if (type === 'fold' || type === 'check' || type === 'call') {
    return { type };
  }
  if (type === 'bet' || type === 'raise') {
    const amount = record.amount;
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      return null;
    }
    return { type, amount };
  }
  return null;
}
