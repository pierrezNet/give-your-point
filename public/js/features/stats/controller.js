import { t } from '../../core/i18n.js';
import { getSessionToken } from '../../core/session.js';
import { registerActions } from '../../core/actions.js';
import { fetchStats } from './api.js';
import { statsHtml } from './view.js';

const DEFAULT_PERIOD = '30';
let currentPeriod = DEFAULT_PERIOD;
const content = () => document.getElementById('stats-content');

function animateBars() {
  requestAnimationFrame(() => {
    content().querySelectorAll('.bar-fill').forEach((bar) => { bar.style.width = `${bar.dataset.pct}%`; });
    content().querySelectorAll('.week-bar').forEach((bar) => { bar.style.height = `${bar.dataset.pct}%`; });
  });
}

async function loadStats() {
  if (!getSessionToken()) {
    content().innerHTML = `<p class="text-center text-slate-600">${t('stats.connect_first')}</p>`;
    return;
  }
  const result = await fetchStats(currentPeriod);
  if (!result.ok) {
    content().innerHTML = `<p class="text-center text-red-600">${t('stats.error')}</p>`;
    return;
  }
  currentPeriod = result.data.period || currentPeriod;
  content().innerHTML = statsHtml(result.data, currentPeriod);
  animateBars();
}

export function startStats() {
  registerActions({
    'select-period': ({ dataset }) => {
      currentPeriod = dataset.period;
      loadStats();
    },
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStats(); });
  loadStats();
}
