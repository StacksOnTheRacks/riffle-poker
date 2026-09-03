import type { Card } from '../../rules/types.js';

export type { Card };

export type HoleView = { hole: [Card, Card] };

const CARD_PATTERN = /^[AKQJT98765432][shdc]$/;

export function isCard(value: unknown): value is Card {
  return typeof value === 'string' && CARD_PATTERN.test(value);
}

export function parseHoleView(value: unknown): HoleView | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const hole = record.hole;
  if (!Array.isArray(hole) || hole.length !== 2) {
    return null;
  }
  if (!isCard(hole[0]) || !isCard(hole[1])) {
    return null;
  }
  return { hole: [hole[0], hole[1]] };
}

export type PublicTable = {
  matchId: string;
  seats: { seatId: string }[];
  currentSeat: string | null;
};

export type SeatViewResponse = {
  seatId: string;
  view: HoleView | null;
};

export type SeatTable = {
  matchId: string;
  seats: { seatId: string }[];
  currentSeat: string | null;
  seatId: string;
  hole: [Card, Card] | null;
};

export const HOLE_FIELD_DENYLIST = [
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'board',
  'pot',
  'blinds',
  'street',
  'HandState',
] as const;
