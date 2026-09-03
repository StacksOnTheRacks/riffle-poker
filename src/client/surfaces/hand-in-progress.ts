import { renderHoleCardsArea, renderOpponentSeatLabels } from './hole-cards.js';

export type HoleCard = `${string}`;

export interface HandInProgressContext {
  matchId: string;
  seatId: string;
  hole: [HoleCard, HoleCard];
  opponents?: Array<{ seatId: string; label: string; stack: string }>;
}

export function renderHandInProgress(
  root: HTMLElement,
  context: HandInProgressContext,
): void {
  root.replaceChildren();
  root.dataset.surface = 'hand-in-progress';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-hand-in-progress';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table hand in progress');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  playerSeat.append(seatLabel);
  renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt', announceDeal: true });

  if (context.opponents?.length) {
    renderOpponentSeatLabels(felt, context.opponents);
  }

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Hand in progress';

  const match = document.createElement('p');
  match.className = 'table-match-id';
  match.textContent = `Match ${context.matchId}`;

  header.append(title, match);
  shell.append(felt, playerSeat, header);
  root.append(shell);
}
