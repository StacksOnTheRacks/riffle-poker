import { validateDisplayName } from '../shared/display-name.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import type { MatchStore } from './store.js';
import type { ClientMessage, ConnectionRecord, SeatRecord, TableRecord } from './types.js';

const VALID_SEAT_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8']);

export type SitErrorCode =
  | 'not_table_member'
  | 'hand_in_progress'
  | 'seat_occupied'
  | 'already_seated'
  | 'table_full'
  | 'empty_display_name'
  | 'invalid_display_name'
  | 'invalid_seat'
  | 'client_supplied_state'
  | 'invalid_seat_token'
  | 'not_seated'
  | 'version_conflict';

export interface SitContext {
  store: MatchStore;
  connection: ConnectionRecord;
  table: TableRecord;
  seats: SeatRecord[];
  message: ClientMessage;
}

export interface SitSuccess {
  ok: true;
  seatToken: string;
  seatId: string;
  table: TableRecord;
  seats: SeatRecord[];
}

export interface SitFailure {
  ok: false;
  code: SitErrorCode;
}

export type SitResult = SitSuccess | SitFailure;

function isValidSeatId(seatId: string | undefined): seatId is string {
  return typeof seatId === 'string' && VALID_SEAT_IDS.has(seatId);
}

export async function handleSit(ctx: SitContext): Promise<SitResult> {
  const { connection, table, seats, message } = ctx;

  if (!connection.tableId || connection.tableId !== table.tableId) {
    return { ok: false, code: 'not_table_member' };
  }

  if (table.status === 'hand_in_progress') {
    return { ok: false, code: 'hand_in_progress' };
  }

  if (!isValidSeatId(message.seatId)) {
    return { ok: false, code: 'invalid_seat' };
  }

  if (!(message.displayName ?? '').trim()) {
    return { ok: false, code: 'empty_display_name' };
  }
  const validatedName = validateDisplayName(message.displayName);
  if (!validatedName.ok) {
    return { ok: false, code: 'invalid_display_name' };
  }
  const displayName = validatedName.value;

  if (connection.seatId) {
    return { ok: false, code: 'already_seated' };
  }

  if (seats.length >= table.maxSeats) {
    return { ok: false, code: 'table_full' };
  }

  const existingSeat = seats.find((seat) => seat.seatId === message.seatId);
  if (existingSeat) {
    return { ok: false, code: 'seat_occupied' };
  }

  const seatToken = mintSeatToken();
  const seatTokenHash = hashSeatToken(seatToken);
  const newSeat: SeatRecord = {
    seatId: message.seatId,
    displayName,
    stack: table.defaultStack,
    seatTokenHash,
    connectionId: connection.connectionId,
  };

  await ctx.store.putSeat(table.tableId, newSeat);
  await ctx.store.bindConnectionToSeat(connection.connectionId, message.seatId);

  const updatedTable = await ctx.store.incrementTableVersion(table.tableId, table.version);
  if (!updatedTable) {
    return { ok: false, code: 'version_conflict' };
  }

  return {
    ok: true,
    seatToken,
    seatId: message.seatId,
    table: updatedTable,
    seats: [...seats, newSeat],
  };
}

export async function handleLeave(ctx: SitContext): Promise<SitResult> {
  const { connection, table, seats, message } = ctx;

  if (table.status === 'hand_in_progress') {
    return { ok: false, code: 'hand_in_progress' };
  }

  if (!message.seatToken) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  const seat = seats.find((row) => row.seatId === connection.seatId);
  if (!seat || !connection.seatId) {
    return { ok: false, code: 'not_seated' };
  }

  if (!verifySeatToken(message.seatToken, seat.seatTokenHash)) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  await ctx.store.deleteSeat(table.tableId, seat.seatId);
  await ctx.store.clearConnectionSeat(connection.connectionId);

  const updatedTable = await ctx.store.incrementTableVersion(table.tableId, table.version);
  if (!updatedTable) {
    return { ok: false, code: 'version_conflict' };
  }

  const remainingSeats = seats.filter((row) => row.seatId !== seat.seatId);
  return {
    ok: true,
    seatToken: '',
    seatId: seat.seatId,
    table: updatedTable,
    seats: remainingSeats,
  };
}

export function findSeatByToken(
  seats: SeatRecord[],
  seatToken: string,
): SeatRecord | null {
  return seats.find((seat) => verifySeatToken(seatToken, seat.seatTokenHash)) ?? null;
}
