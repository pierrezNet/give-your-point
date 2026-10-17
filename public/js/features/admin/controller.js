import { tText } from '../../core/i18n.js';
import { setSessionToken } from '../../core/session.js';
import { listOf, run } from '../../core/consoleRequests.js';
import { registerActions } from '../../core/actions.js';
import { uiConfirm, uiToast } from '../../core/dialogs.js';
import { adminApi } from './api.js';
import { memberRowHtml, pendingBannerHtml, spamBannerHtml, spamWatchlist } from './members.view.js';
import { badgeCardHtml, badgeOptionsHtml } from './badges.view.js';
import { ruleHtml } from './rules.view.js';
import { dareLogHtml, pointsLogHtml } from './logs.view.js';

const state = { members: new Map(), categories: new Map(), spammers: new Map() };
const byId = (id) => document.getElementById(id);

async function confirmThen(messageKey, params, action) {
  if (await uiConfirm(tText(messageKey, params))) await action();
}

const memberName = (userId) => state.members.get(userId)?.name ?? '';

async function loadMembers() {
  const [members, dares, categories, spammers] = await Promise.all([
    listOf(adminApi.members()), listOf(adminApi.activeDares()), listOf(adminApi.teamCategories()), listOf(adminApi.spammers()),
  ]);
  state.members = new Map(members.map((member) => [member.id, member]));
  state.categories = new Map(categories.map((category) => [category.id, category]));
  const watched = spamWatchlist(spammers);
  state.spammers = new Map(watched.map((spammer) => [spammer.userId, spammer]));
  byId('spam-banner').innerHTML = spamBannerHtml(watched);
  byId('pending-banner').innerHTML = pendingBannerHtml(members.filter((member) => member.active !== 1 && !member.has_activity).length);
  byId('admin-users-list').innerHTML = members.map((member) => memberRowHtml(member, { dares, categories })).join('');
}

async function loadInviteLink() {
  const invite = await run(adminApi.inviteLink());
  if (invite) byId('invite-link').value = invite.url;
}

async function loadBadges() {
  const badges = await listOf(adminApi.badges());
  byId('admin-categories-list').innerHTML = badges.map(badgeCardHtml).join('');
  byId('rule-cat').innerHTML = badgeOptionsHtml(badges);
}

async function loadRules() {
  byId('rules-list').innerHTML = (await listOf(adminApi.rules())).map(ruleHtml).join('');
}

const loadDareLog = async () => { byId('admin-dare-log').innerHTML = dareLogHtml(await listOf(adminApi.dareLog())); };
const loadPointsLog = async () => { byId('admin-global-log').innerHTML = pointsLogHtml(await listOf(adminApi.pointsLog())); };

function toggleRuleEdition(ruleId, editing) {
  const row = byId(`rule-row-${ruleId}`);
  row.querySelector('.rule-display').classList.toggle('hidden', editing);
  row.querySelector('.rule-edit').classList.toggle('hidden', !editing);
}

async function copyMemberLink(userId) {
  const link = await run(adminApi.magicLink(userId));
  if (!link) return;
  await navigator.clipboard.writeText(link.url).catch(() => null);
  uiToast(tText('admin.toast_link_copied'));
}

const ACTIONS = {
  'copy-invite-link': async () => {
    const input = byId('invite-link');
    input.select();
    await navigator.clipboard.writeText(input.value).catch(() => null);
    uiToast(tText('admin.invite_link_copied'));
  },
  'regenerate-invite': () => confirmThen('admin.invite_regen_confirm', {}, async () => {
    const invite = await run(adminApi.regenerateInvite(), 'admin.invite_regen_error');
    if (!invite) return;
    byId('invite-link').value = invite.url;
    uiToast(tText('admin.invite_regen_ok'));
  }),
  'copy-link': ({ dataset }) => copyMemberLink(dataset.userId),
  'reveal-link': ({ dataset }) => confirmThen('admin.reveal_confirm', {}, () => copyMemberLink(dataset.userId)),
  'resend-link': async ({ dataset }) => {
    if (await run(adminApi.resendLink(dataset.userId), 'admin.resend_error')) uiToast(tText('admin.resend_ok'));
  },
  'regenerate-link': ({ dataset }) => confirmThen('admin.regen_confirm', { name: memberName(dataset.userId) }, async () => {
    const regenerated = await run(adminApi.regenerateLink(dataset.userId), 'admin.regen_error');
    if (!regenerated) return;
    if (regenerated.is_self) setSessionToken(regenerated.token);
    await navigator.clipboard.writeText(regenerated.login_url).catch(() => null);
    uiToast(tText('admin.regen_ok', { url: regenerated.login_url }));
    loadMembers();
  }),
  'deactivate-member': ({ dataset }) => confirmThen('admin.confirm_deactivate_user', {}, async () => {
    await run(adminApi.deactivateMember(dataset.userId));
    loadMembers();
  }),
  'restore-member': ({ dataset }) => confirmThen('admin.confirm_restore_user', {}, async () => {
    await run(adminApi.restoreMember(dataset.userId));
    loadMembers();
  }),
  'reject-member': ({ dataset }) => confirmThen('admin.reject_confirm', { name: memberName(dataset.userId) }, async () => {
    if (await run(adminApi.rejectMember(dataset.userId), 'admin.reject_error')) loadMembers();
  }),
  'pardon-spammer': ({ dataset }) => confirmThen('admin.spammer_pardon_confirm', { name: state.spammers.get(dataset.userId)?.name ?? '' }, async () => {
    if (!await run(adminApi.pardonSpammer(dataset.userId), 'admin.spammer_pardon_error')) return;
    uiToast(tText('admin.spammer_pardon_ok'));
    loadMembers();
    loadDareLog();
  }),
  'clear-dare': ({ dataset }) => confirmThen('admin.confirm_clear_category', {
    cat: state.categories.get(dataset.categoryId)?.name ?? '', user: memberName(dataset.userId),
  }, async () => {
    if (!await run(adminApi.clearDare(dataset.userId, dataset.categoryId))) return;
    loadMembers();
    loadDareLog();
  }),
  'deactivate-badge': ({ dataset }) => confirmThen('admin.confirm_deactivate_badge', {}, async () => {
    await run(adminApi.deactivateBadge(dataset.categoryId));
    loadBadges();
  }),
  'restore-badge': ({ dataset }) => confirmThen('admin.confirm_restore_badge', {}, async () => {
    await run(adminApi.restoreBadge(dataset.categoryId));
    loadBadges();
  }),
  'edit-rule': ({ dataset }) => toggleRuleEdition(dataset.ruleId, true),
  'cancel-rule-edit': ({ dataset }) => toggleRuleEdition(dataset.ruleId, false),
  'delete-rule': ({ dataset }) => confirmThen('admin.rule_confirm_delete', {}, async () => {
    await run(adminApi.deleteRule(dataset.ruleId));
    loadRules();
  }),
  'delete-dare-log': ({ dataset }) => confirmThen('admin.dare_log_delete_confirm', {}, async () => {
    if (await run(adminApi.deleteDareLog(dataset.entryId), 'common.access_denied')) loadDareLog();
  }),
  'delete-point': ({ dataset }) => confirmThen('admin.confirm_delete_point', {}, async () => {
    if (!await run(adminApi.deletePoint(dataset.pointId))) return;
    uiToast(tText('admin.toast_point_deleted'));
    loadPointsLog();
    loadMembers();
  }),
};

const FORMS = {
  'invite-form': async (form) => {
    if (!await run(adminApi.sendInvite(form.email.value.trim()), 'admin.invite_email_invalid')) return;
    form.reset();
    uiToast(tText('admin.invite_sent'));
  },
  'add-member-form': async (form) => {
    const email = form.email.value.trim();
    if (!await run(adminApi.addMember({ name: form.name.value.trim(), email }), 'admin.add_user_error')) return;
    form.reset();
    loadMembers();
    if (email) uiToast(tText('admin.add_user_email_sent'));
  },
  'add-badge-form': async (form) => {
    if (!await run(adminApi.addBadge({ name: form.name.value.trim(), emoji: form.emoji.value.trim() }), 'admin.fill_required')) return;
    form.reset();
    loadBadges();
  },
  'add-rule-form': async (form) => {
    const rule = { category_id: form.category_id.value, threshold: form.threshold.value, dare_text: form.dare_text.value.trim() };
    if (await run(adminApi.addRule(rule))) loadRules();
  },
};

function wireForms() {
  for (const [formId, submit] of Object.entries(FORMS)) {
    byId(formId).addEventListener('submit', (event) => {
      event.preventDefault();
      submit(event.target);
    });
  }
  byId('rules-list').addEventListener('submit', async (event) => {
    const form = event.target.closest('form.rule-edit');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (await run(adminApi.updateRule(form.dataset.ruleId, { threshold: data.get('threshold'), dare_text: data.get('dare_text') }))) loadRules();
  });
}

export async function startAdminConsole(me) {
  byId('admin-team-name').textContent = me.team_name || '?';
  registerActions(ACTIONS);
  wireForms();
  byId('admin-body').classList.remove('opacity-0');
  await Promise.all([loadInviteLink(), loadMembers(), loadBadges(), loadRules(), loadDareLog(), loadPointsLog()]);
}
