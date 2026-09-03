import { applyAction } from '../../rules/apply.js';
import {
  bigBlindSeatId,
  firstToActPreflop,
  getHandMeta,
  postBlind,
  seatIndex,
  smallBlindSeatId,
} from '../../rules/state.js';
import type { Action, Card, HandState, SeatState } from '../../rules/types.js';
import { isActionPayload, type HandOpenPayload, type MoveLogItem } from './move-types.js';

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

function buildInitialState(
  handOpen: HandOpenPayload,
  holesBySeat: Map<string, [Card, Card]>,
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
    deckRemaining: [],
    burns: [],
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
}): ReconstructResult {
  const initial = buildInitialState(input.handOpen, input.holesBySeat);
  if (!initial.ok) {
    return initial;
  }

  let state = initial.value;

  for (const item of input.actions) {
    if (!isActionPayload(item.payload)) {
      return { ok: false, error: 'reconstruct_failed' };
    }
    const applied = applyAction(state, item.seatId, item.payload.action);
    if (!applied.ok) {
      return { ok: false, error: 'reconstruct_failed' };
    }
    state = applied.value;
  }

  return { ok: true, value: state };
}

export function parseActionBody(action: unknown): Action | null {
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
