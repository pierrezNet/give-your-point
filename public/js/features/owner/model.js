import { daysSince } from '../../core/dates.js';

export const ACTIVE_DAYS = 7;
export const IDLE_DAYS = 30;
export const RECENT_DAYS = 7;

export const daysSinceLastPoint = (company) => (company.last_point_at ? daysSince(company.last_point_at) : null);

export function isCleanupCandidate(company, ownCompanyId) {
  const days = daysSinceLastPoint(company);
  return company.id !== ownCompanyId && (days === null || days > IDLE_DAYS);
}

export function activityLevel(days) {
  if (days === null) return 'never';
  if (days <= ACTIVE_DAYS) return 'active';
  if (days <= IDLE_DAYS) return 'idle';
  return 'dormant';
}

export function companyTotals(companies) {
  const sum = (field) => companies.reduce((total, company) => total + (company[field] || 0), 0);
  return { companies: companies.length, teams: sum('team_count'), members: sum('member_count'), points7d: sum('points_last_7d') };
}

export const conversionRate = (numerator, denominator) => (denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : '—');
