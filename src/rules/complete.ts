import { compareEvaluated, evaluateSeven } from './rank.js';
import { err, ok } from './errors.js';
import {
  awardRemainderClockwiseFromButton,
  cloneHandState,
  seatIndex,
  stillInSeats,
} from './state.js';
import type { EvaluatedHand } from './rank.js';
import type { HandState, Result, Winner } from './types.js';

export function completeFoldToOne(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'fold_to_one') {
    return err('not_fold_to_one', 'hand is not fold-to-one');
  }

  const stillIn = stillInSeats(state);
  if (stillIn.length !== 1) {
    return err('not_fold_to_one', 'exactly one seat must remain');
  }

  const next = cloneHandState(state);
  const winner = stillInSeats(next)[0];
  const amount = next.pot;
  winner.stack += amount;
  next.pot = 0;
  next.phase = 'complete';
  next.completeReason = 'fold_to_one';
  next.currentSeatId = null;
  next.winners = [{ seatId: winner.seatId, amount }];

  return ok(next);
}

export function showdown(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'showdown_ready') {
    return err('not_showdown', 'hand is not ready for showdown');
  }
  if (state.street !== 'river' || state.board.length !== 5) {
    return err('not_showdown', 'showdown requires a complete river board');
  }

  const stillIn = stillInSeats(state);
  if (stillIn.length < 2) {
    return err('not_showdown', 'showdown requires at least two seats');
  }
  if (stillIn.some((s) => s.stack === 0)) {
    return err('not_showdown', 'all-in seats are not supported');
  }

  const evaluations = new Map<string, EvaluatedHand>();
  for (const seat of stillIn) {
    evaluations.set(seat.seatId, evaluateSeven(seat.hole, state.board));
  }

  let best: EvaluatedHand | null = null;
  for (const evald of evaluations.values()) {
    if (!best || compareEvaluated(evald, best) > 0) {
      best = evald;
    }
  }

  const winnersIds = stillIn
    .filter((s) => compareEvaluated(evaluations.get(s.seatId)!, best!) === 0)
    .map((s) => s.seatId);

  const next = cloneHandState(state);
  const pot = next.pot;
  const baseShare = Math.floor(pot / winnersIds.length);
  const remainder = pot - baseShare * winnersIds.length;
  const extra = awardRemainderClockwiseFromButton(next, winnersIds, remainder);

  const winners: Winner[] = winnersIds.map((seatId) => ({
    seatId,
    amount: baseShare + (extra.get(seatId) ?? 0),
    rankName: evaluations.get(seatId)!.rankName,
  }));

  for (const winner of winners) {
    next.seats[seatIndex(next, winner.seatId)].stack += winner.amount;
  }

  next.pot = 0;
  next.phase = 'complete';
  next.completeReason = 'showdown';
  next.currentSeatId = null;
  next.winners = winners;

  return ok(next);
}
