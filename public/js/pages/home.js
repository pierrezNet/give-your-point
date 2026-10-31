import { applyI18n } from '../core/i18n.js';
import { startPage } from '../core/page.js';
import { ADMIN_ROLES, SESSION_CHECK_TIMEOUT_MS, SUPERADMIN_ROLES, checkSession, clearSession, getSessionToken } from '../core/session.js';
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
import { startFeedback } from '../features/feedback/controller.js';

const JOIN_PATH = /^\/join\/([^/]+)$/;
const LANDING_HASH = '#accueil';

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

function cloneTemplate(templateId) {
  const content = document.getElementById(templateId).content.cloneNode(true);
  applyI18n(content);
  return content;
}

function showSessionExpired() {
  clearSession();
  document.body.replaceChildren(cloneTemplate('session-invalid'));
}

function showBootState(state) {
  const status = document.getElementById('boot-status');
  document.getElementById('board').classList.toggle('hidden', state !== 'ready');
  document.getElementById('current-user-display').classList.toggle('hidden', state === 'error');
  if (state === 'ready') {
    status.replaceChildren();
    return;
  }
  status.replaceChildren(cloneTemplate(state === 'loading' ? 'boot-loading' : 'boot-error'));
  if (state === 'error') status.querySelector('[data-action="retry-boot"]').focus();
}

function failAfter(milliseconds) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), milliseconds));
}

async function loadBoard() {
  try {
    const loaded = await Promise.race([Promise.all([loadCategories(), refreshScores()]), failAfter(SESSION_CHECK_TIMEOUT_MS)]);
    return loaded.every(Boolean);
  } catch {
    return false;
  }
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

function wireSignedInApp(me) {
  setViewerRole(me.role);
  startBoard();
  startHelp();
  startProfile();
  registerActions({ 'toggle-menu': () => toggleMobileMenu(!document.getElementById('mobile-menu').classList.contains('open')) });
  document.addEventListener('click', closeMenuOnOutsideClick);
}

const signedInApp = { wired: false, live: false };

async function loadSignedInApp() {
  showBootState('loading');
  const session = await checkSession();
  if (session.status === 'invalid') {
    showSessionExpired();
    return;
  }
  if (session.status === 'unreachable') {
    showBootState('error');
    return;
  }
  showSignedInHeader(session.me);
  if (!signedInApp.wired) wireSignedInApp(session.me);
  signedInApp.wired = true;
  if (!await loadBoard()) {
    showBootState('error');
    return;
  }
  showBootState('ready');
  if (signedInApp.live) return;
  signedInApp.live = true;
  startRealtimeScores();
  startCompanyActivity();
  startPushNotifications();
}

function startSignedInApp() {
  document.getElementById('landing').remove();
  document.getElementById('app-shell').classList.remove('hidden');
  registerActions({ 'retry-boot': loadSignedInApp });
  return loadSignedInApp();
}

function route() {
  if (!startPage()) return null;
  startFeedback();
  const invitation = location.pathname.match(JOIN_PATH);
  if (invitation) return startJoin(decodeURIComponent(invitation[1]));
  if (!getSessionToken() || location.hash === LANDING_HASH) return startLanding();
  return startSignedInApp();
}

route();
