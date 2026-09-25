import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { MatchStore } from './store.js';
import type { OutboundMessage, WebSocketEvent } from './types.js';

export interface FanoutDeps {
  store: MatchStore;
  postToConnection: (
    connectionId: string,
    message: OutboundMessage,
  ) => Promise<void>;
}

export function createPostToConnection(
  event: WebSocketEvent,
  region?: string,
): (connectionId: string, message: OutboundMessage) => Promise<void> {
  const { domainName, stage } = event.requestContext;
  const client = new ApiGatewayManagementApiClient({
    region,
    endpoint: `https://${domainName}/${stage}`,
  });

  return async (connectionId, message) => {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      }),
    );
  };
}

export async function fanOutTableSnapshot(
  deps: FanoutDeps,
  tableId: string,
  message: OutboundMessage,
): Promise<number> {
  const connectionIds = await deps.store.listConnectionsForTable(tableId);
  let delivered = 0;

  for (const connectionId of connectionIds) {
    try {
      await deps.postToConnection(connectionId, message);
      delivered += 1;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error.name === 'GoneException' || error.name === '410')
      ) {
        await deps.store.deleteConnection(connectionId);
        continue;
      }
      throw error;
    }
  }

  return delivered;
}
