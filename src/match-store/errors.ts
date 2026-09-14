export const CLIENT_SUPPLIED_STATE_KEYS = [
  'stack',
  'pot',
  'deal',
  'board',
  'hole',
  'holes',
  'holeCards',
  'shoe',
  'deckRemaining',
  'burns',
  'blinds',
] as const;

export type MatchStoreErrorCode =
  | 'illegal_turn'
  | 'match_not_found'
  | 'seat_not_found'
  | 'client_supplied_state'
  | 'invalid_seat_count'
  | 'not_enough_seats'
  | 'hand_already_open'
  | 'invalid_payload'
  | 'invalid_deal';

export function hasClientSuppliedStateKeys(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  for (const key of Object.keys(input)) {
    if ((CLIENT_SUPPLIED_STATE_KEYS as readonly string[]).includes(key)) {
      return true;
    }
  }
  return false;
}
