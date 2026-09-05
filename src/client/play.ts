import './styles.css';
import type { LegalActionOption } from './actions-bar.js';
import { acceptSeatCapabilityPostMessage, seatScopedFetch } from './seat-capability.js';
import { renderHandComplete, renderShowdown } from './hand-complete.js';
import { renderEmbedError, type EmbedErrorReason } from './surfaces/embed-error.js';
import { renderHandInProgress } from './surfaces/hand-in-progress.js';
import { renderLoading } from './surfaces/loading.js';
import { renderMyTurn } from './surfaces/my-turn.js';
import { renderTableShell } from './surfaces/table-shell.js';
import { isTableRefreshMessage, postTableChangedToParent } from './table-refresh.js';

const BOOTSTRAP_HASH_PREFIX = '#bt=';

export function parseBootstrapTokenFromHash(hash: string): string | undefined {
  if (!hash.startsWith(BOOTSTRAP_HASH_PREFIX)) {
    return undefined;
  }
  const raw = hash.slice(BOOTSTRAP_HASH_PREFIX.length);
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export function stripBootstrapHash(): void {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search);
}

export interface SessionResponse {
  matchId: string;
  bound: true;
}

export interface RedeemErrorBody {
  error: EmbedErrorReason;
  message?: string;
}

export async function redeemBootstrapToken(token: string): Promise<
  | { ok: true; session: SessionResponse }
  | { ok: false; reason: EmbedErrorReason }
> {
  const response = await fetch('/v1/bootstrap/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    let reason: EmbedErrorReason = 'attach_failed';
    try {
      const body = (await response.json()) as RedeemErrorBody;
      if (body.error) {
        reason = body.error;
      }
    } catch {
      // keep attach_failed
    }
    return { ok: false, reason };
  }

  const session = (await response.json()) as SessionResponse;
  return { ok: true, session };
}

export async function fetchExistingSession(): Promise<
  | { ok: true; session: SessionResponse }
  | { ok: false; reason: EmbedErrorReason }
> {
  const response = await fetch('/v1/bootstrap/session', {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    return { ok: false, reason: 'invalid_session' };
  }

  const session = (await response.json()) as SessionResponse;
  return { ok: true, session };
}

export function rejectPostMessageBootstrap(): void {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      data &&
      typeof data === 'object' &&
      ('token' in data || 'bootstrapToken' in data || 'bt' in data)
    ) {
      // Deliberately ignore postMessage bootstrap attempts.
      event.stopImmediatePropagation();
    }
  });
}

type PublicTableSeat = { seatId: string; stack?: number };

type SeatTableResponse = {
  matchId: string;
  seatId: string;
  hole: [string, string] | null;
  currentSeat: string | null;
  pot?: number;
  board?: string[];
  seats: PublicTableSeat[];
  legalActions?: LegalActionOption[];
  completeReason?: 'fold_to_one' | 'showdown';
  winners?: Array<{ seatId: string; amount: number }>;
  shownHoles?: Array<{ seatId: string; hole: [string, string] }>;
};

let boundPlayRoot: HTMLElement | undefined;
let boundMatchId = '';
let tableRefreshListenerBound = false;

export function resetPlayBindings(): void {
  boundPlayRoot = undefined;
  boundMatchId = '';
}

function acceptTableRefreshPostMessage(): void {
  if (tableRefreshListenerBound) {
    return;
  }
  tableRefreshListenerBound = true;
  window.addEventListener('message', (event) => {
    if (!event.origin || event.origin !== window.location.origin) {
      return;
    }
    if (!isTableRefreshMessage(event.data)) {
      return;
    }
    if (!boundPlayRoot || !boundMatchId) {
      return;
    }
    void refreshPlayTable(boundPlayRoot, boundMatchId);
  });
}

function bindWaitingTable(root: HTMLElement, matchId: string): void {
  boundPlayRoot = root;
  boundMatchId = matchId;
  renderTableShell(root, { matchId });
}

async function loadSeatTable(matchId: string): Promise<SeatTableResponse | undefined> {
  const publicResponse = await fetch(`/v1/table?matchId=${encodeURIComponent(matchId)}`, {
    credentials: 'same-origin',
  });
  if (!publicResponse.ok) {
    return undefined;
  }

  const publicTable = (await publicResponse.json()) as { seats?: PublicTableSeat[] };
  for (const seat of publicTable.seats ?? []) {
    const seatResponse = await seatScopedFetch(
      `/v1/seats/${encodeURIComponent(seat.seatId)}/table?matchId=${encodeURIComponent(matchId)}`,
    );
    if (!seatResponse.ok) {
      continue;
    }
    return (await seatResponse.json()) as SeatTableResponse;
  }

  return undefined;
}

function facingBetFromActions(legalActions: LegalActionOption[] | undefined): boolean {
  return Boolean(legalActions?.some((action) => action.type === 'call' || action.type === 'raise'));
}

function sharedTableChrome(table: SeatTableResponse) {
  const opponents = table.seats
    .filter((seat) => seat.seatId !== table.seatId)
    .map((seat, index) => ({
      seatId: seat.seatId,
      label: `Seat ${index + 2}`,
      stack: seat.stack !== undefined ? String(seat.stack) : '',
    }));

  const stacks = table.seats
    .filter((seat) => seat.stack !== undefined)
    .map((seat) => ({ seatId: seat.seatId, stack: seat.stack as number }));

  return { opponents, stacks };
}

export async function submitPlayAction(
  root: HTMLElement,
  table: Pick<SeatTableResponse, 'matchId' | 'seatId'>,
  action: { type: string; amount?: number },
): Promise<void> {
  const response = await seatScopedFetch(
    `/v1/seats/${encodeURIComponent(table.seatId)}/actions`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: table.matchId, action }),
    },
  );
  if (!response.ok) {
    return;
  }

  await refreshPlayTable(root, table.matchId);
  postTableChangedToParent();
}

export async function refreshPlayTable(root: HTMLElement, matchId: string): Promise<void> {
  try {
    const table = await loadSeatTable(matchId);
    if (!table?.hole) {
      return;
    }

    const { opponents, stacks } = sharedTableChrome(table);

    if (table.completeReason === 'showdown') {
      renderShowdown(root, {
        matchId: table.matchId,
        seatId: table.seatId,
        hole: table.hole,
        board: table.board,
        pot: table.pot,
        winners: table.winners,
        shownHoles: table.shownHoles,
      });
      return;
    }

    if (table.completeReason === 'fold_to_one') {
      renderHandComplete(root, {
        matchId: table.matchId,
        seatId: table.seatId,
        hole: table.hole,
        board: table.board,
        winners: table.winners,
        shownHoles: table.shownHoles,
        completeReason: table.completeReason,
      });
      return;
    }

    const myTurn =
      table.currentSeat === table.seatId &&
      Array.isArray(table.legalActions) &&
      table.legalActions.length > 0;

    if (myTurn) {
      renderMyTurn(root, {
        matchId: table.matchId,
        seatId: table.seatId,
        hole: table.hole,
        board: table.board,
        opponents,
        pot: table.pot,
        stacks,
        legalActions: table.legalActions,
        facingBet: facingBetFromActions(table.legalActions),
        onSubmitAction: (action) => submitPlayAction(root, table, action),
      });
      return;
    }

    renderHandInProgress(root, {
      matchId: table.matchId,
      seatId: table.seatId,
      hole: table.hole,
      board: table.board,
      opponents,
      pot: table.pot,
      stacks,
      showDisabledActionsBar: true,
      facingBet: table.currentSeat !== null && table.currentSeat !== table.seatId,
    });
  } catch {
    // Stay on the waiting-for-deal shell if the table cannot be read yet.
  }
}

export async function bootstrapPlay(root: HTMLElement): Promise<void> {
  rejectPostMessageBootstrap();
  acceptSeatCapabilityPostMessage();
  acceptTableRefreshPostMessage();
  renderLoading(root);

  const token = parseBootstrapTokenFromHash(window.location.hash);

  if (token) {
    const result = await redeemBootstrapToken(token);
    stripBootstrapHash();

    if (!result.ok) {
      renderEmbedError(root, result.reason);
      return;
    }

    bindWaitingTable(root, result.session.matchId);
    return;
  }

  const sessionResult = await fetchExistingSession();
  if (sessionResult.ok) {
    bindWaitingTable(root, sessionResult.session.matchId);
    return;
  }

  renderEmbedError(root, 'missing_token');
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    void bootstrapPlay(root);
  }
}
