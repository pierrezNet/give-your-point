import { escapeHtml } from '../../core/html.js';
import { dateLocale, t, tText } from '../../core/i18n.js';
import { daysSince, parseSqlDate } from '../../core/dates.js';
import { RECENT_DAYS, activityLevel, daysSinceLastPoint, isCleanupCandidate } from './model.js';

const ACTIVITY_BADGES = {
  never: ['owner.activity_never', 'bg-slate-100 text-slate-600'],
  active: ['owner.activity_active', 'bg-emerald-100 text-emerald-800'],
  idle: ['owner.activity_idle', 'bg-amber-100 text-amber-800'],
  dormant: ['owner.activity_dormant', 'bg-slate-100 text-slate-600'],
};

export function relativeDate(value) {
  if (!value) return '—';
  const days = daysSince(value);
  if (days === 0) return tText('owner.date_today');
  if (days === 1) return tText('owner.date_yesterday');
  if (days < RECENT_DAYS) return tText('owner.date_n_days_ago', { n: days });
  return parseSqlDate(value).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function activityBadge(days) {
  const [key, colors] = ACTIVITY_BADGES[activityLevel(days)];
  return `<span class="text-xs font-black uppercase px-2 py-1 rounded-full ${colors}">${t(key)}</span>`;
}

export function companyRowHtml(company, ownCompanyId) {
  const days = daysSinceLastPoint(company);
  const isOwn = company.id === ownCompanyId;
  const cleanupCandidate = isCleanupCandidate(company, ownCompanyId);
  return `
    <tr class="border-b border-slate-100 ${company.active === 0 ? 'bg-slate-100' : ''} ${cleanupCandidate ? 'bg-amber-50' : ''}">
      <td class="p-3">
        <div class="font-bold text-slate-800">${escapeHtml(company.name)}</div>
        ${company.active === 0 ? `<div class="text-xs font-bold uppercase text-slate-600">${t('owner.company_disabled')}</div>` : ''}
        ${cleanupCandidate ? `<div class="text-xs font-black uppercase text-amber-700">🧹 ${t('owner.cleanup_flag')}</div>` : ''}
      </td>
      <td class="p-3 text-sm text-slate-600">${company.admins ? escapeHtml(company.admins) : '<i class="text-slate-600">—</i>'}</td>
      <td class="p-3 text-center text-sm font-bold">${escapeHtml(company.team_count)}</td>
      <td class="p-3 text-center text-sm font-bold">${escapeHtml(company.member_count)}</td>
      <td class="p-3 text-center text-sm hidden md:table-cell">${escapeHtml(company.total_points)}</td>
      <td class="p-3 text-center text-sm font-bold ${company.points_last_7d > 0 ? 'text-emerald-700' : 'text-slate-600'}">${escapeHtml(company.points_last_7d)}</td>
      <td class="p-3 text-xs hidden lg:table-cell"><div class="flex items-center gap-2">${activityBadge(days)}<span class="text-slate-600">${escapeHtml(relativeDate(company.last_point_at))}</span></div></td>
      <td class="p-3 text-xs text-slate-600 hidden lg:table-cell">${escapeHtml(relativeDate(company.created_at))}</td>
      <td class="p-3 text-right whitespace-nowrap">
        ${isOwn
          ? `<span class="text-xs font-bold uppercase text-slate-600">${t('owner.your_company')}</span>`
          : `<button type="button" data-action="delete-company" data-company-id="${escapeHtml(company.id)}" class="text-xs font-black uppercase text-red-700 hover:text-red-800 hover:underline">🗑 ${t('owner.delete')}</button>`}
      </td>
    </tr>`;
}

