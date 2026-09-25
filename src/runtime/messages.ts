import type { ClientMessage } from './types.js';

const UNSUPPORTED_GAMEPLAY_ACTIONS = new Set([
  'fold',
  'check',
  'call',
  'bet',
  'raise',
  'deal',
  'sit',
]);

export function parseClientMessage(body: string | null | undefined): ClientMessage | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as ClientMessage).action !== 'string'
    ) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

export function isUnsupportedGameplayAction(action: string): boolean {
  return UNSUPPORTED_GAMEPLAY_ACTIONS.has(action);
}
