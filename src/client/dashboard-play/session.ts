import type { OutboundMessage, TableSnapshotMessage } from '../../runtime/types.js';
import { renderLoading } from '../surfaces/loading.js';
import { loadPlayConfig } from './config.js';
import { parseTableIdFromPath } from './route.js';
import { renderTableNotFound } from './table-not-found.js';
import { renderSnapshotShell } from './view.js';

export interface PlaySocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface DashboardPlayDeps {
  root: HTMLElement;
  pathname: string;
  fetch: typeof fetch;
  createSocket: (url: string) => PlaySocket;
}

export interface DashboardPlaySession {
  readonly tableId: string | null;
  readonly phase: 'not_found' | 'loading' | 'joined' | 'closed';
  readonly snapshot: TableSnapshotMessage | null;
}

function parseServerMessage(data: unknown): OutboundMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
      return parsed as OutboundMessage;
    }
  } catch {
    return null;
  }
  return null;
}

export async function startDashboardPlay(deps: DashboardPlayDeps): Promise<DashboardPlaySession> {
  const { root } = deps;
  const tableId = parseTableIdFromPath(deps.pathname);
  const session = {
    tableId,
    phase: 'loading' as DashboardPlaySession['phase'],
    snapshot: null as TableSnapshotMessage | null,
  };

  const failClosed = (socket?: PlaySocket): void => {
    if (session.phase === 'not_found' || session.phase === 'closed') {
      return;
    }
    session.phase = session.phase === 'joined' ? 'closed' : 'not_found';
    session.snapshot = null;
    renderTableNotFound(root);
    socket?.close();
  };

  if (!tableId) {
    session.phase = 'not_found';
    renderTableNotFound(root);
    return session;
  }

  renderLoading(root, { copy: 'shared' });

  const config = await loadPlayConfig(deps.fetch);
  if (!config) {
    failClosed();
    return session;
  }

  let socket: PlaySocket;
  try {
    socket = deps.createSocket(config.webSocketUrl);
  } catch {
    failClosed();
    return session;
  }

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ action: 'join_table', tableId }));
  });
  socket.addEventListener('error', () => failClosed(socket));
  socket.addEventListener('close', () => failClosed(socket));
  socket.addEventListener('message', (event) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }

    if (message.type === 'error') {
      if (session.phase === 'loading' || message.code === 'table_not_found') {
        failClosed(socket);
      }
      return;
    }

    if (message.type === 'table_snapshot' && message.tableId === tableId) {
      if (session.phase !== 'loading' && session.phase !== 'joined') {
        return;
      }
      session.phase = 'joined';
      session.snapshot = message;
      renderSnapshotShell(root, message);
    }
  });

  return session;
}
