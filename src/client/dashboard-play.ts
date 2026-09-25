import './dashboard/styles.css';
import { renderDashboardTableShell } from './dashboard/table-shell.js';

export function mountDashboardPlay(root: HTMLElement): void {
  renderDashboardTableShell(root, {
    tableName: 'Riffle table',
    blindsLabel: '$1 / $2',
    seatedPlayersLabel: '0 / 8',
    handNumber: null,
    street: null,
  });
}

const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
if (root) {
  mountDashboardPlay(root);
}
