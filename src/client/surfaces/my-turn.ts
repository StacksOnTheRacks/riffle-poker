import { renderHoleCardsArea, renderOpponentSeatLabels } from './hole-cards.js';

export type HoleCard = `${string}`;

export interface MyTurnContext {
  matchId: string;
  seatId: string;
  hole: [HoleCard, HoleCard];
  opponents?: Array<{ seatId: string; label: string; stack: string }>;
}

export function renderMyTurn(root: HTMLElement, context: MyTurnContext): void {
  root.replaceChildren();
  root.dataset.surface = 'my-turn';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-my-turn';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table your turn');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  playerSeat.append(seatLabel);
  renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt' });

  if (context.opponents?.length) {
    renderOpponentSeatLabels(felt, context.opponents);
  }

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Your turn';

  const match = document.createElement('p');
  match.className = 'table-match-id';
  match.textContent = `Match ${context.matchId}`;

  header.append(title, match);
  shell.append(felt, playerSeat, header);
  root.append(shell);
}
