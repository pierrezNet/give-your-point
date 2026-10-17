import { applyI18n, t } from '../core/i18n.js';
import { ADMIN_ROLES, SUPERADMIN_ROLES, captureLoginFromUrl, clearSession, fetchCurrentUser, getSessionToken } from '../core/session.js';
import { registerActions } from '../core/actions.js';
import { renderLanding } from '../home/landing.js';
import { renderJoin } from '../home/join.js';
import { loadCategories, refreshScores } from '../home/scoreboard.js';
import { setViewerRole } from '../home/emptyTeam.js';
import { loadCompanyActivity } from '../home/companyActivity.js';
import { startRealtimeScores } from '../home/realtime.js';
import { initPushNotifications } from '../home/push.js';
import '../home/help.js';
import '../home/profile.js';

const JOIN_PATH = /^\/join\/([^/]+)$/;

function toggleMobileMenu(force) {
  const menu = document.getElementById('mobile-menu');
  const toggle = document.getElementById('menu-toggle');
  const open = force ?? !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  menu.classList.toggle('hidden', !open);
  toggle.setAttribute('aria-expanded', String(open));
}

function closeMenuOnOutsideClick(event) {
  const menu = document.getElementById('mobile-menu');
  if (menu?.classList.contains('open') && !event.target.closest('#mobile-menu, #menu-toggle')) toggleMobileMenu(false);
}

function showSessionExpired() {
  clearSession();
  document.body.innerHTML = `
    <main class="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
      <h1 class="text-2xl font-bold text-gray-800">${t('auth.session_invalid_title')}</h1>
      <p class="text-gray-600 mt-2">${t('auth.session_invalid_msg')}</p>
    </main>`;
}

function showSignedInHeader(me) {
  document.getElementById('current-user-name').textContent = me.name;
  document.getElementById('current-user-avatar').textContent = (me.name || '?')[0].toUpperCase();
  document.getElementById('current-team-name').textContent = me.team_name || '';
  const show = (selector, visible) => document.querySelectorAll(selector).forEach((link) => link.classList.toggle('hidden', !visible));
  show('.nav-btn-admin', ADMIN_ROLES.includes(me.role));
  show('.nav-btn-superadmin', SUPERADMIN_ROLES.includes(me.role));
  show('.nav-btn-owner', me.role === 'owner');
}

async function renderBoard() {
  document.getElementById('seo-landing')?.remove();
  document.getElementById('app-shell').classList.remove('hidden');
  const me = await fetchCurrentUser();
  if (!me) {
    showSessionExpired();
    return;
  }
  setViewerRole(me.role);
  showSignedInHeader(me);
  await Promise.all([loadCategories(), refreshScores()]);
  startRealtimeScores();
  loadCompanyActivity();
  initPushNotifications();
}

async function route() {
  applyI18n();
  const invitation = location.pathname.match(JOIN_PATH);
  if (invitation) return renderJoin(decodeURIComponent(invitation[1]));
  captureLoginFromUrl();
  if (!getSessionToken()) return renderLanding();
  return renderBoard();
}

registerActions({ 'toggle-menu': () => toggleMobileMenu() });
document.addEventListener('click', closeMenuOnOutsideClick);
route();
