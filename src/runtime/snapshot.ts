import type { TableRecord, TableSnapshotMessage } from './types.js';

export function buildPublicSnapshot(table: TableRecord): TableSnapshotMessage {
  return {
    type: 'table_snapshot',
    tableId: table.tableId,
    version: table.version,
    status: table.status,
    createdAt: table.createdAt,
  };
}
