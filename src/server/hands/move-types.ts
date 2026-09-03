import type { Action, Card } from '../../rules/types.js';

export type HandOpenPayload = {
  kind: 'hand_open';
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
  shoeSeatId?: string;
};

export type ActionPayload = {
  kind: 'action';
  action: Action;
};

export type StreetDealPayload = {
  kind: 'street_deal';
  street: 'flop' | 'turn' | 'river';
  board: Card[];
};

export type MoveLogItem = {
  seq: number;
  seatId: string;
  payload: unknown;
  createdAt: string;
};

export function isHandOpenPayload(payload: unknown): payload is HandOpenPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return record.kind === 'hand_open';
}

export function isActionPayload(payload: unknown): payload is ActionPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return record.kind === 'action' && typeof record.action === 'object' && record.action !== null;
}

export function isStreetDealPayload(payload: unknown): payload is StreetDealPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    record.kind === 'street_deal' &&
    (record.street === 'flop' || record.street === 'turn' || record.street === 'river') &&
    Array.isArray(record.board)
  );
}

export function buildHandOpenPayload(input: {
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
  shoeSeatId?: string;
}): HandOpenPayload {
  const payload: HandOpenPayload = {
    kind: 'hand_open',
    seats: input.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    buttonSeatId: input.buttonSeatId,
    blinds: { ...input.blinds },
  };
  if (input.shoeSeatId) {
    payload.shoeSeatId = input.shoeSeatId;
  }
  return payload;
}

export function buildActionPayload(action: Action): ActionPayload {
  return { kind: 'action', action };
}

export function buildStreetDealPayload(
  street: 'flop' | 'turn' | 'river',
  board: Card[],
): StreetDealPayload {
  return { kind: 'street_deal', street, board: [...board] };
}

export function findLatestStreetBoard(moves: MoveLogItem[]): Card[] | undefined {
  let latest: Card[] | undefined;
  for (const item of moves) {
    if (isStreetDealPayload(item.payload)) {
      latest = item.payload.board;
    }
  }
  return latest;
}

export function hasStreetDealAfterLastAction(moves: MoveLogItem[]): boolean {
  let lastActionIndex = -1;
  for (let i = 0; i < moves.length; i += 1) {
    if (isActionPayload(moves[i]?.payload)) {
      lastActionIndex = i;
    }
  }
  if (lastActionIndex === -1) {
    return false;
  }
  for (let i = lastActionIndex + 1; i < moves.length; i += 1) {
    if (isStreetDealPayload(moves[i]?.payload)) {
      return true;
    }
  }
  return false;
}

export function lastActionSeatId(moves: MoveLogItem[]): string | null {
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    if (isActionPayload(moves[i]?.payload)) {
      return moves[i]!.seatId;
    }
  }
  return null;
}

export const SYNTHETIC_HOLE_DECK: Card[] = [
  '2c', '2d', '2h', '2s', '3c', '3d', '3h', '3s', '4c', '4d', '4h', '4s',
  '5c', '5d', '5h', '5s', '6c', '6d', '6h', '6s', '7c', '7d', '7h', '7s',
  '8c', '8d', '8h', '8s', '9c', '9d', '9h', '9s', 'Tc', 'Td', 'Th', 'Ts',
  'Jc', 'Jd', 'Jh', 'Js', 'Qc', 'Qd', 'Qh', 'Qs', 'Kc', 'Kd', 'Kh', 'Ks',
  'Ac', 'Ad', 'Ah', 'As',
];

export function syntheticHolesForSeats(seatIds: string[]): Map<string, [Card, Card]> {
  const holes = new Map<string, [Card, Card]>();
  let index = 0;
  for (const seatId of seatIds) {
    const first = SYNTHETIC_HOLE_DECK[index];
    const second = SYNTHETIC_HOLE_DECK[index + 1];
    if (!first || !second) {
      throw new Error('insufficient synthetic hole deck');
    }
    holes.set(seatId, [first, second]);
    index += 2;
  }
  return holes;
}
