import { ADMIN_ROLES } from '../../core/session.js';
import { tText } from '../../core/i18n.js';
import { registerActions } from '../../core/actions.js';
import { fetchInviteUrl, sendInvite } from './api.js';
import { emptyTeamHtml } from './view.js';

const WELCOME_FLAG_KEY = 'dtp_welcome';

let viewerRole = 'member';
export const setViewerRole = (role) => { viewerRole = role; };

function consumeWelcomeFlag() {
  try {
    const isWelcome = localStorage.getItem(WELCOME_FLAG_KEY) === '1';
    localStorage.removeItem(WELCOME_FLAG_KEY);
    return isWelcome;
  } catch {
    return false;
  }
}

function showInviteMessage(key, tone) {
  const message = document.getElementById('empty-invite-msg');
  message.textContent = tText(key);
  message.className = `text-xs ${tone}`;
}

export async function renderEmptyTeam(container) {
  if (document.getElementById('empty-team-state')) return;
  const canInvite = ADMIN_ROLES.includes(viewerRole);
  container.innerHTML = emptyTeamHtml({ isWelcome: consumeWelcomeFlag(), canInvite });
  if (!canInvite) return;

  document.getElementById('empty-invite-link').addEventListener('focus', (event) => event.target.select());
  document.getElementById('empty-invite-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('empty-invite-email');
    if (await sendInvite(input.value.trim())) {
      input.value = '';
      showInviteMessage('empty.email_sent', 'text-emerald-700');
    } else {
      showInviteMessage('empty.email_error', 'text-red-600');
    }
  });
  const url = await fetchInviteUrl();
  if (url) document.getElementById('empty-invite-link').value = url;
}

registerActions({
  'copy-empty-invite': async () => {
    const input = document.getElementById('empty-invite-link');
    await navigator.clipboard.writeText(input.value).catch(() => null);
    input.select();
    showInviteMessage('empty.link_copied', 'text-emerald-700');
  },
});
