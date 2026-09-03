import { randomUUID } from 'node:crypto';
import type { TurnurClient } from '@turnur/sdk';
import { TurnurApiError } from '@turnur/sdk';
import { vi } from 'vitest';
import { TEST_TURNUR_GAME_ID } from './turnur-fixtures.js';

export interface FakeSeatStore {
  seats: Map<string, Array<Record<string, unknown>>>;
  seatCreateCalls: number;
  seatListCalls: number;
  turnSetCalls: number;
  viewPutCalls: number;
  moveCreateCalls: number;
}

export function createFakeSeatStore(): FakeSeatStore {
  return {
    seats: new Map(),
    seatCreateCalls: 0,
    seatListCalls: 0,
    turnSetCalls: 0,
    viewPutCalls: 0,
    moveCreateCalls: 0,
  };
}

export function createFakeTurnurClientWithSeats(
  store: FakeSeatStore,
  options: {
    meError?: TurnurApiError;
    createError?: TurnurApiError;
    listError?: TurnurApiError;
  } = {},
): TurnurClient {
  return {
    game: {
      me: vi.fn(async () => {
        if (options.meError) {
          throw options.meError;
        }
        return { gameId: TEST_TURNUR_GAME_ID };
      }),
    },
    match: {
      create: vi.fn(),
      get: vi.fn(),
      seat: {
        create: vi.fn(async (matchId: string) => {
          store.seatCreateCalls += 1;
          if (options.createError) {
            throw options.createError;
          }
          const seatId = randomUUID();
          const createdAt = new Date().toISOString();
          const roster = store.seats.get(matchId) ?? [];
          roster.push({
            seatId,
            createdAt,
            playerId: 'planted-player-id',
            view: { hidden: true },
            holeCards: ['As', 'Kh'],
          });
          store.seats.set(matchId, roster);
          return { seatId, currentSeat: null };
        }),
        list: vi.fn(async (matchId: string) => {
          store.seatListCalls += 1;
          if (options.listError) {
            throw options.listError;
          }
          const roster = store.seats.get(matchId) ?? [];
          return {
            seats: roster.map((seat) => ({ ...seat })),
            currentSeat: null,
          };
        }),
      },
      turn: {
        get: vi.fn(),
        set: vi.fn(async () => {
          store.turnSetCalls += 1;
          return { currentSeat: null };
        }),
      },
      move: {
        create: vi.fn(async () => {
          store.moveCreateCalls += 1;
          return {
            seq: 1,
            seatId: 'seat-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            currentSeat: null,
          };
        }),
      },
      view: {
        put: vi.fn(async () => {
          store.viewPutCalls += 1;
          return { seatId: 'seat-1' };
        }),
        get: vi.fn(),
      },
      moves: {
        list: vi.fn(),
      },
    },
  };
}
