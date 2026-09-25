import { getHandMeta } from '../rules/state.js';
import type { Card, HandState, Phase } from '../rules/types.js';
import type { SeatRecord, TableRecord } from './types.js';

export function rehydrateHandState(
  table: TableRecord,
  seats: SeatRecord[],
): HandState | null {
  if (table.status !== 'hand_in_progress' || !table.buttonSeatId) {
    return null;
  }

  const inHand = seats.filter((seat) => seat.hole);
  if (inHand.length === 0) {
    return null;
  }

  const phase: Phase = table.phase ?? 'betting';
  const currentBet =
    table.currentBet ?? (phase === 'betting' ? table.blinds.bigBlind : 0);

  const handState: HandState = {
    seats: inHand.map((seat) => ({
      seatId: seat.seatId,
      stack: seat.stack,
      hole: [seat.hole![0], seat.hole![1]],
      folded: seat.folded ?? false,
      streetCommitted: seat.streetCommitted ?? 0,
      handCommitted: seat.handCommitted ?? 0,
    })),
    buttonSeatId: table.buttonSeatId,
    blinds: { ...table.blinds },
    street: table.street ?? 'preflop',
    phase,
    currentSeatId: table.currentSeatId ?? null,
    board: [...(table.board ?? [])],
    pot: table.pot ?? 0,
    currentBet,
    lastRaiseSize: table.lastRaiseSize ?? table.blinds.bigBlind,
    deckRemaining: [...(table.deckRemaining ?? [])],
    burns: [...(table.burns ?? [])],
    winners: null,
    completeReason: null,
  };

  const meta = getHandMeta(handState);
  meta.actedThisStreet = new Set(table.actedThisStreet ?? []);
  meta.lastAggressorSeatId = table.lastAggressorSeatId ?? null;

  return handState;
}

export function extractHandMeta(table: TableRecord, handState: HandState): TableRecord {
  const meta = getHandMeta(handState);
  return {
    ...table,
    phase: handState.phase,
    currentBet: handState.currentBet,
    lastRaiseSize: handState.lastRaiseSize,
    deckRemaining: [...handState.deckRemaining],
    burns: [...handState.burns],
    actedThisStreet: [...meta.actedThisStreet],
    lastAggressorSeatId: meta.lastAggressorSeatId,
  };
}

export function applyHandStateToSeats(handState: HandState, seats: SeatRecord[]): SeatRecord[] {
  return seats.map((seat) => {
    const handSeat = handState.seats.find((row) => row.seatId === seat.seatId);
    if (!handSeat) {
      return seat;
    }
    return {
      ...seat,
      stack: handSeat.stack,
      hole: [handSeat.hole[0], handSeat.hole[1]] as [Card, Card],
      folded: handSeat.folded,
      streetCommitted: handSeat.streetCommitted,
      handCommitted: handSeat.handCommitted,
    };
  });
}

export function applyHandStateToTable(
  table: TableRecord,
  handState: HandState,
  nextVersion: number,
): TableRecord {
  const withMeta = extractHandMeta(table, handState);
  return {
    ...withMeta,
    version: nextVersion,
    status: 'hand_in_progress',
    street: handState.street,
    currentSeatId: handState.currentSeatId,
    pot: handState.pot,
    board: [...handState.board],
  };
}
