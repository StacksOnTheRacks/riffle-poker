export type PlayerRowPosition = 'D' | 'SB' | 'BB';

export interface PlayerRowSeat {
  seatId: string;
  displayName: string;
  isLocal: boolean;
  avatarUrl?: string;
  stack: number;
  inHand: boolean;
  allIn?: boolean;
  lastAction: string | null;
  committed: number;
  position: PlayerRowPosition | null;
  acting: boolean;
  turnRemainingMs: number | null;
  turnBudgetMs: number | null;
  wonAmount?: number;
  holeCards?: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>;
  phase?: 'betting' | 'complete';
}

export type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const POSITION_LABELS: Record<PlayerRowPosition, string> = {
  D: 'Dealer',
  SB: 'Small blind',
  BB: 'Big blind',
};

export function formatPlayChips(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export function formatTimerText(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function deriveInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    const word = words[0] ?? '';
    return word.length >= 2
      ? word.slice(0, 2).toUpperCase()
      : word.slice(0, 1).toUpperCase();
  }
  const first = words[0]?.[0] ?? '';
  const second = words[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function createTextField(
  field:
    | 'name'
    | 'stack'
    | 'last-action'
    | 'committed'
    | 'position'
    | 'timer'
    | 'initials'
    | 'fold'
    | 'all-in'
    | 'won',
  text: string,
): HTMLElement {
  const element = document.createElement('span');
  element.dataset.field = field;
  element.textContent = text;
  return element;
}

function createStackField(
  breakpoint: DashboardBreakpoint,
  stack: number,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.field = 'stack';

  if (breakpoint !== 'phone') {
    const label = document.createElement('span');
    label.className = 'player-row-stack-label';
    label.textContent = 'Stack';
    wrapper.append(label);
  }

  const amount = document.createElement('span');
  amount.className = 'player-row-stack-amount';
  amount.textContent = formatPlayChips(stack);
  wrapper.append(amount);
  return wrapper;
}

function createAvatarField(avatarUrl: string): HTMLElement {
  const avatar = document.createElement('img');
  avatar.dataset.field = 'avatar';
  avatar.className = 'player-row-avatar';
  avatar.src = avatarUrl;
  avatar.alt = '';
  return avatar;
}

function isHoleFaceCard(
  card: unknown,
): card is { rank: string; suit: 'h' | 'd' | 'c' | 's' } {
  return (
    typeof card === 'object' &&
    card !== null &&
    'rank' in card &&
    'suit' in card &&
    typeof (card as { rank: unknown }).rank === 'string' &&
    typeof (card as { suit: unknown }).suit === 'string'
  );
}

function createCardFaces(
  cards: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>,
): HTMLElement {
  const cardsEl = document.createElement('div');
  cardsEl.dataset.field = 'cards';
  cardsEl.dataset.cards = 'faces';
  cardsEl.className = 'player-row-card-faces';

  for (const card of cards) {
    const face = document.createElement('span');
    face.className = 'player-row-card-face';
    face.textContent = `${card.rank.toUpperCase()}${card.suit === 'h' ? '♥' : card.suit === 'd' ? '♦' : card.suit === 'c' ? '♣' : '♠'}`;
    face.setAttribute('aria-hidden', 'true');
    cardsEl.append(face);
  }

  return cardsEl;
}

function createCardBacks(): HTMLElement {
  const cards = document.createElement('div');
  cards.dataset.field = 'cards';
  cards.dataset.cards = 'backs';
  cards.className = 'player-row-card-backs';

  for (let index = 0; index < 2; index += 1) {
    const back = document.createElement('span');
    back.className = 'player-row-card-back';
    back.setAttribute('aria-hidden', 'true');
    cards.append(back);
  }

  return cards;
}

function createTimer(
  seat: PlayerRowSeat,
): { timerText: HTMLElement; timerBar: HTMLElement } | null {
  if (!seat.acting || seat.turnRemainingMs === null) {
    return null;
  }

  const timerText = createTextField('timer', formatTimerText(seat.turnRemainingMs));
  timerText.className = 'player-row-timer-text';

  const timerBar = document.createElement('div');
  timerBar.className = 'player-row-timer-bar';
  timerBar.dataset.field = 'timer-bar';

  if (
    seat.turnBudgetMs !== null &&
    seat.turnBudgetMs > 0 &&
    seat.turnRemainingMs !== null
  ) {
    const fraction = Math.max(
      0,
      Math.min(1, seat.turnRemainingMs / seat.turnBudgetMs),
    );
    timerBar.style.width = `${(fraction * 100).toFixed(2)}%`;
  }

  return { timerText, timerBar };
}

function createSeatTile(
  seat: PlayerRowSeat,
  breakpoint: DashboardBreakpoint,
): HTMLElement {
  const tile = document.createElement('article');
  tile.className = 'player-row-tile';
  tile.dataset.seat = seat.seatId;

  if (seat.isLocal) {
    tile.dataset.local = 'true';
  }

  if (seat.acting) {
    tile.dataset.acting = 'true';
  }

  tile.dataset.state = seat.inHand ? (seat.allIn ? 'all-in' : 'in-hand') : 'folded';

  if (seat.avatarUrl) {
    tile.append(createAvatarField(seat.avatarUrl));
  } else {
    tile.append(createTextField('initials', deriveInitials(seat.displayName)));
  }

  const nameText = seat.isLocal ? 'You' : seat.displayName;
  tile.append(createTextField('name', nameText));

  tile.append(createStackField(breakpoint, seat.stack));

  if (seat.allIn && seat.inHand) {
    tile.append(createTextField('all-in', 'All-in'));
  }

  if (seat.wonAmount !== undefined && seat.wonAmount > 0) {
    const won = createTextField('won', `Won ${formatPlayChips(seat.wonAmount)}`);
    won.setAttribute('role', 'status');
    won.setAttribute('aria-live', 'polite');
    tile.append(won);
  }

  if (seat.lastAction) {
    tile.append(createTextField('last-action', seat.lastAction));
  }

  if (seat.position) {
    const position = createTextField('position', seat.position);
    position.setAttribute('aria-label', POSITION_LABELS[seat.position]);
    tile.append(position);
  }

  if (breakpoint !== 'phone' && seat.committed > 0) {
    tile.append(
      createTextField('committed', `${formatPlayChips(seat.committed)} in`),
    );
  }

  if (!seat.isLocal && breakpoint !== 'phone') {
    if (
      seat.holeCards &&
      seat.holeCards.length === 2 &&
      isHoleFaceCard(seat.holeCards[0]) &&
      isHoleFaceCard(seat.holeCards[1])
    ) {
      tile.append(createCardFaces(seat.holeCards));
    } else if (seat.inHand) {
      tile.append(createCardBacks());
    } else {
      tile.append(createTextField('fold', 'Fold'));
    }
  }

  const timer = createTimer(seat);
  if (timer) {
    tile.append(timer.timerText, timer.timerBar);
  }

  return tile;
}

export function renderPlayerRow(
  region: HTMLElement,
  seats: PlayerRowSeat[],
): void {
  region.replaceChildren();

  const breakpoint = getDashboardBreakpoint(region);
  const visibleSeats =
    breakpoint === 'phone' ? seats.filter((seat) => !seat.isLocal) : seats;

  const list = document.createElement('div');
  list.className = 'player-row-tiles';

  for (const seat of visibleSeats) {
    list.append(createSeatTile(seat, breakpoint));
  }

  region.append(list);

  const localActing = visibleSeats.some(
    (seat) => seat.isLocal && seat.acting && breakpoint !== 'phone',
  );
  if (localActing) {
    const announcement = document.createElement('div');
    announcement.className = 'player-row-turn-announcement';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = 'Your turn';
    region.append(announcement);
  }
}
