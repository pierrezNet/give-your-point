import { getCurrentUserId } from '../../core/session.js';
import { tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { registerActions } from '../../core/actions.js';
import { openModal } from '../../core/dialogs.js';
import { fetchCategories, fetchLeaderboard, sendPoint, undoLastPoint } from './api.js';
import { POINT_TOAST_STYLES, categoryButtonsHtml, pointOutcomeMessage, pointToastHtml, reasonDialogHtml, recipientSelectorHtml, userCardHtml } from './view.js';
import { renderEmptyTeam } from '../emptyTeam/controller.js';
import { showHistory } from '../history/controller.js';

const MOBILE_BREAKPOINT_PX = 768;
const MIN_PLAYERS = 2;
const SELECTED_CLASSES = ['ring-4', 'ring-blue-500', 'category-active'];

const state = { selectedCategoryId: null, members: [], transitioning: false };

export const isRenderingTransition = () => state.transitioning;

const categoriesList = () => document.getElementById('categories-list');
const usersGrid = () => document.getElementById('users-grid');
const isMe = (userId) => String(userId) === String(getCurrentUserId());
const memberById = (userId) => state.members.find((member) => String(member.id) === String(userId));

function hidePointToast() {
  document.getElementById('toast-notification')?.remove();
}

function showPointToast(message, type) {
  hidePointToast();
  document.body.insertAdjacentHTML('beforeend', pointToastHtml(message, type));
  const toast = document.getElementById('toast-notification');
  setTimeout(() => toast.remove(), (POINT_TOAST_STYLES[type] ?? POINT_TOAST_STYLES.error).durationMs);
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
  if (!categoryId) return;
  if (card.dataset.isMe === 'true') refuseSelfPoint();
  else askReasonAndGive(memberById(card.dataset.userId), categoryId);
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
    askReasonAndGive(memberById(button.dataset.recipientId), categoryId);
  }));
}

function askReasonAndGive(recipient, categoryId) {
  const { element, close } = openModal({
    id: 'reason-modal',
    panelClass: 'bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-pop text-center',
    content: reasonDialogHtml(recipient.name),
  });
  element.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const reason = element.querySelector('#reason-input').value.trim();
    close();
    givePoint(recipient.id, categoryId, reason);
  });
}

async function givePoint(recipientId, categoryId, reason) {
  let outcome;
  try {
    outcome = await sendPoint({ recipientId, categoryId, reason });
  } catch {
    showPointToast(tText('toast.server_unreachable'), 'error');
    return;
  }
  clearCategorySelection();
  if (!outcome.ok) {
    showPointToast(apiErrorMessage(outcome.body, 'toast.generic_error'), 'error');
    return;
  }
  const { message, type } = pointOutcomeMessage(outcome.body);
  showPointToast(message, type);
  await refreshScores();
}

export function renderUsers(users) {
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
  if (!document.startViewTransition) {
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
