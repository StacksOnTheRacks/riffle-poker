import { randomUUID } from 'node:crypto';
import type { TurnurClient } from '@turnur/sdk';
import { TurnurApiError } from '@turnur/sdk';
import { vi } from 'vitest';
import { TEST_TURNUR_GAME_ID } from './turnur-fixtures.js';

export interface FakeSeatStore {
  seats: Map<string, Array<Record<string, unknown>>>;
  views: Map<string, Map<string, unknown>>;
  seatCreateCalls: number;
  seatListCalls: number;
  turnSetCalls: number;
  viewPutCalls: number;
  viewGetCalls: number;
  moveCreateCalls: number;
  viewPutBodies: Array<{ matchId: string; seatId: string; view: unknown }>;
}

export function createFakeSeatStore(): FakeSeatStore {
  return {
    seats: new Map(),
    views: new Map(),
    seatCreateCalls: 0,
    seatListCalls: 0,
    turnSetCalls: 0,
    viewPutCalls: 0,
    viewGetCalls: 0,
    moveCreateCalls: 0,
    viewPutBodies: [],
  };
}

function rosterForMatch(store: FakeSeatStore, matchId: string) {
  const roster = store.seats.get(matchId) ?? [];
  return roster.map((seat) => ({
    seatId: seat.seatId as string,
    createdAt: seat.createdAt as string,
  }));
}

export function createFakeTurnurClientWithSeats(
  store: FakeSeatStore,
  options: {
    meError?: TurnurApiError;
    createError?: TurnurApiError;
    listError?: TurnurApiError;
    viewPutError?: TurnurApiError;
    viewGetError?: TurnurApiError;
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
          return {
            seats: rosterForMatch(store, matchId),
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
        put: vi.fn(async (input: { matchId: string; seatId: string; view: unknown }) => {
          store.viewPutCalls += 1;
          store.viewPutBodies.push(input);
          if (options.viewPutError) {
            throw options.viewPutError;
          }
          const matchViews = store.views.get(input.matchId) ?? new Map<string, unknown>();
          matchViews.set(input.seatId, input.view);
          store.views.set(input.matchId, matchViews);
          return { seatId: input.seatId };
        }),
        get: vi.fn(async (input: { matchId: string; seatId: string }) => {
          store.viewGetCalls += 1;
          if (options.viewGetError) {
            throw options.viewGetError;
          }
          const matchViews = store.views.get(input.matchId);
          const view = matchViews?.get(input.seatId) ?? null;
          return { seatId: input.seatId, view };
        }),
      },
      moves: {
        list: vi.fn(),
      },
    },
  };
}

export function seedFakeSeats(
  store: FakeSeatStore,
  matchId: string,
  seatIds: string[],
): void {
  const roster = seatIds.map((seatId) => ({
    seatId,
    createdAt: new Date().toISOString(),
  }));
  store.seats.set(matchId, roster);
}
