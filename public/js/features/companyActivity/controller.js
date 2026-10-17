import { openModal } from '../../core/dialogs.js';
import { registerActions } from '../../core/actions.js';
import { fetchTeamsActivity } from './api.js';
import { otherTeams } from './model.js';
import { activityPillHtml, companyActivityHtml } from './view.js';

export async function startCompanyActivity() {
  const activity = await fetchTeamsActivity();
  const teams = otherTeams(activity);
  if (!teams.length) return;
  const pill = document.getElementById('company-activity-pill');
  pill.innerHTML = activityPillHtml(teams[0]);
  pill.classList.replace('hidden', 'inline-flex');
  registerActions({
    'show-company-activity': () => openModal({ id: 'company-modal', content: companyActivityHtml(activity.company_name, teams) }),
  });
}
