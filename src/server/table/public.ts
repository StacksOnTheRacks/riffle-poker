import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { PublicTable } from './dto.js';

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
  return {
    matchId: input.matchId,
    seats: result.seats.map((seat) => ({ seatId: seat.seatId })),
    currentSeat: result.currentSeat,
  };
}
