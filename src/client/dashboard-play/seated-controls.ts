import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';
import {
  renderActionControls,
  type ActionControlsViewModel,
  type ActionSubmitPayload,
} from '../surfaces/action-controls.js';

export type SeatAction =
  | { action: 'start_hand' }
  | { action: 'fold' | 'check' | 'call' }
  | { action: 'bet' | 'raise'; amount: number };

export function buildActionViewModel(
  snapshot: TableSnapshotMessage,
  local: PlayerSnapshotSeat,
): ActionControlsViewModel {
  const toCall = snapshot.toCall ?? 0;
  const currentBet = snapshot.currentBet ?? 0;
  const allInTo = local.stack + local.committed;
  const canWager = currentBet === 0 || toCall > 0;
  const minRaiseTo = canWager
    ? Math.min(snapshot.minRaiseTo ?? currentBet + 2, allInTo)
    : allInTo + 1;

  return {
    yourTurn: true,
    stack: local.stack,
    toCall,
    minRaiseTo,
    allInTo,
    pot: snapshot.pot,
  };
}

export function toSeatAction(
  payload: ActionSubmitPayload,
  snapshot: TableSnapshotMessage,
): SeatAction {
  if (payload.type === 'raise') {
    const amount = payload.amount ?? 0;
    return (snapshot.currentBet ?? 0) === 0
      ? { action: 'bet', amount }
      : { action: 'raise', amount };
  }
  return { action: payload.type };
}

function statusLine(text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'seated-status';
  line.dataset.field = 'seated-status';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  line.textContent = text;
  return line;
}

export interface SeatedControlsState {
  pending: boolean;
  notice: string | null;
}

export function renderSeatedControls(
  region: HTMLElement,
  snapshot: TableSnapshotMessage,
  local: PlayerSnapshotSeat,
  state: SeatedControlsState,
  send: (action: SeatAction) => void,
): void {
  const handInProgress = snapshot.status === 'hand_in_progress';
  const complete = snapshot.phase === 'complete';

  if (handInProgress && !complete && local.acting && snapshot.phase === 'betting') {
    renderActionControls(region, buildActionViewModel(snapshot, local), {
      onSubmit: (payload) => {
        if (state.pending) {
          return;
        }
        send(toSeatAction(payload, snapshot));
      },
    });
    if (state.notice) {
      region.append(statusLine(state.notice));
    }
    return;
  }

  renderActionControls(region, { yourTurn: false, stack: 0, toCall: 0, minRaiseTo: 0, allInTo: 0, pot: 0 }, {
    onSubmit: () => undefined,
  });

  if (!handInProgress) {
    const enough = snapshot.seats.length >= 2;
    const deal = document.createElement('button');
    deal.type = 'button';
    deal.className = 'seated-deal-button';
    deal.dataset.field = 'deal-hand';
    deal.textContent = 'Deal hand';
    deal.disabled = !enough || state.pending;
    deal.addEventListener('click', () => {
      if (!deal.disabled) {
        send({ action: 'start_hand' });
      }
    });
    region.append(
      deal,
      statusLine(state.notice ?? (enough ? 'Ready to deal.' : 'Waiting for another player to sit.')),
    );
    return;
  }

  if (complete) {
    const winners = snapshot.seats.filter((seat) => (seat.wonAmount ?? 0) > 0);
    const summary = winners.length
      ? `Hand complete · ${winners.map((seat) => `${seat.displayName} wins ${seat.wonAmount}`).join(' · ')}`
      : 'Hand complete';
    region.append(statusLine(summary));
    return;
  }

  const acting = snapshot.seats.find((seat) => seat.acting);
  region.append(
    statusLine(state.notice ?? (acting ? `Waiting for ${acting.displayName}` : 'Waiting…')),
  );
}
