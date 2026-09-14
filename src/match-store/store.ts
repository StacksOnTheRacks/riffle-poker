import { randomBytes } from 'node:crypto';
import { dealHand } from '../rules/deal.js';
import type { Rng } from '../rules/types.js';
import { createCryptoRng } from '../server/hands/rng.js';
import {
  buildHandOpenPayload,
  findLatestHandComplete,
  isActionPayload,
  isHandCompletePayload,
  isHandOpenPayload,
  isStreetDealPayload,
  type MoveLogItem,
} from '../server/hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../server/hands/reconstruct.js';
import { MATCH_BLINDS, MATCH_STARTING_STACK } from './constants.js';
import { hasClientSuppliedStateKeys } from './errors.js';
import type {
  HoldWriteHandle,
  MatchRecord,
  MatchStoreResult,
  PublicMatchState,
  SeatMatchView,
} from './types.js';

const PUBLIC_OMIT_KEYS = new Set([
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'HandState',
  'shoe',
  'deckRemaining',
  'burns',
  'hiddenViews',
]);

function generateMatchId(): string {
  return `m_${randomBytes(16).toString('base64url')}`;
}

function generateSeatId(): string {
  return `s_${randomBytes(8).toString('base64url')}`;
}

function fail<T>(
  error: MatchStoreResult<T> extends { ok: false; error: infer E } ? E : never,
  status: 400 | 404 | 409,
): MatchStoreResult<T> {
  return { ok: false, error, status };
}

function hasHandOpen(moves: MoveLogItem[]): boolean {
  return moves.some((item) => isHandOpenPayload(item.payload));
}

export function sanitizeForPublic(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForPublic);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (PUBLIC_OMIT_KEYS.has(key)) {
        continue;
      }
      result[key] = sanitizeForPublic(val);
    }
    return result;
  }
  return value;
}

function buildPublicState(record: MatchRecord): PublicMatchState {
  const base: PublicMatchState = {
    matchId: record.matchId,
    seats: record.seats.map((seat) => ({
      seatId: seat.seatId,
      playerSubject: seat.playerSubject,
      displayName: seat.displayName,
      stack: seat.stack,
    })),
    currentSeat: record.currentSeat,
  };

  const handOpen = findLatestHandOpen(record.moves);
  if (!handOpen) {
    return base;
  }

  const holesBySeat = new Map<string, [import('../rules/types.js').Card, import('../rules/types.js').Card]>();
  for (const [seatId, view] of record.hiddenViews) {
    holesBySeat.set(seatId, [view.hole[0], view.hole[1]]);
  }

  const reconstructed = reconstructHand({
    handOpen,
    actions: actionsAfterHandOpen(record.moves),
    holesBySeat,
    shoe: record.shoe,
  });

  if (reconstructed.ok) {
    base.pot = reconstructed.value.pot;
    if (reconstructed.value.board.length > 0) {
      base.board = [...reconstructed.value.board];
    }
    base.street = reconstructed.value.street;
  }

  const complete = findLatestHandComplete(record.moves);
  if (complete) {
    base.completeReason = complete.reason;
    base.winners = complete.winners.map((winner) => ({
      seatId: winner.seatId,
      amount: winner.amount,
    }));
    if (complete.reason === 'showdown' && complete.shownHoles) {
      base.shownHoles = complete.shownHoles.map((shown) => ({
        seatId: shown.seatId,
        hole: [shown.hole[0], shown.hole[1]] as [import('../rules/types.js').Card, import('../rules/types.js').Card],
      }));
    }
  }

  return base;
}

export interface MatchStore {
  createMatch(input?: { seatCount?: number }): MatchStoreResult<{ matchId: string }>;
  addEmptySeats(matchId: string, count: number): MatchStoreResult<{ seatIds: string[] }>;
  setSeatOccupant(
    matchId: string,
    seatId: string,
    playerSubject: string | null,
  ): MatchStoreResult<{ seatId: string; playerSubject: string | null }>;
  openHand(
    matchId: string,
    input?: { buttonSeatId?: string; rng?: Rng },
  ): MatchStoreResult<{ matchId: string; currentSeat: string }>;
  appendMove(
    matchId: string,
    seatId: string,
    payload: unknown,
  ): MatchStoreResult<{ seq: number }>;
  getPublicState(matchId: string): MatchStoreResult<PublicMatchState>;
  getSeatView(matchId: string, seatId: string): MatchStoreResult<SeatMatchView>;
  getMoves(matchId: string): MatchStoreResult<MoveLogItem[]>;
  holdWrite(matchId: string): MatchStoreResult<HoldWriteHandle>;
}

export function createMatchStore(): MatchStore {
  const matches = new Map<string, MatchRecord>();

  function getRecord(matchId: string): MatchRecord | undefined {
    return matches.get(matchId);
  }

  function withWriteLock<T>(
    matchId: string,
    fn: (record: MatchRecord) => MatchStoreResult<T>,
  ): MatchStoreResult<T> {
    const record = getRecord(matchId);
    if (!record) {
      return fail('match_not_found', 404);
    }
    if (record.locked) {
      return fail('illegal_turn', 409);
    }
    record.locked = true;
    try {
      return fn(record);
    } finally {
      record.locked = false;
    }
  }

  function isValidMovePayload(payload: unknown): boolean {
    return (
      isHandOpenPayload(payload) ||
      isActionPayload(payload) ||
      isStreetDealPayload(payload) ||
      isHandCompletePayload(payload)
    );
  }

  return {
    createMatch(input = {}) {
      if (hasClientSuppliedStateKeys(input)) {
        return fail('client_supplied_state', 400);
      }

      const seatCount = input.seatCount ?? 2;
      if (!Number.isInteger(seatCount) || seatCount < 0 || seatCount > 9) {
        return fail('invalid_seat_count', 400);
      }

      const matchId = generateMatchId();
      const seats = Array.from({ length: seatCount }, () => ({
        seatId: generateSeatId(),
        playerSubject: null as string | null,
        displayName: null as string | null,
        stack: MATCH_STARTING_STACK,
      }));

      matches.set(matchId, {
        matchId,
        seats,
        currentSeat: null,
        hiddenViews: new Map(),
        moves: [],
        shoe: null,
        locked: false,
      });

      return { ok: true, value: { matchId } };
    },

    addEmptySeats(matchId, count) {
      return withWriteLock(matchId, (record) => {
        if (!Number.isInteger(count) || count < 1) {
          return fail('invalid_seat_count', 400);
        }
        if (record.seats.length + count > 9) {
          return fail('invalid_seat_count', 400);
        }

        const seatIds: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const seatId = generateSeatId();
          record.seats.push({
            seatId,
            playerSubject: null,
            displayName: null,
            stack: MATCH_STARTING_STACK,
          });
          seatIds.push(seatId);
        }

        return { ok: true, value: { seatIds } };
      });
    },

    setSeatOccupant(matchId, seatId, playerSubject) {
      return withWriteLock(matchId, (record) => {
        const seat = record.seats.find((entry) => entry.seatId === seatId);
        if (!seat) {
          return fail('seat_not_found', 404);
        }
        seat.playerSubject = playerSubject;
        return { ok: true, value: { seatId, playerSubject } };
      });
    },

    openHand(matchId, input = {}) {
      return withWriteLock(matchId, (record) => {
        if (hasClientSuppliedStateKeys(input)) {
          return fail('client_supplied_state', 400);
        }

        if (record.seats.length < 2 || record.seats.length > 9) {
          return fail('not_enough_seats', 400);
        }

        if (hasHandOpen(record.moves)) {
          return fail('hand_already_open', 409);
        }

        const buttonSeatId = input.buttonSeatId ?? record.seats[0]!.seatId;
        if (!record.seats.some((seat) => seat.seatId === buttonSeatId)) {
          return fail('seat_not_found', 404);
        }

        const preBlindStacks = record.seats.map((seat) => ({
          seatId: seat.seatId,
          stack: seat.stack,
        }));

        const dealt = dealHand({
          seats: preBlindStacks,
          buttonSeatId,
          blinds: MATCH_BLINDS,
          rng: input.rng ?? createCryptoRng(),
        });

        if (!dealt.ok) {
          return fail('invalid_deal', 400);
        }

        const hand = dealt.value;

        record.hiddenViews.clear();
        for (const seatState of hand.seats) {
          record.hiddenViews.set(seatState.seatId, {
            hole: [seatState.hole[0], seatState.hole[1]],
          });
        }

        record.shoe = {
          kind: 'dealer_shoe',
          deckRemaining: [...hand.deckRemaining],
          burns: [...hand.burns],
        };

        for (const seatState of hand.seats) {
          const seat = record.seats.find((entry) => entry.seatId === seatState.seatId);
          if (seat) {
            seat.stack = seatState.stack;
          }
        }

        const currentSeat = hand.currentSeatId;
        if (currentSeat === null) {
          return fail('invalid_deal', 400);
        }

        record.currentSeat = currentSeat;

        const payload = buildHandOpenPayload({
          seats: preBlindStacks,
          buttonSeatId,
          blinds: MATCH_BLINDS,
        });

        record.moves.push({
          seq: record.moves.length + 1,
          seatId: currentSeat,
          payload,
          createdAt: new Date().toISOString(),
        });

        return { ok: true, value: { matchId, currentSeat } };
      });
    },

    appendMove(matchId, seatId, payload) {
      return withWriteLock(matchId, (record) => {
        if (!record.seats.some((seat) => seat.seatId === seatId)) {
          return fail('seat_not_found', 404);
        }

        if (!isValidMovePayload(payload)) {
          return fail('invalid_payload', 400);
        }

        const seq = record.moves.length + 1;
        record.moves.push({
          seq,
          seatId,
          payload,
          createdAt: new Date().toISOString(),
        });

        if (isActionPayload(payload)) {
          const handOpen = findLatestHandOpen(record.moves);
          if (handOpen) {
            const holesBySeat = new Map<
              string,
              [import('../rules/types.js').Card, import('../rules/types.js').Card]
            >();
            for (const [id, view] of record.hiddenViews) {
              holesBySeat.set(id, [view.hole[0], view.hole[1]]);
            }
            const reconstructed = reconstructHand({
              handOpen,
              actions: actionsAfterHandOpen(record.moves),
              holesBySeat,
              shoe: record.shoe,
            });
            if (reconstructed.ok) {
              record.currentSeat = reconstructed.value.currentSeatId;
              for (const seatState of reconstructed.value.seats) {
                const seat = record.seats.find((entry) => entry.seatId === seatState.seatId);
                if (seat) {
                  seat.stack = seatState.stack;
                }
              }
            }
          }
        }

        if (isHandCompletePayload(payload)) {
          record.currentSeat = null;
        }

        return { ok: true, value: { seq } };
      });
    },

    getPublicState(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      return { ok: true, value: buildPublicState(record) };
    },

    getSeatView(matchId, seatId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      if (!record.seats.some((seat) => seat.seatId === seatId)) {
        return fail('seat_not_found', 404);
      }

      const publicState = buildPublicState(record);
      const hidden = record.hiddenViews.get(seatId);

      return {
        ok: true,
        value: {
          ...publicState,
          seatId,
          hole: hidden ? ([hidden.hole[0], hidden.hole[1]] as const) : null,
        },
      };
    },

    getMoves(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      return {
        ok: true,
        value: record.moves.map((item) => ({
          ...item,
          payload:
            typeof item.payload === 'object' && item.payload !== null
              ? structuredClone(item.payload)
              : item.payload,
        })),
      };
    },

    holdWrite(matchId) {
      const record = getRecord(matchId);
      if (!record) {
        return fail('match_not_found', 404);
      }
      if (record.locked) {
        return fail('illegal_turn', 409);
      }
      record.locked = true;
      return {
        ok: true,
        value: {
          release: () => {
            record.locked = false;
          },
        },
      };
    },
  };
}
