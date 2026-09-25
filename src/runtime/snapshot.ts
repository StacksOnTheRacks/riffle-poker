import { bigBlindSeatId, smallBlindSeatId, toCall } from '../rules/state.js';
import { rehydrateHandState } from './hand-state.js';
import type {
  ConnectionRecord,
  PlayerSnapshotSeat,
  SeatRecord,
  TableRecord,
  TableSnapshotMessage,
} from './types.js';

export function formatBlindsLabel(blinds: { smallBlind: number; bigBlind: number }): string {
  return `$${blinds.smallBlind} / $${blinds.bigBlind}`;
}

function seatPosition(
  seatId: string,
  buttonSeatId: string,
  handState: NonNullable<ReturnType<typeof rehydrateHandState>>,
): PlayerSnapshotSeat['position'] {
  if (seatId === buttonSeatId) {
    return 'D';
  }
  if (seatId === smallBlindSeatId(handState)) {
    return 'SB';
  }
  if (seatId === bigBlindSeatId(handState)) {
    return 'BB';
  }
  return null;
}

export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: SeatRecord[],
  viewer: ConnectionRecord | null,
): TableSnapshotMessage {
  const occupied = seats.filter((seat) => seat.displayName);
  const handState = rehydrateHandState(table, occupied);
  const viewerSeatId = viewer?.seatId ?? null;

  const playerSeats: PlayerSnapshotSeat[] = occupied.map((seat) => ({
    seatId: seat.seatId,
    displayName: seat.displayName,
    isLocal: seat.seatId === viewerSeatId,
    stack: seat.stack,
    inHand: table.status === 'hand_in_progress' && Boolean(seat.hole) && !seat.folded,
    committed: seat.streetCommitted ?? 0,
    position:
      handState && table.buttonSeatId
        ? seatPosition(seat.seatId, table.buttonSeatId, handState)
        : null,
    acting: table.currentSeatId === seat.seatId,
    folded: seat.folded ?? false,
  }));

  const snapshot: TableSnapshotMessage = {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    status: table.status,
    createdAt: table.createdAt,
    handNumber: table.handNumber > 0 ? table.handNumber : null,
    street: table.status === 'hand_in_progress' ? (table.street ?? 'preflop') : null,
    blindsLabel: formatBlindsLabel(table.blinds),
    seatedPlayersLabel: `${occupied.length} / ${table.maxSeats}`,
    pot: table.pot ?? 0,
    buttonSeatId: table.buttonSeatId ?? null,
    currentSeatId: table.currentSeatId ?? null,
    seats: playerSeats,
  };

  if (table.status === 'hand_in_progress') {
    snapshot.phase = table.phase ?? 'betting';
    snapshot.board = [...(table.board ?? [])];
  }

  if (viewerSeatId && handState) {
    const localSeat = occupied.find((seat) => seat.seatId === viewerSeatId);
    if (localSeat?.hole) {
      snapshot.pocketCards = [localSeat.hole[0], localSeat.hole[1]];
      const handSeat = handState.seats.find((seat) => seat.seatId === viewerSeatId);
      if (handSeat && handState.phase === 'betting') {
        snapshot.toCall = toCall(handSeat, handState.currentBet);
      }
    }
  }

  return snapshot;
}

export function buildPublicSnapshot(table: TableRecord): TableSnapshotMessage {
  return buildSeatScopedSnapshot(table, [], null);
}
