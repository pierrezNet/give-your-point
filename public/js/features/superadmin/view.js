import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';

export function teamRowHtml(team) {
  const id = escapeHtml(team.id);
  const isActive = team.active === 1;
  return `
    <tr class="border-b border-slate-100 ${isActive ? '' : 'bg-slate-100'}">
      <td class="p-4">
        <div class="font-bold text-slate-800">${escapeHtml(team.name)}</div>
        ${isActive ? '' : `<div class="text-xs font-bold uppercase text-slate-600">${t('superadmin.team_disabled')}</div>`}
      </td>
      <td class="p-4 hidden md:table-cell text-sm text-slate-600">${team.admins ? escapeHtml(team.admins) : `<i class="text-slate-600">${t('superadmin.no_admin')}</i>`}</td>
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

function adminCardHtml(admin) {
  const roleColors = admin.role === 'superadmin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  return `
    <div class="flex items-center justify-between gap-2 bg-white rounded-lg p-3 border border-slate-100">
      <div class="text-sm">
        <span class="font-bold text-slate-800">${escapeHtml(admin.name)}</span>
        <span class="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-black uppercase ${roleColors}">${escapeHtml(admin.role)}</span>
        ${admin.active === 0 ? `<span class="ml-2 text-xs text-slate-600">${t('superadmin.user_disabled')}</span>` : ''}
      </div>
      <div class="flex gap-3 items-center shrink-0">
        <button type="button" data-action="copy-link" data-user-id="${escapeHtml(admin.id)}" class="text-xs font-black text-blue-700 hover:underline uppercase">${t('common.copy_link')}</button>
        <button type="button" data-action="demote" data-user-id="${escapeHtml(admin.id)}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('superadmin.btn_revoke')}</button>
      </div>
    </div>`;
}

export function adminsByTeamHtml(admins) {
  if (!admins.length) return `<p class="text-sm italic text-slate-600 py-4">${t('superadmin.no_admins_yet')}</p>`;
  const byTeam = admins.reduce((groups, admin) => groups.set(admin.team_name, [...(groups.get(admin.team_name) ?? []), admin]), new Map());
  return [...byTeam].map(([teamName, members]) => `
    <div class="bg-slate-50 rounded-xl border border-slate-100 p-4">
      <h3 class="font-black text-xs uppercase tracking-widest text-slate-600 mb-3">${t('superadmin.team_label')} ${escapeHtml(teamName)}</h3>
      <div class="space-y-2">${members.map(adminCardHtml).join('')}</div>
    </div>`).join('');
}

export const promotionChoicesText = (candidates) => candidates.map((user, index) => `${index + 1}. ${user.name} (${user.team_name})`).join('\n');
