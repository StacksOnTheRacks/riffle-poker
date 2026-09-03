import type { TurnurClient } from '@turnur/sdk';
import { legalActions } from '../../rules/index.js';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { SeatTable } from './dto.js';
import { parseHoleView } from './dto.js';
import type { MoveLogItem } from '../hands/move-types.js';
import { syntheticHolesForSeats } from '../hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../hands/reconstruct.js';

export interface SeatTableInput {
  matchId: string;
  seatId: string;
}

export interface SeatTableDeps {
  getClient?: () => Promise<TurnurClient>;
}

export async function getSeatTable(
  input: SeatTableInput,
  deps: SeatTableDeps = {},
): Promise<SeatTable> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();

  await client.match.seat.list(input.matchId);
  const movesList = await client.match.moves.list(input.matchId);
  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);

  if (!handOpen) {
    const roster = await client.match.seat.list(input.matchId);
    const viewResult = await client.match.view.get(input.matchId, input.seatId);
    let hole: SeatTable['hole'] = null;
    if (viewResult.view !== null && viewResult.view !== undefined) {
      const parsed = parseHoleView(viewResult.view);
      hole = parsed?.hole ?? null;
    }
    return {
      matchId: input.matchId,
      seats: roster.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: roster.currentSeat,
      seatId: input.seatId,
      hole,
    };
  }

  const seatIds = handOpen.seats.map((seat) => seat.seatId);
  const holesBySeat = syntheticHolesForSeats(seatIds);

  const viewResult = await client.match.view.get(input.matchId, input.seatId);
  if (viewResult.view !== null && viewResult.view !== undefined) {
    const parsed = parseHoleView(viewResult.view);
    if (parsed) {
      holesBySeat.set(input.seatId, parsed.hole);
    }
  }

  const reconstructed = reconstructHand({
    handOpen,
    actions: actionsAfterHandOpen(items),
    holesBySeat,
  });

  if (!reconstructed.ok) {
    const roster = await client.match.seat.list(input.matchId);
    return {
      matchId: input.matchId,
      seats: roster.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: roster.currentSeat,
      seatId: input.seatId,
      hole: null,
    };
  }

  const state = reconstructed.value;
  const ownHole = holesBySeat.get(input.seatId) ?? null;
  const table: SeatTable = {
    matchId: input.matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
    seatId: input.seatId,
    hole: ownHole,
  };

  if (state.phase === 'betting' && state.currentSeatId === input.seatId) {
    table.legalActions = legalActions(state, input.seatId);
  }

  return table;
}

export { InvalidViewError } from './view.js';
