import { formatPlayChips } from './player-row.js';

export interface PocketCard {
  rank: string;
  suit: 'h' | 'd' | 'c' | 's';
}

export interface MyHandActionLogEntry {
  displayName: string;
  actionText: string;
}

export interface MyHandPanelViewModel {
  pocketCards?: PocketCard[];
  /** Ignored — fixtures may include foreign holes to prove they never render here. */
  foreignPocketCards?: PocketCard[];
  bank: number;
  sessionDelta?: number;
  committedThisHand?: number;
  madeHand?: string;
  tier?: string;
  meterFilled?: number;
  outsCount?: number;
  outsPhrase?: string;
  street?: string;
  actionLog?: MyHandActionLogEntry[];
}

type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const RANK_NAMES: Record<string, string> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
  '9': 'Nine',
  '8': 'Eight',
  '7': 'Seven',
  '6': 'Six',
  '5': 'Five',
  '4': 'Four',
  '3': 'Three',
  '2': 'Two',
};

const SUIT_NAMES: Record<PocketCard['suit'], string> = {
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
  s: 'Spades',
};

const SUIT_SYMBOLS: Record<PocketCard['suit'], string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const METER_LABELS = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
  'Royal flush',
];

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function formatAccessibleCardName(card: PocketCard): string {
  const rankName = RANK_NAMES[card.rank.toUpperCase()] ?? card.rank;
  const suitName = SUIT_NAMES[card.suit];
  return `${rankName} of ${suitName}`;
}

function formatVisibleCard(card: PocketCard): string {
  return `${card.rank.toUpperCase()}${SUIT_SYMBOLS[card.suit]}`;
}

function formatSignedSessionDelta(amount: number): string {
  const formatted = formatPlayChips(Math.abs(amount));
  if (amount > 0) {
    return `+${formatted}`;
  }
  if (amount < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

function createTextElement(
  className: string,
  field: string,
  text: string,
): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.dataset.field = field;
  element.textContent = text;
  return element;
}

function createPocketFaces(cards: PocketCard[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'my-hand-pocket';
  group.dataset.field = 'pocket';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Your pocket cards');

  for (const card of cards) {
    const face = document.createElement('div');
    face.className = 'my-hand-pocket-card';
    face.setAttribute('aria-label', formatAccessibleCardName(card));

    const visible = document.createElement('span');
    visible.className = 'my-hand-pocket-card-rank-suit';
    visible.textContent = formatVisibleCard(card);
    visible.setAttribute('aria-hidden', 'true');

    face.append(visible);
    group.append(face);
  }

  return group;
}

function createBankField(bank: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-bank';
  wrapper.dataset.field = 'bank';

  wrapper.append(createTextElement('my-hand-bank-label', 'bank-label', 'Your bank'));
  wrapper.append(
    createTextElement('my-hand-bank-amount', 'bank-amount', formatPlayChips(bank)),
  );
  return wrapper;
}

function createSessionField(sessionDelta: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-session';
  wrapper.dataset.field = 'session';

  wrapper.append(
    createTextElement(
      'my-hand-session-amount',
      'session-amount',
      formatSignedSessionDelta(sessionDelta),
    ),
  );
  wrapper.append(
    createTextElement('my-hand-session-label', 'session-label', 'this session'),
  );
  return wrapper;
}

function createCommittedField(committedThisHand: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-committed';
  wrapper.dataset.field = 'committed';

  wrapper.append(
    createTextElement(
      'my-hand-committed-amount',
      'committed-amount',
      formatPlayChips(committedThisHand),
    ),
  );
  wrapper.append(
    createTextElement(
      'my-hand-committed-label',
      'committed-label',
      'committed this hand',
    ),
  );
  return wrapper;
}

function createStrengthSection(
  viewModel: MyHandPanelViewModel,
  breakpoint: DashboardBreakpoint,
): HTMLElement | null {
  if (!viewModel.madeHand && !viewModel.tier) {
    return null;
  }

  const section = document.createElement('div');
  section.className = 'my-hand-strength';
  section.dataset.field = 'strength';

  if (breakpoint !== 'phone') {
    section.append(
      createTextElement('my-hand-strength-label', 'strength-label', 'Hand strength'),
    );
  }

  if (viewModel.madeHand) {
    section.append(
      createTextElement('my-hand-made-hand', 'made-hand', viewModel.madeHand),
    );
  }

  if (viewModel.tier) {
    section.append(createTextElement('my-hand-tier', 'tier', viewModel.tier));
  }

  if (viewModel.meterFilled !== undefined) {
    const meter = document.createElement('div');
    meter.className = 'my-hand-meter';
    meter.dataset.field = 'meter';
    meter.setAttribute('role', 'img');
    meter.setAttribute(
      'aria-label',
      `Hand strength meter: ${METER_LABELS[Math.max(0, Math.min(METER_LABELS.length - 1, viewModel.meterFilled))]}`,
    );

    const filled = Math.max(0, Math.min(METER_LABELS.length, viewModel.meterFilled));
    for (let index = 0; index < METER_LABELS.length; index += 1) {
      const segment = document.createElement('span');
      segment.className = 'my-hand-meter-segment';
      segment.dataset.segment = String(index + 1);
      segment.setAttribute('aria-hidden', 'true');
      if (index < filled) {
        segment.dataset.filled = 'true';
      }
      meter.append(segment);
    }

    section.append(meter);
  }

  return section;
}

function createOutsField(outsPhrase: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-outs';
  wrapper.dataset.field = 'outs';
  wrapper.append(createTextElement('my-hand-outs-phrase', 'outs-phrase', outsPhrase));
  return wrapper;
}

function createActionLog(
  street: string,
  entries: MyHandActionLogEntry[],
): HTMLElement {
  const log = document.createElement('div');
  log.className = 'my-hand-action-log';
  log.dataset.field = 'action-log';

  const heading = document.createElement('h3');
  heading.className = 'my-hand-action-log-heading';
  heading.dataset.field = 'action-log-heading';
  heading.textContent = `${street} action`;
  log.append(heading);

  if (entries.length === 0) {
    return log;
  }

  const list = document.createElement('ul');
  list.className = 'my-hand-action-log-list';

  for (const entry of entries) {
    const row = document.createElement('li');
    row.className = 'my-hand-action-log-row';
    row.dataset.field = 'action-log-row';

    const name = document.createElement('span');
    name.className = 'my-hand-action-log-name';
    name.dataset.field = 'action-log-name';
    name.textContent = entry.displayName;

    const action = document.createElement('span');
    action.className = 'my-hand-action-log-action';
    action.dataset.field = 'action-log-action';
    action.textContent = entry.actionText;

    row.append(name, action);
    list.append(row);
  }

  log.append(list);
  return log;
}

export function renderMyHandPanel(
  region: HTMLElement,
  viewModel: MyHandPanelViewModel,
): void {
  region.replaceChildren();

  const breakpoint = getDashboardBreakpoint(region);
  const panel = document.createElement('div');
  panel.className = 'my-hand-panel';

  const pocketCards = viewModel.pocketCards ?? [];
  if (pocketCards.length > 0) {
    panel.append(createPocketFaces(pocketCards));
  }

  panel.append(createBankField(viewModel.bank));

  if (breakpoint !== 'phone') {
    if (viewModel.sessionDelta !== undefined) {
      panel.append(createSessionField(viewModel.sessionDelta));
    }
    if (viewModel.committedThisHand !== undefined) {
      panel.append(createCommittedField(viewModel.committedThisHand));
    }
  }

  const strength = createStrengthSection(viewModel, breakpoint);
  if (strength) {
    panel.append(strength);
  }

  if (viewModel.outsPhrase) {
    panel.append(createOutsField(viewModel.outsPhrase));
  }

  if (
    breakpoint !== 'phone' &&
    viewModel.street &&
    viewModel.actionLog !== undefined
  ) {
    panel.append(createActionLog(viewModel.street, viewModel.actionLog));
  }

  region.append(panel);
}
