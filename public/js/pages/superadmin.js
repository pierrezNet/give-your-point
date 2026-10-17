import { applyI18n, t, tText } from '../core/i18n.js';
import { SUPERADMIN_ROLES, authFetch, postJson } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { errorMessageOf } from '../core/api.js';
import { registerActions } from '../core/actions.js';
import { uiConfirm, uiPrompt, uiToast } from '../core/dialogs.js';
import { requirePageRole, revealRoleLinks } from '../core/guard.js';

const state = { teams: new Map(), admins: new Map() };

async function superadminFetch(url, options) {
  const response = await authFetch(url, options);
  if (response.status === 401) {
    uiToast(tText('common.access_denied'));
    location.href = '/';
  }
  return response;
}

async function superadminAction(url, method, body) {
  const response = body === undefined ? await superadminFetch(url, { method }) : await postJson(url, body, method);
  if (!response.ok) uiToast(await errorMessageOf(response, 'common.error'));
  return response.ok ? response : null;
}

function teamRowHtml(team) {
  const id = escapeHtml(team.id);
  const isActive = team.active === 1;
  return `
    <tr class="border-b border-slate-100 ${isActive ? '' : 'opacity-50'}">
      <td class="p-4">
        <div class="font-bold text-slate-800">${escapeHtml(team.name)}</div>
        ${isActive ? '' : `<div class="text-[10px] font-bold uppercase text-slate-500">${t('superadmin.team_disabled')}</div>`}
      </td>
      <td class="p-4 hidden md:table-cell text-sm text-slate-600">${team.admins ? escapeHtml(team.admins) : `<i class="text-slate-500">${t('superadmin.no_admin')}</i>`}</td>
      <td class="p-4 hidden sm:table-cell text-sm">${escapeHtml(team.member_count)}</td>
      <td class="p-4">
        <div class="flex justify-end items-center gap-2 flex-wrap">
          ${isActive ? `
            <button type="button" data-action="add-member" data-team-id="${id}" class="text-xs font-black text-emerald-700 hover:underline uppercase">${t('superadmin.btn_add_member')}</button>
            <button type="button" data-action="rename-team" data-team-id="${id}" class="text-xs font-black text-blue-700 hover:underline uppercase">${t('common.rename')}</button>
            <button type="button" data-action="deactivate-team" data-team-id="${id}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('common.deactivate')}</button>
          ` : `<button type="button" data-action="restore-team" data-team-id="${id}" class="text-xs font-black text-emerald-700 uppercase">${t('common.restore')}</button>`}
        </div>
      </td>
    </tr>`;
}

async function loadTeams() {
  const teams = await (await superadminFetch('/api/superadmin/teams')).json();
  state.teams = new Map(teams.map((team) => [team.id, team]));
  document.getElementById('teams-list').innerHTML = teams.map(teamRowHtml).join('');
}

function adminCardHtml(admin) {
  const roleColors = admin.role === 'superadmin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  return `
    <div class="flex items-center justify-between gap-2 bg-white rounded-lg p-3 border border-slate-100">
      <div class="text-sm">
        <span class="font-bold text-slate-800">${escapeHtml(admin.name)}</span>
        <span class="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${roleColors}">${escapeHtml(admin.role)}</span>
        ${admin.active === 0 ? `<span class="ml-2 text-[10px] text-slate-500">${t('superadmin.user_disabled')}</span>` : ''}
      </div>
      <div class="flex gap-3 items-center shrink-0">
        <button type="button" data-action="copy-link" data-user-id="${escapeHtml(admin.id)}" class="text-xs font-black text-blue-700 hover:underline uppercase">${t('common.copy_link')}</button>
        <button type="button" data-action="demote" data-user-id="${escapeHtml(admin.id)}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('superadmin.btn_revoke')}</button>
      </div>
    </div>`;
}

async function loadAdmins() {
  const admins = await (await superadminFetch('/api/superadmin/admins')).json();
  state.admins = new Map(admins.map((admin) => [admin.id, admin]));
  const list = document.getElementById('admins-list');
  if (!admins.length) {
    list.innerHTML = `<p class="text-sm italic text-slate-500 py-4">${t('superadmin.no_admins_yet')}</p>`;
    return;
  }
  const byTeam = admins.reduce((groups, admin) => groups.set(admin.team_name, [...(groups.get(admin.team_name) ?? []), admin]), new Map());
  list.innerHTML = [...byTeam].map(([teamName, members]) => `
    <div class="bg-slate-50 rounded-xl border border-slate-100 p-4">
      <h3 class="font-black text-xs uppercase tracking-widest text-slate-600 mb-3">${t('superadmin.team_label')} ${escapeHtml(teamName)}</h3>
      <div class="space-y-2">${members.map(adminCardHtml).join('')}</div>
    </div>`).join('');
}

const reload = () => Promise.all([loadTeams(), loadAdmins()]);
const teamNameOf = (teamId) => state.teams.get(teamId)?.name ?? '';

async function addMember(teamId) {
  const team = teamNameOf(teamId);
  const name = (await uiPrompt(tText('superadmin.prompt_add_member_intro', { team })))?.trim();
  if (!name) return;
  const email = (await uiPrompt(tText('superadmin.prompt_add_member_email', { name })))?.trim() ?? '';
  const makeAdmin = await uiConfirm(tText('superadmin.confirm_make_admin', { name, team }));
  const response = await superadminAction(`/api/superadmin/teams/${teamId}/users`, 'POST', { name, email, role: makeAdmin ? 'admin' : 'member' });
  if (!response) return;
  const { login_url: loginUrl } = await response.json();
  if (await uiConfirm(tText('superadmin.member_created_link', { name, url: loginUrl }))) {
    await navigator.clipboard.writeText(loginUrl).catch(() => null);
  }
  reload();
}

async function promoteMember() {
  const users = await (await superadminFetch('/api/superadmin/users')).json();
  const candidates = users.filter((user) => user.role === 'member' && user.active === 1);
  if (!candidates.length) {
    uiToast(tText('superadmin.no_member_to_promote'));
    return;
  }
  const choices = candidates.map((user, index) => `${index + 1}. ${user.name} (${user.team_name})`).join('\n');
  const target = candidates[Number.parseInt(await uiPrompt(tText('superadmin.prompt_promote_pick', { choices })), 10) - 1];
  if (!target) return;
  const role = await uiConfirm(tText('superadmin.confirm_promote', { name: target.name, team: target.team_name })) ? 'superadmin' : 'admin';
  if (await superadminAction(`/api/superadmin/users/${target.id}/promote`, 'POST', { role })) reload();
}

registerActions({
  'create-team': async () => {
    const name = (await uiPrompt(tText('superadmin.prompt_create_team')))?.trim();
    if (name && await superadminAction('/api/superadmin/teams', 'POST', { name })) loadTeams();
  },
  'add-member': (button) => addMember(button.dataset.teamId),
  'rename-team': async (button) => {
    const current = teamNameOf(button.dataset.teamId);
    const name = (await uiPrompt(tText('superadmin.prompt_new_team_name'), current))?.trim();
    if (name && name !== current && await superadminAction(`/api/superadmin/teams/${button.dataset.teamId}`, 'PATCH', { name })) loadTeams();
  },
  'deactivate-team': async (button) => {
    if (await uiConfirm(tText('superadmin.confirm_deactivate_team')) && await superadminAction(`/api/superadmin/teams/${button.dataset.teamId}`, 'DELETE')) loadTeams();
  },
  'restore-team': async (button) => {
    if (await uiConfirm(tText('superadmin.confirm_restore_team')) && await superadminAction(`/api/superadmin/teams/${button.dataset.teamId}/restore`, 'PATCH')) loadTeams();
  },
  'copy-link': async (button) => {
    const response = await superadminAction(`/api/superadmin/users/${button.dataset.userId}/magic-link`, 'POST');
    if (!response) return;
    await navigator.clipboard.writeText((await response.json()).url).catch(() => null);
    uiToast(tText('superadmin.toast_link_copied'));
  },
  demote: async (button) => {
    const admin = state.admins.get(button.dataset.userId);
    if (await uiConfirm(tText('superadmin.confirm_revoke', { role: admin?.role ?? '', name: admin?.name ?? '' }))
      && await superadminAction(`/api/superadmin/users/${button.dataset.userId}/demote`, 'POST')) reload();
  },
  'promote-member': promoteMember,
});

async function start() {
  applyI18n();
  const me = await requirePageRole(SUPERADMIN_ROLES, 'superadmin.not_superadmin');
  if (!me) return;
  document.getElementById('superadmin-company-name').textContent = me.company_name || me.team_name || tText('superadmin.label_default_space');
  revealRoleLinks(me);
  document.getElementById('superadmin-body').classList.remove('opacity-0');
  await reload();
}

start();
