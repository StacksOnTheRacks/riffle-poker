import { describe, expect, it, vi } from 'vitest';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { buildPublicSnapshot } from '../../src/runtime/snapshot.js';
import type { MatchStore } from '../../src/runtime/store.js';
import type { OutboundMessage, TableRecord, WebSocketEvent } from '../../src/runtime/types.js';

function wsEvent(
  routeKey: string,
  connectionId: string,
  body?: string,
): WebSocketEvent {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      stage: 'prod',
    },
    body,
  };
}

class MemoryStore implements MatchStore {
  private connections = new Map<string, { tableId?: string }>();
  private tables = new Map<string, TableRecord>();

  async putConnection(connectionId: string): Promise<void> {
    this.connections.set(connectionId, {});
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async getConnection(connectionId: string) {
    const row = this.connections.get(connectionId);
    if (!row) {
      return null;
    }
    return { connectionId, tableId: row.tableId };
  }

  async createTable(tableId: string, createdAt: string): Promise<TableRecord> {
    const table: TableRecord = {
      tableId,
      version: 1,
      status: 'open',
      createdAt,
    };
    this.tables.set(tableId, table);
    return table;
  }

  async bindConnectionToTable(connectionId: string, tableId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (!row) {
      throw new Error('missing connection');
    }
    row.tableId = tableId;
  }

  async getTable(tableId: string): Promise<TableRecord | null> {
    return this.tables.get(tableId) ?? null;
  }

  async incrementTableVersion(
    tableId: string,
    expectedVersion: number,
  ): Promise<TableRecord | null> {
    const table = this.tables.get(tableId);
    if (!table || table.version !== expectedVersion) {
      return null;
    }
    const updated = { ...table, version: table.version + 1 };
    this.tables.set(tableId, updated);
    return updated;
  }

  async listConnectionsForTable(tableId: string): Promise<string[]> {
    return [...this.connections.entries()]
      .filter(([, row]) => row.tableId === tableId)
      .map(([connectionId]) => connectionId);
  }

  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }
}

function createHarness(options?: {
  randomTableId?: () => string;
  incrementTableVersion?: MatchStore['incrementTableVersion'];
}) {
  const store = new MemoryStore();
  const sent = new Map<string, OutboundMessage[]>();

  const handler = createRuntimeHandler({
    store: options?.incrementTableVersion
      ? {
          ...store,
          incrementTableVersion: options.incrementTableVersion,
        }
      : store,
    postToConnection: async (connectionId, message) => {
      const rows = sent.get(connectionId) ?? [];
      rows.push(message);
      sent.set(connectionId, rows);
    },
    now: () => '2026-09-25T12:00:00.000Z',
    randomTableId: options?.randomTableId ?? (() => 'table-uuid-1234'),
  });

  return { handler, store, sent };
}

describe('match runtime handler', () => {
  it('persists a connection row on $connect', async () => {
    const { handler, store } = createHarness();
    await handler(wsEvent('$connect', 'conn-a'), {});
    expect(store.hasConnection('conn-a')).toBe(true);
  });

  it('create_table persists a table, returns tableId, and binds the caller', async () => {
    const { handler, store, sent } = createHarness();
    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );

    const connection = await store.getConnection('conn-a');
    expect(connection?.tableId).toBe('table-uuid-1234');

    const table = await store.getTable('table-uuid-1234');
    expect(table).toMatchObject({
      tableId: 'table-uuid-1234',
      version: 1,
      status: 'open',
      createdAt: '2026-09-25T12:00:00.000Z',
    });

    expect(sent.get('conn-a')).toEqual([
      { type: 'table_created', tableId: 'table-uuid-1234' },
    ]);
  });

  it('uses an unguessable table id', async () => {
    const { handler } = createHarness({
      randomTableId: () => 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    });

    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );
    await handler(wsEvent('$connect', 'conn-b'), {});

    await expect(
      handler(
        wsEvent('$default', 'conn-b', JSON.stringify({
          action: 'join_table',
          tableId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        })),
        {},
      ),
    ).resolves.toEqual({ statusCode: 200 });
  });

  it('join_table binds, bumps version, and fans out a public snapshot', async () => {
    const { handler, store, sent } = createHarness();

    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );

    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    const table = await store.getTable('table-uuid-1234');
    expect(table?.version).toBe(2);

    const snapshot = buildPublicSnapshot(table!);
    expect(snapshot).toEqual({
      type: 'table_snapshot',
      tableId: 'table-uuid-1234',
      version: 2,
      status: 'open',
      createdAt: '2026-09-25T12:00:00.000Z',
    });
    expect(snapshot).not.toHaveProperty('hole');
    expect(snapshot).not.toHaveProperty('seatToken');

    expect(sent.get('conn-a')).toEqual([
      { type: 'table_created', tableId: 'table-uuid-1234' },
      snapshot,
    ]);
    expect(sent.get('conn-b')).toEqual([snapshot]);
  });

  it('does not fan out when the conditional version write fails', async () => {
    const store = new MemoryStore();
    const sent = new Map<string, OutboundMessage[]>();
    const increment = vi.fn(async () => null);

    const handler = createRuntimeHandler({
      store: {
        putConnection: store.putConnection.bind(store),
        deleteConnection: store.deleteConnection.bind(store),
        getConnection: store.getConnection.bind(store),
        createTable: store.createTable.bind(store),
        bindConnectionToTable: store.bindConnectionToTable.bind(store),
        getTable: store.getTable.bind(store),
        incrementTableVersion: increment,
        listConnectionsForTable: store.listConnectionsForTable.bind(store),
      },
      postToConnection: async (connectionId, message) => {
        const rows = sent.get(connectionId) ?? [];
        rows.push(message);
        sent.set(connectionId, rows);
      },
      now: () => '2026-09-25T12:00:00.000Z',
      randomTableId: () => 'table-uuid-1234',
    });

    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );
    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    expect(increment).toHaveBeenCalledOnce();
    expect(sent.get('conn-a')).toEqual([
      { type: 'table_created', tableId: 'table-uuid-1234' },
    ]);
    expect(sent.get('conn-b')).toEqual([{ type: 'error', code: 'version_conflict' }]);
  });

  it('removes only the disconnected connection row', async () => {
    const { handler, store } = createHarness();

    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );
    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    await handler(wsEvent('$disconnect', 'conn-b'), {});

    expect(store.hasConnection('conn-b')).toBe(false);
    expect(store.hasConnection('conn-a')).toBe(true);
    expect(await store.getTable('table-uuid-1234')).not.toBeNull();
  });

  it('rejects unsupported gameplay actions without writing table state', async () => {
    const { handler, store, sent } = createHarness();

    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );

    const before = await store.getTable('table-uuid-1234');

    for (const action of ['fold', 'check', 'call', 'bet', 'raise', 'deal', 'sit', 'unknown']) {
      await handler(
        wsEvent('$default', 'conn-a', JSON.stringify({ action })),
        {},
      );
    }

    expect(await store.getTable('table-uuid-1234')).toEqual(before);
    expect(sent.get('conn-a')?.slice(1)).toEqual(
      Array(8).fill({ type: 'error', code: 'unsupported_action' }),
    );
  });
});
