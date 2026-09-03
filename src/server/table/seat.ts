import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { SeatTable } from './dto.js';
import { getPublicTable } from './public.js';
import { getSeatView, InvalidViewError } from './view.js';

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
  const publicTable = await getPublicTable({ matchId: input.matchId }, deps);
  const seatView = await getSeatView(
    { matchId: input.matchId, seatId: input.seatId },
    deps,
  );

  return {
    matchId: publicTable.matchId,
    seats: publicTable.seats,
    currentSeat: publicTable.currentSeat,
    seatId: input.seatId,
    hole: seatView.view?.hole ?? null,
  };
}

export { InvalidViewError };
