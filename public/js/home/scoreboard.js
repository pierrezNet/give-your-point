import { authFetch, getCurrentUserId, postJson } from '../core/session.js';
import { t, tText } from '../core/i18n.js';
import { escapeHtml } from '../core/html.js';
import { apiErrorMessage } from '../core/api.js';
import { registerActions } from '../core/actions.js';
import { openModal } from '../core/dialogs.js';
import { hidePointToast, showPointToast } from './pointToast.js';
import { renderEmptyTeamState } from './emptyTeam.js';
import { showHistory } from './history.js';

const MOBILE_BREAKPOINT_PX = 768;
const REASON_MAX_LENGTH = 140;
const RANK_COLORS = { 1: 'bg-yellow-400', 2: 'bg-slate-300', 3: 'bg-amber-600' };
const SELECTED_CATEGORY_CLASSES = ['ring-4', 'ring-blue-500', 'category-active'];

let selectedCategoryId = null;
let isTransitioning = false;
let teamMembers = [];

export const isRenderingTransition = () => isTransitioning;

function clearCategorySelection() {
  selectedCategoryId = null;
  document.querySelectorAll('.category-card').forEach((card) => {
    card.classList.remove(...SELECTED_CATEGORY_CLASSES);
    card.setAttribute('aria-pressed', 'false');
  });
}

export async function loadCategories() {
  const list = document.getElementById('categories-list');
  const categories = await (await authFetch('/api/categories')).json();
  list.innerHTML = categories.map((category) => `
    <button type="button" draggable="true" data-category-id="${escapeHtml(category.id)}" aria-pressed="false"
            class="category-card bg-white p-2 lg:p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all text-left">
      <span class="category-emoji text-xl lg:text-2xl pointer-events-none">${escapeHtml(category.emoji)}</span>
      <span class="text-base lg:text-2xl pointer-events-none">${escapeHtml(category.name)}</span>
    </button>`).join('');
  list.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('click', () => selectCategory(card));
    card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', card.dataset.categoryId));
  });
}

function selectCategory(card) {
  const categoryId = card.dataset.categoryId;
  if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
    openRecipientSelector(categoryId, card.querySelector('.category-emoji').textContent);
    return;
  }
  const wasSelected = selectedCategoryId === categoryId;
  clearCategorySelection();
  if (wasSelected) return;
  selectedCategoryId = categoryId;
  card.classList.add(...SELECTED_CATEGORY_CLASSES);
  card.setAttribute('aria-pressed', 'true');
}

function userCardHtml(user, isMe) {
  return `
    <button type="button" class="history-button absolute top-3 left-3 text-slate-300 hover:text-blue-500 hover:scale-110 transition-all z-30 p-1"
            aria-label="${escapeHtml(tText('history.title', { name: user.name }))}">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>
    <div class="rank-badge absolute top-3 right-3 text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm"></div>
    <div class="collapse lg:visible w-16 h-16 bg-linear-to-br from-blue-100 to-blue-50 rounded-full mb-3 flex items-center justify-center text-blue-600 text-2xl font-bold border border-blue-100 shadow-inner" aria-hidden="true">
      ${escapeHtml((user.name || 'U')[0].toUpperCase())}
    </div>
    <h3 class="font-bold text-gray-800 text-lg">${escapeHtml(user.name)} ${isMe ? t('index.you_label') : ''}</h3>
    <p class="user-points-total text-blue-600 font-black text-sm mb-3"></p>
    <div class="top-categories-container flex flex-wrap justify-center gap-2 mt-2 w-full"></div>`;
}

function refuseSelfPoint() {
  showPointToast(tText('toast.self_forbidden'), 'error');
  clearCategorySelection();
}

function wireUserCard(card, user, isMe) {
  const highlight = isMe ? ['border-red-400', 'bg-red-50'] : ['border-blue-400', 'bg-blue-50'];
  card.querySelector('.history-button').addEventListener('click', (event) => {
    event.stopPropagation();
    showHistory(user.id, user.name);
  });
  card.addEventListener('dragover', (event) => { event.preventDefault(); card.classList.add(...highlight); });
  card.addEventListener('dragleave', () => card.classList.remove(...highlight));
  card.addEventListener('drop', (event) => {
    event.preventDefault();
    card.classList.remove(...highlight);
    const categoryId = event.dataTransfer.getData('text/plain');
    if (!categoryId) return;
    if (isMe) refuseSelfPoint();
    else askReasonAndGive(user, categoryId);
  });
  card.addEventListener('click', () => {
    if (!selectedCategoryId) return;
    if (isMe) refuseSelfPoint();
    else askReasonAndGive(user, selectedCategoryId);
  });
}

function updateCard(card, user) {
  card.querySelector('.user-points-total').textContent = `${user.total_points || 0} ${tText('index.pts_short')}`;
  const rankBadge = card.querySelector('.rank-badge');
  rankBadge.textContent = `#${user.rank}`;
  rankBadge.classList.remove(...Object.values(RANK_COLORS), 'bg-blue-500');
  rankBadge.classList.add(RANK_COLORS[user.rank] ?? 'bg-blue-500');

  card.querySelector('.top-categories-container').innerHTML = (user.topCategories || []).map((category) => `
    <div class="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
      <span class="text-sm">${escapeHtml(category.emoji)}</span>
      <span class="text-[10px] font-bold ml-1 text-gray-500">${escapeHtml(category.count)}</span>
    </div>`).join('') || `<span class="text-[10px] text-gray-400 italic">${t('index.no_badge')}</span>`;

  card.classList.toggle('gage-active', Boolean(user.gage || user.spammer));
  card.classList.toggle('border-orange-500', Boolean(user.gage || user.spammer));
  setBanner(card, 'gage-banner', user.gage ? tText('index.gage_label', { dare: user.gage.toUpperCase() }) : null,
    '-top-3 bg-orange-600');
  setBanner(card, 'spammer-banner', user.spammer ? tText('index.spammer_label') : null, '-bottom-3 bg-purple-600');
}

function setBanner(card, className, text, placement) {
  let banner = card.querySelector(`.${className}`);
  if (!text) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.className = `${className} absolute ${placement} left-1/2 -translate-x-1/2 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg z-10 whitespace-nowrap`;
    card.append(banner);
  }
  banner.textContent = text;
}

export function renderUsers(users) {
  const grid = document.getElementById('users-grid');
  teamMembers = users;
  if (users.length < 2) {
    renderEmptyTeamState(grid);
    return;
  }
  const myId = getCurrentUserId();
  grid.innerHTML = '';
  for (const user of users) {
    const isMe = String(user.id) === String(myId);
    const card = document.createElement('div');
    card.dataset.userId = user.id;
    card.style.viewTransitionName = `card-${user.id}`;
    card.className = `user-card relative bg-white p-2 lg:p-3 rounded-2xl shadow-sm border-2 transition-all flex flex-col items-center text-center ${
      isMe ? 'cursor-not-allowed border-slate-200' : 'cursor-pointer hover:shadow-md border-transparent'}`;
    card.innerHTML = userCardHtml(user, isMe);
    wireUserCard(card, user, isMe);
    grid.append(card);
    updateCard(card, user);
  }
}

export async function refreshScores() {
  const response = await authFetch('/api/users-stats');
  if (!response.ok) return;
  const users = await response.json();
  if (!document.startViewTransition) {
    renderUsers(users);
    return;
  }
  isTransitioning = true;
  const transition = document.startViewTransition(() => renderUsers(users));
  transition.finished.finally(() => { isTransitioning = false; });
}

function openRecipientSelector(categoryId, emoji) {
  const myId = getCurrentUserId();
  const recipients = teamMembers.filter((user) => String(user.id) !== String(myId));
  const { element, close } = openModal({
    id: 'wheel-selector',
    panelClass: 'bg-white rounded-[40px] w-full max-w-sm p-6 animate-pop shadow-2xl text-center',
    content: `
      <div class="mb-6">
        <div class="text-5xl mb-2" aria-hidden="true">${escapeHtml(emoji)}</div>
        <h2 class="text-slate-600 text-sm font-medium">${t('selector.who')}</h2>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        ${recipients.map((user) => `
          <button type="button" data-recipient-id="${escapeHtml(user.id)}" class="flex flex-col items-center gap-2 group">
            <span class="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl group-active:bg-blue-600 group-active:text-white transition-all shadow-sm" aria-hidden="true">
              ${escapeHtml(user.name[0].toUpperCase())}
            </span>
            <span class="text-[11px] font-bold text-slate-600 truncate w-full">${escapeHtml(user.name)}</span>
          </button>`).join('')}
      </div>
      <button type="button" data-close-modal class="text-slate-500 font-bold text-xs uppercase tracking-widest py-2">${t('common.cancel')}</button>`,
  });
  element.querySelectorAll('[data-recipient-id]').forEach((button) => button.addEventListener('click', () => {
    close();
    const recipient = recipients.find((user) => String(user.id) === button.dataset.recipientId);
    askReasonAndGive(recipient, categoryId);
  }));
}

function askReasonAndGive(recipient, categoryId) {
  const { element, close } = openModal({
    id: 'reason-modal',
    panelClass: 'bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-pop text-center',
    content: `
      <div class="text-4xl mb-2" aria-hidden="true">🎯</div>
      <h2 class="text-lg font-black text-slate-800 mb-1">${t('reason.title', { name: recipient.name })}</h2>
      <p class="text-xs text-slate-600 mb-4">${t('reason.hint')}</p>
      <form class="space-y-3">
        <label for="reason-input" class="sr-only">${t('reason.placeholder')}</label>
        <input id="reason-input" type="text" maxlength="${REASON_MAX_LENGTH}" autocomplete="off" autofocus placeholder="${t('reason.placeholder')}"
               class="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-left" />
        <div class="flex gap-2">
          <button type="button" data-close-modal class="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">${t('common.cancel')}</button>
          <button type="submit" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">${t('reason.submit')}</button>
        </div>
      </form>`,
  });
  element.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const reason = element.querySelector('#reason-input').value.trim();
    close();
    givePoint(recipient.id, categoryId, reason);
  });
}

async function givePoint(recipientId, categoryId, reason) {
  let response;
  try {
    response = await postJson('/api/points', { to_user_id: String(recipientId), category_id: String(categoryId), reason: reason || null });
  } catch {
    showPointToast(tText('toast.server_unreachable'), 'error');
    return;
  }
  clearCategorySelection();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    showPointToast(apiErrorMessage(result, 'toast.generic_error'), 'error');
    return;
  }
  if (result.gageTriggered) showPointToast(tText('toast.gage_triggered', result.gageTriggered), 'danger');
  else if (result.gageWarning) showPointToast(tText('toast.gage_warning', result.gageWarning), 'warning');
  else showPointToast(tText('toast.point_sent'), 'success');
  await refreshScores();
}

async function undoLastPoint() {
  const response = await authFetch('/api/points/undo', { method: 'POST' });
  if (!response.ok) {
    showPointToast(tText('toast.undo_expired'), 'error');
    return;
  }
  hidePointToast();
  await refreshScores();
}

registerActions({ 'undo-last-point': undoLastPoint });
