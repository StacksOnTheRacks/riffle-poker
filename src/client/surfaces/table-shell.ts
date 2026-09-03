export interface TableShellContext {
  matchId: string;
}

export function renderTableShell(root: HTMLElement, context: TableShellContext): void {
  root.replaceChildren();
  root.dataset.surface = 'table-shell';
  root.dataset.matchId = context.matchId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-table-shell';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table waiting for deal');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  const holeArea = document.createElement('div');
  holeArea.className = 'hole-area';
  holeArea.setAttribute('role', 'group');
  holeArea.setAttribute('aria-label', 'Your hole cards, seat-private, empty');

  const holeCards = document.createElement('div');
  holeCards.className = 'hole-cards hole-cards-empty';
  holeCards.setAttribute('aria-hidden', 'true');

  holeArea.append(holeCards);
  playerSeat.append(seatLabel, holeArea);

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Waiting for deal';

  const match = document.createElement('p');
  match.className = 'table-match-id';
  match.textContent = `Match ${context.matchId}`;

  const status = document.createElement('p');
  status.className = 'table-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'The host will start the hand soon.';

  header.append(title, match, status);
  shell.append(felt, playerSeat, header);
  root.append(shell);
}
