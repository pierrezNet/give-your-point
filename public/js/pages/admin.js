import { applyI18n, t, tText } from '../core/i18n.js';
import { ADMIN_ROLES, authFetch, postJson, setSessionToken } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { errorMessageOf } from '../core/api.js';
import { registerActions } from '../core/actions.js';
import { uiConfirm, uiToast } from '../core/dialogs.js';
import { formatSmartDate } from '../core/dates.js';
import { requirePageRole, revealRoleLinks } from '../core/guard.js';

const SPAM_WATCH_THRESHOLD = 0.5;

const state = { users: new Map(), categories: new Map(), spammers: new Map() };

async function adminFetch(url, options) {
  const response = await authFetch(url, options);
  if (response.status === 401) {
    uiToast(tText('common.access_denied'));
    location.href = '/';
  }
  return response;
}

async function adminAction(url, method, fallbackKey, body) {
  const response = body === undefined
    ? await adminFetch(url, { method })
    : await postJson(url, body, method);
  if (!response.ok) uiToast(await errorMessageOf(response, fallbackKey));
  return response.ok ? response : null;
}

const maskEmail = (email) => {
  const [local = '', domain = ''] = String(email).split('@');
  return `${local.slice(0, 2)}…@…${domain.slice(-3)}`;
};

function memberStatusHtml(user, isPending) {
  if (user.active === 1) return '';
  return isPending
    ? `<span class="text-[10px] font-black uppercase text-blue-700 not-italic">⏳ ${t('admin.pending_flag')}</span>`
    : t('admin.user_deactivated');
}

function emailCellHtml(user) {
  if (user.active !== 1) return '<span class="text-slate-500">—</span>';
  if (!user.email) return '<span class="text-slate-500">—</span>';
  return `
    <div class="flex flex-col gap-0.5">
      <span class="font-mono text-slate-500">${escapeHtml(maskEmail(user.email))}</span>
      ${user.email_verified
        ? `<span class="text-[10px] font-black uppercase text-emerald-700">✓ ${t('admin.email_confirmed')}</span>`
        : `<span class="text-[10px] font-black uppercase text-amber-700">⏳ ${t('admin.email_pending')}</span>`}
    </div>`;
}

function dareButtonsHtml(user, activeDares) {
  return [...state.categories.values()]
    .filter((category) => activeDares.some((dare) => String(dare.categoryId) === String(category.id)))
    .map((category) => `
      <button type="button" data-action="clear-dare" data-user-id="${escapeHtml(user.id)}" data-category-id="${escapeHtml(category.id)}"
              title="${escapeHtml(category.name)}" aria-label="${escapeHtml(tText('admin.confirm_clear_category', { cat: category.name, user: user.name }))}"
              class="w-10 h-10 flex flex-col items-center justify-center bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-all shadow-sm animate-bounce-short">
        <span class="text-xs">${escapeHtml(category.emoji)}</span>
      </button>`).join('');
}

function memberActionsHtml(user, isPending) {
  const id = escapeHtml(user.id);
  if (user.active !== 1) {
    return `
      <button type="button" data-action="restore-member" data-user-id="${id}" class="text-xs font-black text-emerald-700 uppercase">${t(isPending ? 'admin.validate' : 'common.restore')}</button>
      ${isPending ? `<button type="button" data-action="reject-member" data-user-id="${id}" title="${t('admin.reject_title')}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('admin.reject')}</button>` : ''}`;
  }
  return `
    ${user.email
      ? `<button type="button" data-action="resend-link" data-user-id="${id}" class="text-xs font-black text-blue-700 uppercase hover:underline">${t('admin.resend_link')}</button>
         <button type="button" data-action="reveal-link" data-user-id="${id}" class="text-sm text-slate-500 hover:text-slate-700" title="${t('admin.reveal_link_title')}" aria-label="${t('admin.reveal_link_title')}">🔗</button>`
      : `<button type="button" data-action="copy-link" data-user-id="${id}" class="text-xs font-black text-blue-700 uppercase hover:underline">${t('common.copy_link')}</button>`}
    <button type="button" data-action="regenerate-link" data-user-id="${id}" title="${t('admin.regen_title')}" aria-label="${t('admin.regen_title')}" class="text-base text-amber-600 hover:text-amber-700 leading-none">↻</button>
    <button type="button" data-action="deactivate-member" data-user-id="${id}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('common.deactivate')}</button>`;
}

function memberRowHtml(user, dares) {
  const isActive = user.active === 1;
  const isPending = !isActive && !user.has_activity;
  const activeDares = dares.filter((dare) => dare.userId === user.id);
  return `
    <tr class="border-b border-slate-100 ${isActive ? 'hover:bg-slate-50' : 'bg-slate-50 opacity-60'} transition-colors">
      <td class="p-4">
        <div class="font-bold ${isActive ? 'text-slate-800' : 'text-slate-500 italic'}">${escapeHtml(user.name)} ${memberStatusHtml(user, isPending)}</div>
        ${activeDares.map(() => `<div class="text-[10px] text-orange-700 font-black uppercase">${t('admin.has_gage')}</div>`).join('')}
      </td>
      <td class="p-4 text-xs hidden sm:table-cell">${emailCellHtml(user)}</td>
      <td class="p-4">
        <div class="flex items-center justify-end gap-3">
          <div class="flex gap-1">${dareButtonsHtml(user, activeDares)}</div>
          <div class="flex items-center gap-4 ml-4 border-l border-slate-200 pl-4">${memberActionsHtml(user, isPending)}</div>
        </div>
      </td>
    </tr>`;
}

function renderSpamBanner(spammers) {
  const watched = spammers.filter((spammer) => spammer.flagged || spammer.progress >= SPAM_WATCH_THRESHOLD);
  state.spammers = new Map(watched.map((spammer) => [spammer.userId, spammer]));
  document.getElementById('spam-banner').innerHTML = watched.length ? `
    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
      <div class="font-black text-amber-800 text-sm mb-3 flex items-center gap-2">⚠️ ${t('admin.spam_zone_title')}</div>
      <div class="space-y-2">
        ${watched.map((spammer) => {
          const percent = Math.min(Math.round(spammer.progress * 100), 100);
          return `
            <div class="flex items-center gap-3">
              <span class="text-sm font-bold ${spammer.flagged ? 'text-purple-700' : 'text-amber-900'} w-28 sm:w-32 truncate shrink-0">${spammer.flagged ? '🚨 ' : ''}${escapeHtml(spammer.name)}</span>
              <div class="flex-1 h-2 bg-white rounded-full overflow-hidden border border-amber-100" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full ${spammer.flagged ? 'bg-purple-500' : 'bg-amber-400'} rounded-full" style="width:${percent}%"></div>
              </div>
              <span class="text-xs font-black ${spammer.flagged ? 'text-purple-700' : 'text-amber-700'} w-9 text-right shrink-0">${percent}%</span>
              ${spammer.flagged ? `<button type="button" data-action="pardon-spammer" data-user-id="${escapeHtml(spammer.userId)}" class="text-[10px] font-black uppercase text-emerald-700 hover:underline whitespace-nowrap shrink-0">${t('admin.spammer_pardon')}</button>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>` : '';
}

async function loadMembers() {
  const [users, dares, categories, spammers] = await Promise.all(
    ['/api/admin/users', '/api/admin/dares', '/api/categories', '/api/admin/spammers'].map(async (url) => {
      const response = await adminFetch(url);
      return response.ok ? response.json() : [];
    }),
  );
  state.users = new Map(users.map((user) => [user.id, user]));
  state.categories = new Map(categories.map((category) => [category.id, category]));
  renderSpamBanner(spammers);
  const pending = users.filter((user) => user.active !== 1 && !user.has_activity);
  document.getElementById('pending-banner').innerHTML = pending.length
    ? `<div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-slate-800 font-bold" role="status">⏳ ${t('admin.pending_banner', { n: pending.length })}</div>`
    : '';
  document.getElementById('admin-users-list').innerHTML = users.map((user) => memberRowHtml(user, dares)).join('');
}

async function loadInviteLink() {
  const response = await adminFetch('/api/admin/invite-link');
  if (response.ok) document.getElementById('invite-link').value = (await response.json()).url;
}

function badgeCardHtml(category) {
  const isActive = category.active === 1;
  return `
    <div class="relative flex flex-col p-5 bg-white rounded-2xl border-2 ${isActive ? 'border-slate-100' : 'border-slate-50 bg-slate-50/50'} transition-all shadow-sm">
      <div class="flex items-center gap-4 mb-4">
        <span class="text-4xl ${isActive ? '' : 'grayscale opacity-30'}" aria-hidden="true">${escapeHtml(category.emoji)}</span>
        <div class="flex flex-col">
          <span class="font-bold text-lg ${isActive ? 'text-slate-800' : 'text-slate-500 italic'}">${escapeHtml(category.name)}</span>
          <span class="text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-700' : 'text-slate-500'}">${t(isActive ? 'admin.badge_active' : 'admin.badge_inactive')}</span>
        </div>
      </div>
      <div class="flex justify-end mt-auto">
        <button type="button" data-action="${isActive ? 'deactivate-badge' : 'restore-badge'}" data-category-id="${escapeHtml(category.id)}"
                class="p-2 rounded-xl transition-all ${isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}"
                title="${t(isActive ? 'common.deactivate' : 'common.restore')}" aria-label="${t(isActive ? 'common.deactivate' : 'common.restore')} : ${escapeHtml(category.name)}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isActive ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M12 4v16m8-8H4'}" />
          </svg>
        </button>
      </div>
    </div>`;
}

async function loadBadges() {
  const response = await adminFetch('/api/admin/categories');
  if (!response.ok) return;
  const categories = await response.json();
  document.getElementById('admin-categories-list').innerHTML = categories.map(badgeCardHtml).join('');
  document.getElementById('rule-cat').innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</option>`).join('');
}

function ruleHtml(rule) {
  const id = escapeHtml(rule.id);
  return `
    <div id="rule-row-${id}" class="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
      <div class="rule-display flex justify-between items-center">
        <span class="text-sm">${t('admin.rule_if')} <b>${escapeHtml(rule.cat_emoji)} ${escapeHtml(rule.cat_name)}</b> ${t('admin.rule_reaches')} <b>${escapeHtml(rule.threshold)}</b> ${t('admin.rule_then')} <span class="text-orange-700 font-bold">${escapeHtml(rule.dare_text)}</span></span>
        <div class="flex gap-3 shrink-0 ml-3">
          <button type="button" data-action="edit-rule" data-rule-id="${id}" class="text-blue-700 hover:text-blue-800 text-xs font-bold">${t('common.edit')}</button>
          <button type="button" data-action="delete-rule" data-rule-id="${id}" class="text-red-600 hover:text-red-700 text-xs font-bold">${t('common.delete')}</button>
        </div>
      </div>
      <form class="rule-edit hidden mt-2 flex gap-2 items-center" data-rule-id="${id}">
        <input type="number" name="threshold" min="1" max="1000" class="w-20 p-2 rounded-lg border text-sm" value="${escapeHtml(rule.threshold)}" aria-label="${t('admin.rule_threshold')}">
        <input type="text" name="dare_text" maxlength="140" class="flex-1 p-2 rounded-lg border text-sm" value="${escapeHtml(rule.dare_text)}" aria-label="${t('admin.rule_dare_text')}">
        <button type="submit" class="bg-orange-600 text-white px-3 py-2 rounded-lg text-xs font-bold">${t('common.save')}</button>
        <button type="button" data-action="cancel-rule-edit" data-rule-id="${id}" class="text-slate-500 text-xs font-bold">${t('common.cancel')}</button>
      </form>
    </div>`;
}

async function loadRules() {
  const response = await adminFetch('/api/admin/rules');
  if (!response.ok) return;
  const list = document.getElementById('rules-list');
  list.innerHTML = (await response.json()).map(ruleHtml).join('');
  list.querySelectorAll('form.rule-edit').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (await adminAction(`/api/admin/rules/${form.dataset.ruleId}`, 'PATCH', 'common.error', { threshold: data.get('threshold'), dare_text: data.get('dare_text') })) loadRules();
  }));
}

function toggleRuleEdition(ruleId, editing) {
  const row = document.getElementById(`rule-row-${ruleId}`);
  row.querySelector('.rule-display').classList.toggle('hidden', editing);
  row.querySelector('.rule-edit').classList.toggle('hidden', !editing);
}

async function loadDareLog() {
  const response = await adminFetch('/api/admin/dare-log');
  if (!response.ok) return;
  const entries = await response.json();
  document.getElementById('admin-dare-log').innerHTML = entries.length ? entries.map((entry) => {
    const isSpamPardon = !entry.category_id;
    return `
      <div class="flex items-center justify-between p-3 ${isSpamPardon ? 'bg-purple-50 border-purple-100' : 'bg-orange-50 border-orange-100'} rounded-xl border">
        <div class="flex items-center gap-3 text-sm min-w-0">
          <span class="text-lg shrink-0" aria-hidden="true">${escapeHtml(entry.emoji || '🚨')}</span>
          <span class="text-slate-700 min-w-0">
            <b class="text-slate-800">${escapeHtml(entry.user_name)}</b>
            ${t('admin.dare_log_did')} <span class="${isSpamPardon ? 'text-purple-700' : 'text-orange-700'} font-bold">${escapeHtml(entry.dare_text)}</span>
          </span>
        </div>
        <div class="flex items-center gap-3 shrink-0 ml-4">
          <span class="text-[10px] font-bold text-slate-500">${escapeHtml(formatSmartDate(entry.cleared_at))}</span>
          <button type="button" data-action="delete-dare-log" data-entry-id="${escapeHtml(entry.id)}" title="${t('common.delete')}" aria-label="${t('common.delete')}" class="text-slate-400 hover:text-red-600 transition-colors">${trashIcon('h-4 w-4')}</button>
        </div>
      </div>`;
  }).join('') : `<p class="text-xs italic text-slate-500 text-center py-4">${t('admin.dare_log_empty')}</p>`;
}

const trashIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" class="${size}" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;

async function loadPointsLog() {
  const response = await adminFetch('/api/admin/points-log');
  if (!response.ok) return;
  document.getElementById('admin-global-log').innerHTML = (await response.json()).map((point) => `
    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white transition-all group">
      <div class="flex items-center gap-3 text-sm">
        <span class="text-lg" aria-hidden="true">${escapeHtml(point.emoji)}</span>
        <span class="text-slate-700"><b class="text-slate-800">${escapeHtml(point.from_name)}</b> ${t('admin.global_log_gave')} <b class="text-slate-800">${escapeHtml(point.to_name)}</b></span>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-[10px] font-bold text-slate-500">${escapeHtml(formatSmartDate(point.created_at))}</span>
        <button type="button" data-action="delete-point" data-point-id="${escapeHtml(point.id)}" aria-label="${t('common.delete')}"
                class="text-red-400 hover:text-red-600 transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100">${trashIcon('h-5 w-5')}</button>
      </div>
    </div>`).join('');
}

async function copyMemberLink(userId) {
  const response = await adminAction(`/api/admin/users/${userId}/magic-link`, 'POST', 'common.error');
  if (!response) return;
  await navigator.clipboard.writeText((await response.json()).url).catch(() => null);
  uiToast(tText('admin.toast_link_copied'));
}

const nameOf = (userId) => state.users.get(userId)?.name ?? '';

async function confirmThen(messageKey, params, run) {
  if (await uiConfirm(tText(messageKey, params))) await run();
}

registerActions({
  'copy-invite-link': async () => {
    const input = document.getElementById('invite-link');
    input.select();
    await navigator.clipboard.writeText(input.value).catch(() => null);
    uiToast(tText('admin.invite_link_copied'));
  },
  'regenerate-invite': () => confirmThen('admin.invite_regen_confirm', {}, async () => {
    const response = await adminAction('/api/admin/regenerate-invite', 'POST', 'admin.invite_regen_error');
    if (!response) return;
    document.getElementById('invite-link').value = (await response.json()).url;
    uiToast(tText('admin.invite_regen_ok'));
  }),
  'copy-link': (button) => copyMemberLink(button.dataset.userId),
  'reveal-link': (button) => confirmThen('admin.reveal_confirm', {}, () => copyMemberLink(button.dataset.userId)),
  'resend-link': async (button) => {
    if (await adminAction(`/api/admin/users/${button.dataset.userId}/resend-link`, 'POST', 'admin.resend_error')) uiToast(tText('admin.resend_ok'));
  },
  'regenerate-link': (button) => confirmThen('admin.regen_confirm', { name: nameOf(button.dataset.userId) }, async () => {
    const response = await adminAction(`/api/admin/users/${button.dataset.userId}/regenerate-link`, 'POST', 'admin.regen_error');
    if (!response) return;
    const result = await response.json();
    if (result.is_self) setSessionToken(result.token);
    await navigator.clipboard.writeText(result.login_url).catch(() => null);
    uiToast(tText('admin.regen_ok', { url: result.login_url }));
    loadMembers();
  }),
  'deactivate-member': (button) => confirmThen('admin.confirm_deactivate_user', {}, async () => {
    await adminAction(`/api/admin/users/${button.dataset.userId}`, 'DELETE', 'common.error');
    loadMembers();
  }),
  'restore-member': (button) => confirmThen('admin.confirm_restore_user', {}, async () => {
    await adminAction(`/api/admin/users/${button.dataset.userId}/restore`, 'PATCH', 'common.error');
    loadMembers();
  }),
  'reject-member': (button) => confirmThen('admin.reject_confirm', { name: nameOf(button.dataset.userId) }, async () => {
    if (await adminAction(`/api/admin/users/${button.dataset.userId}/reject`, 'DELETE', 'admin.reject_error')) loadMembers();
  }),
  'pardon-spammer': (button) => confirmThen('admin.spammer_pardon_confirm', { name: state.spammers.get(button.dataset.userId)?.name ?? '' }, async () => {
    if (!await adminAction(`/api/admin/users/${button.dataset.userId}/pardon-spammer`, 'POST', 'admin.spammer_pardon_error')) return;
    uiToast(tText('admin.spammer_pardon_ok'));
    loadMembers();
    loadDareLog();
  }),
  'clear-dare': (button) => confirmThen('admin.confirm_clear_category', {
    cat: state.categories.get(button.dataset.categoryId)?.name ?? '', user: nameOf(button.dataset.userId),
  }, async () => {
    if (await adminAction(`/api/admin/clear-category/${button.dataset.userId}/${button.dataset.categoryId}`, 'POST', 'common.error')) {
      loadMembers();
      loadDareLog();
    }
  }),
  'deactivate-badge': (button) => confirmThen('admin.confirm_deactivate_badge', {}, async () => {
    await adminAction(`/api/admin/categories/${button.dataset.categoryId}`, 'DELETE', 'common.error');
    loadBadges();
  }),
  'restore-badge': (button) => confirmThen('admin.confirm_restore_badge', {}, async () => {
    await adminAction(`/api/admin/categories/${button.dataset.categoryId}/restore`, 'PATCH', 'common.error');
    loadBadges();
  }),
  'edit-rule': (button) => toggleRuleEdition(button.dataset.ruleId, true),
  'cancel-rule-edit': (button) => toggleRuleEdition(button.dataset.ruleId, false),
  'delete-rule': (button) => confirmThen('admin.rule_confirm_delete', {}, async () => {
    await adminAction(`/api/admin/rules/${button.dataset.ruleId}`, 'DELETE', 'common.error');
    loadRules();
  }),
  'delete-dare-log': (button) => confirmThen('admin.dare_log_delete_confirm', {}, async () => {
    if (await adminAction(`/api/admin/dare-log/${button.dataset.entryId}`, 'DELETE', 'common.access_denied')) loadDareLog();
  }),
  'delete-point': (button) => confirmThen('admin.confirm_delete_point', {}, async () => {
    if (!await adminAction(`/api/admin/points/${button.dataset.pointId}`, 'DELETE', 'common.error')) return;
    uiToast(tText('admin.toast_point_deleted'));
    loadPointsLog();
    loadMembers();
  }),
});

function onSubmit(formId, handler) {
  document.getElementById(formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    await handler(event.target);
  });
}

function wireForms() {
  onSubmit('invite-form', async (form) => {
    if (!await adminAction('/api/admin/invite', 'POST', 'admin.invite_email_invalid', { email: form.email.value.trim() })) return;
    form.reset();
    uiToast(tText('admin.invite_sent'));
  });
  onSubmit('add-member-form', async (form) => {
    const email = form.email.value.trim();
    if (!await adminAction('/api/admin/users', 'POST', 'admin.add_user_error', { name: form.name.value.trim(), email })) return;
    form.reset();
    loadMembers();
    if (email) uiToast(tText('admin.add_user_email_sent'));
  });
  onSubmit('add-badge-form', async (form) => {
    if (!await adminAction('/api/admin/categories', 'POST', 'admin.fill_required', { name: form.name.value.trim(), emoji: form.emoji.value.trim() })) return;
    form.reset();
    loadBadges();
  });
  onSubmit('add-rule-form', async (form) => {
    const body = { category_id: form.category_id.value, threshold: form.threshold.value, dare_text: form.dare_text.value.trim() };
    if (await adminAction('/api/admin/rules', 'POST', 'common.error', body)) loadRules();
  });
}

async function start() {
  applyI18n();
  const me = await requirePageRole(ADMIN_ROLES, 'admin.not_admin');
  if (!me) return;
  document.getElementById('admin-team-name').textContent = me.team_name || '?';
  revealRoleLinks(me);
  wireForms();
  document.getElementById('admin-body').classList.remove('opacity-0');
  await Promise.all([loadInviteLink(), loadMembers(), loadBadges(), loadRules(), loadDareLog(), loadPointsLog()]);
}

start();
