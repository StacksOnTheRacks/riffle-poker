// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapPlay,
  parseBootstrapTokenFromHash,
  rejectPostMessageBootstrap,
  stripBootstrapHash,
} from '../src/client/play.js';
import { renderEmbedError } from '../src/client/surfaces/embed-error.js';
import { renderTableShell } from '../src/client/surfaces/table-shell.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

describe('client bootstrap play flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    window.history.replaceState(null, '', '/play');
  });

  it('parses bootstrap token from hash fragment', () => {
    const token = 'abc123-token';
    expect(parseBootstrapTokenFromHash(`#bt=${encodeURIComponent(token)}`)).toBe(token);
    expect(parseBootstrapTokenFromHash('#other=1')).toBeUndefined();
    expect(parseBootstrapTokenFromHash('')).toBeUndefined();
  });

  it('strips bootstrap hash via replaceState', () => {
    window.location.hash = '#bt=secret';
    stripBootstrapHash();
    expect(window.location.pathname).toBe('/play');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
  });

  it('redeem success renders table shell context', async () => {
    const root = document.getElementById('app')!;
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/bootstrap/redeem') && init?.method === 'POST') {
        return new Response(JSON.stringify({ matchId: TEST_MATCH_ID, bound: true }), {
          status: 200,
          headers: { 'Set-Cookie': 'riffle_play=sess' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    window.location.hash = '#bt=fresh-token';
    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('table-shell');
    expect(root.dataset.matchId).toBe(TEST_MATCH_ID);
    expect(root.querySelector('.surface-table-shell')).not.toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('redeem failure renders embed-error surface', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'expired_token' }, { status: 403 }),
      ),
    );

    window.location.hash = '#bt=expired';
    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('embed-error');
    expect(root.querySelector('.surface-embed-error')).not.toBeNull();
  });

  it('tokenless URL loads session on reload', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        if (String(input).endsWith('/v1/bootstrap/session')) {
          return Response.json({ matchId: TEST_MATCH_ID, bound: true });
        }
        throw new Error('unexpected fetch');
      }),
    );

    await bootstrapPlay(root);

    expect(root.dataset.surface).toBe('table-shell');
    expect(root.dataset.matchId).toBe(TEST_MATCH_ID);
  });

  it('tokenless URL without session shows missing_token embed-error', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        if (String(input).endsWith('/v1/bootstrap/session')) {
          return Response.json({ error: 'invalid_session' }, { status: 403 });
        }
        throw new Error('unexpected fetch');
      }),
    );

    await bootstrapPlay(root);
    expect(root.dataset.surface).toBe('embed-error');
  });

  it('postMessage bootstrap does not attach session', async () => {
    rejectPostMessageBootstrap();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { bootstrapToken: 'via-post-message' },
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('table shell includes waiting-for-deal chrome and a11y labels', () => {
    const root = document.getElementById('app')!;
    renderTableShell(root, { matchId: TEST_MATCH_ID });

    const shell = root.querySelector('.surface-table-shell');
    expect(shell?.getAttribute('aria-label')).toBe('Poker table waiting for deal');
    expect(root.querySelector('.table-felt')).not.toBeNull();
    expect(root.textContent).toContain('Waiting for deal');
  });

  it('embed-error uses alert semantics', () => {
    const root = document.getElementById('app')!;
    renderEmbedError(root, 'already_used');

    const panel = root.querySelector('.surface-embed-error');
    expect(panel?.getAttribute('role')).toBe('alert');
  });
});
