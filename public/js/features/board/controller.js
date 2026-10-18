import { getCurrentUserId } from '../../core/session.js';
import { tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { registerActions } from '../../core/actions.js';
import { openModal } from '../../core/dialogs.js';
import { addReason, fetchCategories, fetchLeaderboard, sendPoint, undoLastPoint } from './api.js';
import { UNDO_WINDOW_SECONDS, categoryButtonsHtml, dareAnnouncementHtml, pointOutcomeMessage, pointToastHtml, reasonFormHtml, recipientSelectorHtml, userCardHtml } from './view.js';
import { newlyTriggeredDares } from './model.js';
import { renderEmptyTeam } from '../emptyTeam/controller.js';
import { showHistory } from '../history/controller.js';

const MOBILE_BREAKPOINT_PX = 768;
const MIN_PLAYERS = 2;
const SELECTED_CLASSES = ['ring-4', 'ring-blue-500', 'category-active'];

const TOAST_DURATION_MS = { undoable: UNDO_WINDOW_SECONDS * 1000, plain: 5000 };
const DARE_ANNOUNCEMENT_DURATION_MS = 8000;
const SECOND_MS = 1000;

const state = { selectedCategoryId: null, members: [], transitioning: false, lastPointId: null, toastTimers: [] };

export const isRenderingTransition = () => state.transitioning;

const categoriesList = () => document.getElementById('categories-list');
const usersGrid = () => document.getElementById('users-grid');
const isMe = (userId) => String(userId) === String(getCurrentUserId());
const memberById = (userId) => state.members.find((member) => String(member.id) === String(userId));

function clearToastTimers() {
  state.toastTimers.forEach(clearInterval);
  state.toastTimers = [];
}

function hidePointToast() {
  clearToastTimers();
  document.getElementById('toast-notification')?.remove();
}

function startUndoCountdown(toast) {
  const undoButton = toast.querySelector('[data-action="undo-last-point"]');
  let secondsLeft = UNDO_WINDOW_SECONDS;
  state.toastTimers.push(setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) undoButton.textContent = tText('toast.undo_countdown', { seconds: secondsLeft });
    else undoButton.remove();
  }, SECOND_MS));
}

function showPointToast(message, type) {
  hidePointToast();
  document.body.insertAdjacentHTML('beforeend', pointToastHtml(message, type));
  const toast = document.getElementById('toast-notification');
  const undoable = Boolean(toast.querySelector('[data-action="undo-last-point"]'));
  if (undoable) startUndoCountdown(toast);
  state.toastTimers.push(setTimeout(() => {
    if (!toast.contains(document.activeElement)) hidePointToast();
  }, undoable ? TOAST_DURATION_MS.undoable : TOAST_DURATION_MS.plain));
}

function openReasonForm() {
  const toast = document.getElementById('toast-notification');
  toast.querySelector('[data-action="add-point-reason"]').replaceWith(document.createRange().createContextualFragment(reasonFormHtml()));
  const input = toast.querySelector('#point-reason');
  input.focus();
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') hidePointToast(); });
  toast.querySelector('#point-reason-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const outcome = await addReason(state.lastPointId, input.value.trim());
    showPointToast(outcome.ok ? tText('toast.reason_saved') : apiErrorMessage(outcome.body, 'toast.generic_error'), outcome.ok ? 'info' : 'error');
  });
}

function clearCategorySelection() {
  state.selectedCategoryId = null;
  categoriesList().querySelectorAll('.category-card').forEach((card) => {
    card.classList.remove(...SELECTED_CLASSES);
    card.setAttribute('aria-pressed', 'false');
  });
}

function selectCategory(card) {
  const categoryId = card.dataset.categoryId;
  if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
    openRecipientSelector(categoryId, card.querySelector('.category-emoji').textContent);
    return;
  }
  const wasSelected = state.selectedCategoryId === categoryId;
  clearCategorySelection();
  if (wasSelected) return;
  state.selectedCategoryId = categoryId;
  card.classList.add(...SELECTED_CLASSES);
  card.setAttribute('aria-pressed', 'true');
}

function refuseSelfPoint() {
  showPointToast(tText('toast.self_forbidden'), 'error');
  clearCategorySelection();
}

function targetCategory(card, categoryId) {
  if (!categoryId) {
    showPointToast(tText('toast.pick_badge_first'), 'info');
    return;
  }
  if (card.dataset.isMe === 'true') refuseSelfPoint();
  else givePoint(card.dataset.userId, categoryId);
}

function openRecipientSelector(categoryId, emoji) {
  const recipients = state.members.filter((member) => !isMe(member.id));
  const { element, close } = openModal({
    id: 'wheel-selector',
    panelClass: 'bg-white rounded-[40px] w-full max-w-sm p-6 animate-pop shadow-2xl text-center',
    content: recipientSelectorHtml(emoji, recipients),
  });
  element.querySelectorAll('[data-recipient-id]').forEach((button) => button.addEventListener('click', () => {
    close();
    givePoint(button.dataset.recipientId, categoryId);
  }));
}

async function givePoint(recipientId, categoryId) {
  let outcome;
  try {
    outcome = await sendPoint({ recipientId, categoryId });
  } catch {
    showPointToast(tText('toast.server_unreachable'), 'error');
    return;
  }
  clearCategorySelection();
  if (!outcome.ok) {
    showPointToast(apiErrorMessage(outcome.body, 'toast.generic_error'), 'error');
    return;
  }
  state.lastPointId = outcome.body.pointId;
  const { message, type } = pointOutcomeMessage(outcome.body);
  showPointToast(message, type);
  await refreshScores();
}

function announceDares(announcements) {
  if (!announcements.length) return;
  document.getElementById('dare-announcement')?.remove();
  document.body.insertAdjacentHTML('beforeend', dareAnnouncementHtml(announcements));
  const banner = document.getElementById('dare-announcement');
  setTimeout(() => banner.remove(), DARE_ANNOUNCEMENT_DURATION_MS);
}

export function renderUsers(users) {
  announceDares(newlyTriggeredDares(state.members, users));
  state.members = users;
  if (users.length < MIN_PLAYERS) {
    renderEmptyTeam(usersGrid());
    return;
  }
  usersGrid().innerHTML = users.map((user) => userCardHtml(user, { isMe: isMe(user.id) })).join('');
}

export async function refreshScores() {
  const users = await fetchLeaderboard();
  if (!users) return;
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderUsers(users);
    return;
  }
  state.transitioning = true;
  document.startViewTransition(() => renderUsers(users)).finished.finally(() => { state.transitioning = false; });
}

export async function loadCategories() {
  categoriesList().innerHTML = categoryButtonsHtml(await fetchCategories());
}

function wireCategories() {
  const list = categoriesList();
  list.addEventListener('click', (event) => {
    const card = event.target.closest('.category-card');
    if (card) selectCategory(card);
  });
  list.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.category-card');
    if (card) event.dataTransfer.setData('text/plain', card.dataset.categoryId);
  });
}

function wireUserCards() {
  const grid = usersGrid();
  const dropHighlight = (card) => (card.dataset.isMe === 'true' ? ['border-red-400', 'bg-red-50'] : ['border-blue-400', 'bg-blue-50']);
  grid.addEventListener('click', (event) => {
    const card = event.target.closest('.user-card');
    if (!card) return;
    if (event.target.closest('.history-button')) {
      showHistory(card.dataset.userId, memberById(card.dataset.userId)?.name ?? '');
      return;
    }
    targetCategory(card, state.selectedCategoryId);
  });
  grid.addEventListener('dragover', (event) => {
    const card = event.target.closest('.user-card');
    if (!card) return;
    event.preventDefault();
    card.classList.add(...dropHighlight(card));
  });
  grid.addEventListener('dragleave', (event) => {
    const card = event.target.closest('.user-card');
    card?.classList.remove(...dropHighlight(card));
  });
  grid.addEventListener('drop', (event) => {
    const card = event.target.closest('.user-card');
    if (!card) return;
    event.preventDefault();
    card.classList.remove(...dropHighlight(card));
    targetCategory(card, event.dataTransfer.getData('text/plain'));
  });
}

export function startBoard() {
  wireCategories();
  wireUserCards();
  registerActions({
    'add-point-reason': openReasonForm,
    'undo-last-point': async () => {
      if (!await undoLastPoint()) {
        showPointToast(tText('toast.undo_expired'), 'error');
        return;
      }
      hidePointToast();
      await refreshScores();
    },
  });
}
