import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { fanOutTableSnapshot, createPostToConnection } from './fanout.js';
import { isUnsupportedGameplayAction, parseClientMessage } from './messages.js';
import { buildPublicSnapshot } from './snapshot.js';
import { createMatchStore, type MatchStore } from './store.js';
import type {
  ErrorMessage,
  LambdaContext,
  OutboundMessage,
  RuntimeEnv,
  WebSocketEvent,
} from './types.js';

export interface RuntimeDeps {
  store: MatchStore;
  postToConnection: (
    connectionId: string,
    message: OutboundMessage,
  ) => Promise<void>;
  now: () => string;
  randomTableId: () => string;
}

function errorMessage(code: string): ErrorMessage {
  return { type: 'error', code };
}

export function createRuntimeHandler(deps: RuntimeDeps) {
  return async function handler(
    event: WebSocketEvent,
    _context: LambdaContext,
  ): Promise<{ statusCode: number; body?: string }> {
    const { routeKey, connectionId } = event.requestContext;

    if (routeKey === '$connect') {
      await deps.store.putConnection(connectionId);
      return { statusCode: 200 };
    }

    if (routeKey === '$disconnect') {
      await deps.store.deleteConnection(connectionId);
      return { statusCode: 200 };
    }

    const message = parseClientMessage(event.body);
    if (!message) {
      await deps.postToConnection(
        connectionId,
        errorMessage('unsupported_action'),
      );
      return { statusCode: 200 };
    }

    if (message.action === 'create_table') {
      const tableId = deps.randomTableId();
      const createdAt = deps.now();
      const table = await deps.store.createTable(tableId, createdAt);
      await deps.store.bindConnectionToTable(connectionId, table.tableId);
      await deps.postToConnection(connectionId, {
        type: 'table_created',
        tableId: table.tableId,
      });
      return { statusCode: 200 };
    }

    if (message.action === 'join_table') {
      if (!message.tableId) {
        await deps.postToConnection(
          connectionId,
          errorMessage('unsupported_action'),
        );
        return { statusCode: 200 };
      }

      const existing = await deps.store.getTable(message.tableId);
      if (!existing) {
        await deps.postToConnection(connectionId, errorMessage('table_not_found'));
        return { statusCode: 200 };
      }

      await deps.store.bindConnectionToTable(connectionId, message.tableId);
      const updated = await deps.store.incrementTableVersion(
        message.tableId,
        existing.version,
      );

      if (!updated) {
        await deps.postToConnection(
          connectionId,
          errorMessage('version_conflict'),
        );
        return { statusCode: 200 };
      }

      const snapshot = buildPublicSnapshot(updated);
      await fanOutTableSnapshot(
        {
          store: deps.store,
          postToConnection: deps.postToConnection,
        },
        message.tableId,
        snapshot,
      );
      return { statusCode: 200 };
    }

    if (isUnsupportedGameplayAction(message.action)) {
      await deps.postToConnection(
        connectionId,
        errorMessage('unsupported_action'),
      );
      return { statusCode: 200 };
    }

    await deps.postToConnection(connectionId, errorMessage('unsupported_action'));
    return { statusCode: 200 };
  };
}

function readEnv(): RuntimeEnv {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME is required');
  }

  return {
    tableName,
    awsRegion: process.env.AWS_REGION,
  };
}

let cachedStore: MatchStore | undefined;
let cachedEnv: RuntimeEnv | undefined;

export async function handler(
  event: WebSocketEvent,
  context: LambdaContext,
): Promise<{ statusCode: number; body?: string }> {
  if (!cachedStore || !cachedEnv) {
    cachedEnv = readEnv();
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    cachedStore = createMatchStore(client, cachedEnv);
  }

  const runtimeHandler = createRuntimeHandler({
    store: cachedStore,
    postToConnection: createPostToConnection(event, cachedEnv.awsRegion),
    now: () => new Date().toISOString(),
    randomTableId: () => randomUUID(),
  });

  return runtimeHandler(event, context);
}
