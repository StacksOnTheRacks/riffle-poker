import type { OutboundMessage, TableSnapshotMessage } from '../../runtime/types.js';
import { renderMyHandPanel } from '../dashboard/my-hand-panel.js';
import { renderLoading } from '../surfaces/loading.js';
import { loadPlayConfig } from './config.js';
import { parseTableIdFromPath } from './route.js';
import { renderSeatedControls, type SeatAction, type SeatedControlsState } from './seated-controls.js';
import { createSitDraft, renderSitPanel, type SitDraft } from './sit-panel.js';
import { renderTableNotFound } from './table-not-found.js';
import { parseCard, renderSnapshotShell } from './view.js';

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
  readonly seatId: string | null;
  hasSeatToken(): boolean;
}

const SIT_ERROR_NOTICES: Record<string, string> = {
  seat_occupied: 'That seat was just taken. Pick another seat.',
  table_full: 'The table is full.',
  hand_in_progress: 'A hand is in progress. Try again between hands.',
};

const ACTION_ERROR_NOTICES: Record<string, string> = {
  insufficient_players: 'Waiting for another player to sit.',
  hand_in_progress: 'A hand is already in progress.',
  off_turn: "It isn't your turn.",
  illegal_action: "That action isn't allowed right now.",
  version_conflict: 'The table changed. Try again.',
};

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
  let seatToken: string | null = null;
  const sitDraft: SitDraft = createSitDraft();
  const seated: SeatedControlsState = { pending: false, notice: null };
  let socket: PlaySocket | null = null;

  const session = {
    tableId,
    phase: 'loading' as DashboardPlaySession['phase'],
    snapshot: null as TableSnapshotMessage | null,
    seatId: null as string | null,
    hasSeatToken: () => seatToken !== null,
  };

  const failClosed = (): void => {
    if (session.phase === 'not_found' || session.phase === 'closed') {
      return;
    }
    session.phase = session.phase === 'joined' ? 'closed' : 'not_found';
    session.snapshot = null;
    seatToken = null;
    renderTableNotFound(root);
    socket?.close();
  };

  const sendSeatAction = (action: SeatAction): void => {
    if (!socket || !seatToken) {
      return;
    }
    seated.pending = true;
    seated.notice = null;
    socket.send(JSON.stringify({ ...action, seatToken }));
    render();
  };

  const render = (): void => {
    const snapshot = session.snapshot;
    if (!snapshot || session.phase !== 'joined') {
      return;
    }
    const regions = renderSnapshotShell(root, snapshot);
    const local = snapshot.seats.find((seat) => seat.isLocal);

    if (!local || !seatToken) {
      regions.myHand.replaceChildren();
      renderSitPanel(regions.actions, snapshot.seats, sitDraft, {
        onChange: render,
        onSit: (seatId, displayName) => {
          socket?.send(JSON.stringify({ action: 'sit', seatId, displayName }));
          render();
        },
      });
      return;
    }

    renderMyHandPanel(regions.myHand, {
      pocketCards: snapshot.pocketCards?.map(parseCard),
      bank: local.stack,
      committedThisHand: snapshot.status === 'hand_in_progress' ? local.committed : undefined,
      street: snapshot.street ?? undefined,
    });
    renderSeatedControls(regions.actions, snapshot, local, seated, sendSeatAction);
  };

  const handleError = (code: string): void => {
    if (session.phase === 'loading' || code === 'table_not_found') {
      failClosed();
      return;
    }

    if (sitDraft.submitting) {
      sitDraft.submitting = false;
      if (code === 'invalid_display_name' || code === 'empty_display_name') {
        sitDraft.nameError = true;
      } else {
        sitDraft.notice = SIT_ERROR_NOTICES[code] ?? "Couldn't take a seat.";
      }
      render();
      return;
    }

    if (seatToken) {
      seated.pending = false;
      seated.notice = ACTION_ERROR_NOTICES[code] ?? "That didn't go through. Try again.";
      render();
    }
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

  try {
    socket = deps.createSocket(config.webSocketUrl);
  } catch {
    failClosed();
    return session;
  }

  const openSocket = socket;
  openSocket.addEventListener('open', () => {
    openSocket.send(JSON.stringify({ action: 'join_table', tableId }));
  });
  openSocket.addEventListener('error', failClosed);
  openSocket.addEventListener('close', failClosed);
  openSocket.addEventListener('message', (event) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }

    if (message.type === 'error') {
      handleError(message.code);
      return;
    }

    if (message.type === 'sat') {
      if (!sitDraft.submitting) {
        return;
      }
      seatToken = message.seatToken;
      session.seatId = message.seatId;
      return;
    }

    if (message.type === 'table_snapshot' && message.tableId === tableId) {
      if (session.phase !== 'loading' && session.phase !== 'joined') {
        return;
      }
      session.phase = 'joined';
      session.snapshot = message;
      if (seatToken && message.seats.some((seat) => seat.isLocal)) {
        sitDraft.submitting = false;
      }
      seated.pending = false;
      seated.notice = null;
      render();
    }
  });

  return session;
}
