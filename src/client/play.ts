import './styles.css';
import { acceptSeatCapabilityPostMessage } from './seat-capability.js';
import { renderEmbedError, type EmbedErrorReason } from './surfaces/embed-error.js';
import { renderLoading } from './surfaces/loading.js';
import { renderTableShell } from './surfaces/table-shell.js';

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

export async function bootstrapPlay(root: HTMLElement): Promise<void> {
  rejectPostMessageBootstrap();
  acceptSeatCapabilityPostMessage();
  renderLoading(root);

  const token = parseBootstrapTokenFromHash(window.location.hash);

  if (token) {
    const result = await redeemBootstrapToken(token);
    stripBootstrapHash();

    if (!result.ok) {
      renderEmbedError(root, result.reason);
      return;
    }

    renderTableShell(root, { matchId: result.session.matchId });
    return;
  }

  const sessionResult = await fetchExistingSession();
  if (sessionResult.ok) {
    renderTableShell(root, { matchId: sessionResult.session.matchId });
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
