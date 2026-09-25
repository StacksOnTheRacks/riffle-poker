import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatchStore } from '../../src/runtime/store.js';

type Send = ReturnType<typeof vi.fn>;

function createMockClient() {
  const send = vi.fn<Send>();
  return {
    send,
    client: { send } as unknown as Parameters<typeof createMatchStore>[0],
  };
}

describe('match store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a connection row on connect', async () => {
    const { client, send } = createMockClient();
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    await store.putConnection('conn-1');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'MatchTable',
          Item: expect.objectContaining({
            PK: 'CONN#conn-1',
            SK: 'META',
            connectionId: 'conn-1',
          }),
        }),
      }),
    );
  });

  it('deletes only the connection row on disconnect', async () => {
    const { client, send } = createMockClient();
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    await store.deleteConnection('conn-1');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'MatchTable',
          Key: {
            PK: 'CONN#conn-1',
            SK: 'META',
          },
        }),
      }),
    );
  });

  it('returns null when a conditional version write fails', async () => {
    const { client, send } = createMockClient();
    send.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });
    const store = createMatchStore(client, { tableName: 'MatchTable' });

    const result = await store.incrementTableVersion('table-1', 1);
    expect(result).toBeNull();
  });
});
