import { tText } from '../../core/i18n.js';
import { registerActions } from '../../core/actions.js';
import { uiConfirm } from '../../core/dialogs.js';
import { listOf, run } from '../../core/consoleRequests.js';
import { ownerApi } from './api.js';
import { companyTotals, conversionRate, isCleanupCandidate } from './model.js';
import { companyRowHtml } from './view.js';

const FUNNEL_FIELDS = {
  'fn-landing': 'landing_vue', 'fn-onboarding': 'onboarding_soumis', 'fn-created': 'espaces_crees_30j',
  'fn-activated': 'espaces_actives_30j', 'fn-join-views': 'join_vue', 'fn-join-signups': 'join_soumis',
};

const state = { companies: [], ownCompanyId: null };
const setText = (id, value) => { document.getElementById(id).textContent = value; };

async function loadCompanies() {
  state.companies = await listOf(ownerApi.companies());
  const totals = companyTotals(state.companies);
  setText('agg-companies', totals.companies);
  setText('agg-teams', totals.teams);
  setText('agg-members', totals.members);
  setText('agg-points-7d', totals.points7d);
  document.getElementById('companies-list').innerHTML = state.companies.map((company) => companyRowHtml(company, state.ownCompanyId)).join('');
  const cleanupCount = state.companies.filter((company) => isCleanupCandidate(company, state.ownCompanyId)).length;
  setText('cleanup-caption', cleanupCount ? tText('owner.cleanup_count', { n: cleanupCount }) : '');
}

async function loadFunnel() {
  const funnel = await run(ownerApi.funnel());
  if (!funnel) return;
  for (const [elementId, field] of Object.entries(FUNNEL_FIELDS)) setText(elementId, funnel[field]);
  setText('fn-onboarding-rate', conversionRate(funnel.onboarding_soumis, funnel.landing_vue));
  setText('fn-created-rate', conversionRate(funnel.espaces_crees_30j, funnel.onboarding_soumis));
  setText('fn-activated-rate', conversionRate(funnel.espaces_actives_30j, funnel.espaces_crees_30j));
}

async function deleteCompany({ dataset }) {
  const company = state.companies.find((candidate) => candidate.id === dataset.companyId);
  if (!company) return;
  const confirmed = await uiConfirm(tText('owner.delete_confirm', {
    name: company.name, teams: company.team_count, members: company.member_count, points: company.total_points,
  }));
  if (confirmed && await run(ownerApi.deleteCompany(company.id), 'owner.delete_error')) loadCompanies();
}

async function deactivateCompany({ dataset }) {
  const company = state.companies.find((candidate) => candidate.id === dataset.companyId);
  if (!company || !await uiConfirm(tText('owner.deactivate_confirm', { name: company.name }))) return;
  if (await run(ownerApi.setCompanyActive(company.id, false), 'owner.status_error')) loadCompanies();
}

async function reactivateCompany({ dataset }) {
  if (await run(ownerApi.setCompanyActive(dataset.companyId, true), 'owner.status_error')) loadCompanies();
}

export async function startOwnerConsole(me) {
  state.ownCompanyId = me.company_id;
  registerActions({ 'delete-company': deleteCompany, 'deactivate-company': deactivateCompany, 'reactivate-company': reactivateCompany });
  document.getElementById('owner-body').classList.remove('opacity-0');
  await Promise.all([loadCompanies(), loadFunnel()]);
}
