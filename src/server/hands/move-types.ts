import type { Action, Card } from '../../rules/types.js';

export type HandOpenPayload = {
  kind: 'hand_open';
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
};

export type ActionPayload = {
  kind: 'action';
  action: Action;
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

export function buildHandOpenPayload(input: {
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
}): HandOpenPayload {
  return {
    kind: 'hand_open',
    seats: input.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    buttonSeatId: input.buttonSeatId,
    blinds: { ...input.blinds },
  };
}

export function buildActionPayload(action: Action): ActionPayload {
  return { kind: 'action', action };
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
