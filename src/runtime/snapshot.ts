import { bigBlindSeatId, smallBlindSeatId } from '../rules/state.js';
import type { HandState } from '../rules/types.js';
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
  handState: HandState | null,
  buttonSeatId?: string,
): PlayerSnapshotSeat['position'] {
  if (!handState || !buttonSeatId) {
    return null;
  }
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

function buildHandState(table: TableRecord, seats: SeatRecord[]): HandState | null {
  if (table.status !== 'hand_in_progress' || !table.buttonSeatId) {
    return null;
  }

  const seated = seats.filter((seat) => seat.hole);
  if (seated.length === 0) {
    return null;
  }

  return {
    seats: seated.map((seat) => ({
      seatId: seat.seatId,
      stack: seat.stack,
      hole: seat.hole!,
      folded: seat.folded ?? false,
      streetCommitted: seat.streetCommitted ?? 0,
      handCommitted: seat.handCommitted ?? 0,
    })),
    buttonSeatId: table.buttonSeatId,
    blinds: { ...table.blinds },
    street: table.street ?? 'preflop',
    phase: 'betting',
    currentSeatId: table.currentSeatId ?? null,
    board: table.board ?? [],
    pot: table.pot ?? 0,
    currentBet: table.blinds.bigBlind,
    lastRaiseSize: table.blinds.bigBlind,
    deckRemaining: [],
    burns: [],
    winners: null,
    completeReason: null,
  };
}

export function buildSeatScopedSnapshot(
  table: TableRecord,
  seats: SeatRecord[],
  viewer: ConnectionRecord | null,
): TableSnapshotMessage {
  const occupied = seats.filter((seat) => seat.displayName);
  const handState = buildHandState(table, occupied);
  const viewerSeatId = viewer?.seatId ?? null;

  const playerSeats: PlayerSnapshotSeat[] = occupied.map((seat) => ({
    seatId: seat.seatId,
    displayName: seat.displayName,
    isLocal: seat.seatId === viewerSeatId,
    stack: seat.stack,
    inHand: table.status === 'hand_in_progress' && Boolean(seat.hole),
    committed: seat.streetCommitted ?? 0,
    position: handState ? seatPosition(seat.seatId, handState, table.buttonSeatId) : null,
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

  if (viewerSeatId) {
    const localSeat = occupied.find((seat) => seat.seatId === viewerSeatId);
    if (localSeat?.hole) {
      snapshot.pocketCards = [localSeat.hole[0], localSeat.hole[1]];
    }
  }

  return snapshot;
}

export function buildPublicSnapshot(table: TableRecord): TableSnapshotMessage {
  return buildSeatScopedSnapshot(table, [], null);
}
