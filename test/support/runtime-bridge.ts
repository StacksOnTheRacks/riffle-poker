import { createRuntimeHandler } from '../../src/runtime/handler.js';
import type { WebSocketEvent } from '../../src/runtime/types.js';
import { FakePlaySocket } from './fake-play-socket.js';
import { MemoryMatchStore } from './memory-store.js';

function wsEvent(routeKey: string, connectionId: string, body?: string): WebSocketEvent {
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

class BridgedSocket extends FakePlaySocket {
  constructor(
    url: string,
    private readonly bridge: RuntimeBridge,
    readonly connectionId: string,
  ) {
    super(url);
  }

  override send(data: string): void {
    super.send(data);
    this.bridge.dispatch(this.connectionId, data);
  }
}

export class RuntimeBridge {
  readonly store = new MemoryMatchStore();
  private sockets = new Map<string, BridgedSocket>();
  private queue: Promise<unknown> = Promise.resolve();
  private counter = 0;
  readonly handler;

  constructor(rngSeed = 42) {
    this.handler = createRuntimeHandler({
      store: this.store,
      postToConnection: async (connectionId, message) => {
        this.sockets.get(connectionId)?.receive(message);
      },
      now: () => '2026-09-25T12:00:00.000Z',
      rngSeed: () => rngSeed,
    });
  }

  createSocket = (url: string): BridgedSocket => {
    this.counter += 1;
    const connectionId = `conn-${this.counter}`;
    const socket = new BridgedSocket(url, this, connectionId);
    this.sockets.set(connectionId, socket);
    this.queue = this.queue.then(async () => {
      await this.handler(wsEvent('$connect', connectionId), {});
      socket.emit('open');
    });
    return socket;
  };

  dispatch(connectionId: string, data: string): void {
    this.queue = this.queue.then(() => this.handler(wsEvent('$default', connectionId, data), {}));
  }

  async settle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
      await Promise.resolve();
    } while (current !== this.queue);
  }
}
