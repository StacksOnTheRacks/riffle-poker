export const DASHBOARD_TABLE_SHELL_STYLE_ID = 'dashboard-table-shell-styles';

export interface DashboardTableShellProps {
  tableName: string;
  blindsLabel: string;
  seatedPlayersLabel: string;
  handNumber: number | null;
  street: string | null;
}

export type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const RESIZE_CLEANUP_KEY = '__dashboardTableShellResizeCleanup';

export function getDashboardBreakpoint(width: number): DashboardBreakpoint {
  if (width >= 1280) {
    return 'desktop';
  }
  if (width >= 834) {
    return 'tablet';
  }
  return 'phone';
}

function formatHandNumber(handNumber: number | null): string {
  return handNumber === null ? 'Hand —' : `Hand #${handNumber}`;
}

function formatStreet(street: string | null): string {
  return street ?? 'Waiting';
}

function createMetaField(
  field: 'table-name' | 'hand-number' | 'blinds' | 'street' | 'players',
  label: string,
  value: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'dashboard-meta-field';
  wrapper.dataset.field = field;

  const labelEl = document.createElement('span');
  labelEl.className = 'dashboard-meta-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'dashboard-meta-value';
  valueEl.textContent = value;

  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function createControlButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function renderTopBar(
  topBar: HTMLElement,
  props: DashboardTableShellProps,
  breakpoint: DashboardBreakpoint,
): void {
  topBar.replaceChildren();
  topBar.className = 'dashboard-top-bar';
  topBar.dataset.region = 'top-bar';
  topBar.setAttribute('role', 'region');
  topBar.setAttribute(
    'aria-label',
    breakpoint === 'phone' ? 'Table header' : 'Top bar',
  );

  const identityRow = document.createElement('div');
  identityRow.className = 'dashboard-top-bar-identity';

  const tableName = document.createElement('h1');
  tableName.className = 'dashboard-table-name';
  tableName.dataset.field = 'table-name';
  tableName.textContent = props.tableName;

  identityRow.append(tableName);

  const controls = document.createElement('div');
  controls.className = 'dashboard-top-bar-controls';

  if (breakpoint === 'phone') {
    controls.append(createControlButton('More', 'dashboard-control-more'));
  } else {
    controls.append(
      createControlButton('Settings', 'dashboard-control-settings'),
      createControlButton('Leave table', 'dashboard-control-leave'),
    );
  }

  identityRow.append(controls);
  topBar.append(identityRow);

  const metaRow = document.createElement('div');
  metaRow.className = 'dashboard-top-bar-meta';

  if (breakpoint === 'phone') {
    const summary = document.createElement('p');
    summary.className = 'dashboard-hand-summary';
    summary.dataset.field = 'hand-summary';
    summary.textContent = `${formatHandNumber(props.handNumber)} · ${props.blindsLabel} · ${formatStreet(props.street)}`;
    metaRow.append(summary);
  } else {
    metaRow.append(
      createMetaField('hand-number', 'Hand', formatHandNumber(props.handNumber)),
      createMetaField('blinds', 'Blinds', props.blindsLabel),
      createMetaField('players', 'Players', props.seatedPlayersLabel),
      createMetaField('street', 'Street', formatStreet(props.street)),
    );
  }

  topBar.append(metaRow);
}

function createRegion(
  region: 'player-row' | 'my-hand' | 'board' | 'actions',
  ariaLabel: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = `dashboard-region dashboard-region-${region}`;
  section.dataset.region = region;
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', ariaLabel);
  return section;
}

function updatePlayerRowLabel(playerRow: HTMLElement, breakpoint: DashboardBreakpoint): void {
  playerRow.setAttribute(
    'aria-label',
    breakpoint === 'phone' ? 'Opponents' : 'Player row',
  );
}

function updateActionsRegion(actions: HTMLElement, breakpoint: DashboardBreakpoint): void {
  if (breakpoint === 'phone') {
    actions.dataset.actionsChrome = 'action-sheet';
  } else {
    delete actions.dataset.actionsChrome;
  }
}

function syncRegionOrder(shell: HTMLElement, breakpoint: DashboardBreakpoint): void {
  const topBar = shell.querySelector('[data-region="top-bar"]');
  const playerRow = shell.querySelector('[data-region="player-row"]');
  const myHand = shell.querySelector('[data-region="my-hand"]');
  const board = shell.querySelector('[data-region="board"]');
  const actions = shell.querySelector('[data-region="actions"]');

  if (!topBar || !playerRow || !myHand || !board || !actions) {
    return;
  }

  if (breakpoint === 'desktop') {
    shell.append(topBar, playerRow, myHand, board, actions);
    return;
  }

  shell.append(topBar, playerRow, board, myHand, actions);
}

export function injectDashboardTableShellStyles(css: string): void {
  let style = document.getElementById(DASHBOARD_TABLE_SHELL_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = DASHBOARD_TABLE_SHELL_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

export function renderDashboardTableShell(
  root: HTMLElement,
  props: DashboardTableShellProps,
): void {
  const priorCleanup = (root as HTMLElement & Record<string, (() => void) | undefined>)[
    RESIZE_CLEANUP_KEY
  ];
  priorCleanup?.();

  root.replaceChildren();
  root.dataset.surface = 'dashboard';

  const shell = document.createElement('div');
  shell.className = 'dashboard-table-shell';

  const topBar = document.createElement('header');
  const playerRow = createRegion('player-row', 'Player row');
  const myHand = createRegion('my-hand', 'My Hand');
  const board = createRegion('board', 'Board');
  const actions = createRegion('actions', 'Actions');

  shell.append(topBar, playerRow, myHand, board, actions);
  root.append(shell);

  const applyBreakpoint = (): void => {
    const breakpoint = getDashboardBreakpoint(window.innerWidth);
    root.dataset.breakpoint = breakpoint;
    renderTopBar(topBar, props, breakpoint);
    updatePlayerRowLabel(playerRow, breakpoint);
    updateActionsRegion(actions, breakpoint);
    syncRegionOrder(shell, breakpoint);
  };

  applyBreakpoint();

  const onResize = (): void => {
    applyBreakpoint();
  };

  window.addEventListener('resize', onResize);
  (root as HTMLElement & Record<string, (() => void) | undefined>)[RESIZE_CLEANUP_KEY] = () => {
    window.removeEventListener('resize', onResize);
  };
}
