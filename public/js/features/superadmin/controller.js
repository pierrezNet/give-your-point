import { tText } from '../../core/i18n.js';
import { registerActions } from '../../core/actions.js';
import { uiConfirm, uiPrompt, uiToast } from '../../core/dialogs.js';
import { listOf, run } from '../../core/consoleRequests.js';
import { superadminApi } from './api.js';
import { adminsByTeamHtml, promotionChoicesText, teamRowHtml } from './view.js';

const state = { teams: new Map(), admins: new Map() };
const byId = (id) => document.getElementById(id);
const teamName = (teamId) => state.teams.get(teamId)?.name ?? '';

async function loadTeams() {
  const teams = await listOf(superadminApi.teams());
  state.teams = new Map(teams.map((team) => [team.id, team]));
  byId('teams-list').innerHTML = teams.map(teamRowHtml).join('');
}

async function loadAdmins() {
  const admins = await listOf(superadminApi.admins());
  state.admins = new Map(admins.map((admin) => [admin.id, admin]));
  byId('admins-list').innerHTML = adminsByTeamHtml(admins);
}

const reload = () => Promise.all([loadTeams(), loadAdmins()]);

async function promptTrimmed(messageKey, params, defaultValue) {
  return (await uiPrompt(tText(messageKey, params), defaultValue))?.trim() ?? '';
}

async function addMember(teamId) {
  const team = teamName(teamId);
  const name = await promptTrimmed('superadmin.prompt_add_member_intro', { team });
  if (!name) return;
  const email = await promptTrimmed('superadmin.prompt_add_member_email', { name });
  const role = await uiConfirm(tText('superadmin.confirm_make_admin', { name, team })) ? 'admin' : 'member';
  const created = await run(superadminApi.addMember(teamId, { name, email, role }));
  if (!created) return;
  if (await uiConfirm(tText('superadmin.member_created_link', { name, url: created.login_url }))) {
    await navigator.clipboard.writeText(created.login_url).catch(() => null);
  }
  reload();
}

async function promoteMember() {
  const candidates = (await listOf(superadminApi.members())).filter((user) => user.role === 'member' && user.active === 1);
  if (!candidates.length) {
    uiToast(tText('superadmin.no_member_to_promote'));
    return;
  }
  const choice = Number.parseInt(await uiPrompt(tText('superadmin.prompt_promote_pick', { choices: promotionChoicesText(candidates) })), 10);
  const target = candidates[choice - 1];
  if (!target) return;
  const role = await uiConfirm(tText('superadmin.confirm_promote', { name: target.name, team: target.team_name })) ? 'superadmin' : 'admin';
  if (await run(superadminApi.promote(target.id, role))) reload();
}

const ACTIONS = {
  'create-team': async () => {
    const name = await promptTrimmed('superadmin.prompt_create_team');
    if (name && await run(superadminApi.createTeam(name))) loadTeams();
  },
  'add-member': ({ dataset }) => addMember(dataset.teamId),
  'rename-team': async ({ dataset }) => {
    const current = teamName(dataset.teamId);
    const name = await promptTrimmed('superadmin.prompt_new_team_name', {}, current);
    if (name && name !== current && await run(superadminApi.renameTeam(dataset.teamId, name))) loadTeams();
  },
  'deactivate-team': async ({ dataset }) => {
    if (await uiConfirm(tText('superadmin.confirm_deactivate_team')) && await run(superadminApi.deactivateTeam(dataset.teamId))) loadTeams();
  },
  'restore-team': async ({ dataset }) => {
    if (await uiConfirm(tText('superadmin.confirm_restore_team')) && await run(superadminApi.restoreTeam(dataset.teamId))) loadTeams();
  },
  'copy-link': async ({ dataset }) => {
    const link = await run(superadminApi.magicLink(dataset.userId));
    if (!link) return;
    await navigator.clipboard.writeText(link.url).catch(() => null);
    uiToast(tText('superadmin.toast_link_copied'));
  },
  demote: async ({ dataset }) => {
    const admin = state.admins.get(dataset.userId);
    if (await uiConfirm(tText('superadmin.confirm_revoke', { role: admin?.role ?? '', name: admin?.name ?? '' })) && await run(superadminApi.demote(dataset.userId))) reload();
  },
  'promote-member': promoteMember,
};

export async function startSuperadminConsole(me) {
  byId('superadmin-company-name').textContent = me.company_name || me.team_name || tText('superadmin.label_default_space');
  registerActions(ACTIONS);
  byId('superadmin-body').classList.remove('opacity-0');
  await reload();
}
