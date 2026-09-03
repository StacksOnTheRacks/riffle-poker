export type EmbedErrorReason =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'already_used'
  | 'invalid_session'
  | 'attach_failed';

const REASON_COPY: Record<EmbedErrorReason, string> = {
  missing_token: 'No bootstrap token was provided.',
  invalid_token: 'This join link is not valid.',
  expired_token: 'This join link has expired. Ask your host for a new link.',
  already_used: 'This join link was already used.',
  invalid_session: 'Your session is no longer valid. Ask your host for a new link.',
  attach_failed: 'We could not attach you to the table.',
};

export function renderEmbedError(root: HTMLElement, reason: EmbedErrorReason): void {
  root.replaceChildren();
  root.dataset.surface = 'embed-error';

  const panel = document.createElement('section');
  panel.className = 'surface surface-embed-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-live', 'assertive');
  panel.setAttribute('aria-label', 'Unable to join table');

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Unable to join';

  const message = document.createElement('p');
  message.className = 'surface-message';
  message.textContent = REASON_COPY[reason] ?? REASON_COPY.attach_failed;

  const hint = document.createElement('p');
  hint.className = 'surface-hint';
  hint.textContent = 'Close this frame and request a fresh link from your host.';

  panel.append(title, message, hint);
  root.append(panel);
}
