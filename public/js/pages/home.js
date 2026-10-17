import { t } from '../core/i18n.js';
import { startPage } from '../core/page.js';
import { ADMIN_ROLES, SUPERADMIN_ROLES, clearSession, fetchCurrentUser, getSessionToken } from '../core/session.js';
import { registerActions } from '../core/actions.js';
import { startLanding } from '../features/landing/controller.js';
import { startJoin } from '../features/join/controller.js';
import { loadCategories, refreshScores, startBoard } from '../features/board/controller.js';
import { setViewerRole } from '../features/emptyTeam/controller.js';
import { startCompanyActivity } from '../features/companyActivity/controller.js';
import { startRealtimeScores } from '../features/realtime/controller.js';
import { startPushNotifications } from '../features/push/controller.js';
import { startHelp } from '../features/help/controller.js';
import { startProfile } from '../features/profile/controller.js';

const JOIN_PATH = /^\/join\/([^/]+)$/;

function toggleMobileMenu(open) {
  const menu = document.getElementById('mobile-menu');
  menu.classList.toggle('open', open);
  menu.classList.toggle('hidden', !open);
  document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
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

async function startSignedInApp() {
  document.getElementById('landing').remove();
  document.getElementById('app-shell').classList.remove('hidden');
  const me = await fetchCurrentUser();
  if (!me) {
    showSessionExpired();
    return;
  }
  setViewerRole(me.role);
  showSignedInHeader(me);
  startBoard();
  startHelp();
  startProfile();
  registerActions({ 'toggle-menu': () => toggleMobileMenu(!document.getElementById('mobile-menu').classList.contains('open')) });
  document.addEventListener('click', closeMenuOnOutsideClick);
  await Promise.all([loadCategories(), refreshScores()]);
  startRealtimeScores();
  startCompanyActivity();
  startPushNotifications();
}

function route() {
  if (!startPage()) return null;
  const invitation = location.pathname.match(JOIN_PATH);
  if (invitation) return startJoin(decodeURIComponent(invitation[1]));
  if (!getSessionToken()) return startLanding();
  return startSignedInApp();
}

route();
