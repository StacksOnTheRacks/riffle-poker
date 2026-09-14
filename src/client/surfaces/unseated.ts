export interface UnseatedContext {
  matchId: string;
}

const OPEN_SEAT_LABELS = ['Seat 1 · open', 'Seat 2 · open', 'Seat 3 · open'];

export function renderUnseated(root: HTMLElement, context: UnseatedContext): void {
  root.replaceChildren();
  root.dataset.surface = 'unseated';
  root.dataset.matchId = context.matchId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-unseated';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table, unseated');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const street = document.createElement('p');
  street.className = 'unseated-street';
  street.textContent = 'Between hands';

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area';
  boardArea.append(street);

  const seatList = document.createElement('div');
  seatList.className = 'unseated-seat-list';
  seatList.setAttribute('role', 'group');
  seatList.setAttribute('aria-label', 'Open seats');

  for (const label of OPEN_SEAT_LABELS) {
    const seat = document.createElement('p');
    seat.className = 'unseated-seat-label';
    seat.textContent = label;
    seatList.append(seat);
  }

  const pot = document.createElement('p');
  pot.className = 'unseated-pot';
  pot.textContent = 'Pot — · Blinds — / —';

  const footer = document.createElement('footer');
  footer.className = 'unseated-footer';

  const heading = document.createElement('h1');
  heading.className = 'surface-title unseated-heading';
  heading.textContent = 'Pick a seat';

  const sitButton = document.createElement('button');
  sitButton.type = 'button';
  sitButton.className = 'action-button unseated-sit-button';
  sitButton.textContent = 'Sit at Table';
  sitButton.addEventListener('click', () => {
    // Locator-only attach (#38). Seat bind is #39.
  });

  footer.append(heading, sitButton);
  shell.append(felt, boardArea, seatList, pot, footer);
  root.append(shell);
}
