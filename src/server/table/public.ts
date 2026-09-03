import type { TurnurClient } from '@turnur/sdk';
import type { Card } from '../../rules/types.js';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { PublicTable } from './dto.js';
import type { MoveLogItem } from '../hands/move-types.js';
import { syntheticHolesForSeats } from '../hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../hands/reconstruct.js';

export interface PublicTableInput {
  matchId: string;
}

export interface PublicTableDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function getPublicTable(
  input: PublicTableInput,
  deps: PublicTableDeps = {},
): Promise<PublicTable> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  const result = await client.match.seat.list(input.matchId);

  let movesList;
  try {
    movesList = await client.match.moves.list(input.matchId);
  } catch {
    return {
      matchId: input.matchId,
      seats: result.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);
  if (!handOpen) {
    return {
      matchId: input.matchId,
      seats: result.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const seatIds = handOpen.seats.map((seat) => seat.seatId);
  const holesBySeat = syntheticHolesForSeats(seatIds);
  const reconstructed = reconstructHand({
    handOpen,
    actions: actionsAfterHandOpen(items),
    holesBySeat,
  });

  if (!reconstructed.ok) {
    return {
      matchId: input.matchId,
      seats: result.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const state = reconstructed.value;
  return {
    matchId: input.matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
  };
}

export async function loadSeatHole(
  client: TurnurClient,
  matchId: string,
  seatId: string,
): Promise<[Card, Card] | null> {
  const viewResult = await client.match.view.get(matchId, seatId);
  if (viewResult.view === null || viewResult.view === undefined) {
    return null;
  }
  const { parseHoleView } = await import('./dto.js');
  const parsed = parseHoleView(viewResult.view);
  return parsed?.hole ?? null;
}
