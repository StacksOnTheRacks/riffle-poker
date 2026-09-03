import { legalize } from './legalize.js';
import { err, ok } from './errors.js';
import {
  cloneHandState,
  getHandMeta,
  isBettingComplete,
  nextActorSeatId,
  seatIndex,
  stillInSeats,
} from './state.js';
import type { Action, HandState, LegalizedAction, Result } from './types.js';

function commitChips(
  state: HandState,
  seatId: string,
  amount: number,
): void {
  const seat = state.seats[seatIndex(state, seatId)];
  seat.stack -= amount;
  seat.streetCommitted += amount;
  seat.handCommitted += amount;
  state.pot += amount;
}

function applyLegalized(state: HandState, seatId: string, action: LegalizedAction): void {
  const meta = getHandMeta(state);
  meta.actedThisStreet.add(seatId);

  switch (action.type) {
    case 'fold':
      state.seats[seatIndex(state, seatId)].folded = true;
      break;
    case 'check':
      break;
    case 'call':
      commitChips(state, seatId, action.amount);
      break;
    case 'bet': {
      const previousBet = state.currentBet;
      commitChips(state, seatId, action.amount);
      state.currentBet = state.seats[seatIndex(state, seatId)].streetCommitted;
      state.lastRaiseSize = state.currentBet - previousBet;
      meta.lastAggressorSeatId = seatId;
      break;
    }
    case 'raise': {
      const previousBet = state.currentBet;
      const seat = state.seats[seatIndex(state, seatId)];
      const chipsToAdd = action.amount - seat.streetCommitted;
      commitChips(state, seatId, chipsToAdd);
      state.currentBet = action.amount;
      state.lastRaiseSize = state.currentBet - previousBet;
      meta.lastAggressorSeatId = seatId;
      break;
    }
    default:
      break;
  }
}

function closeOrContinueBetting(state: HandState): void {
  const meta = getHandMeta(state);
  const stillIn = stillInSeats(state);

  if (stillIn.length === 1) {
    state.phase = 'fold_to_one';
    state.currentSeatId = null;
    return;
  }

  if (!isBettingComplete(state, meta)) {
    state.currentSeatId = nextActorSeatId(state, meta, state.currentSeatId);
    return;
  }

  if (state.street === 'river') {
    state.phase = 'showdown_ready';
    state.currentSeatId = null;
    return;
  }

  state.phase = 'street_complete';
  state.currentSeatId = null;
}

export function applyAction(state: HandState, seatId: string, action: Action): Result<HandState> {
  const legal = legalize(state, seatId, action);
  if (!legal.ok) {
    return legal as Result<HandState>;
  }

  const next = cloneHandState(state);
  applyLegalized(next, seatId, legal.value);
  closeOrContinueBetting(next);
  return ok(next);
}
