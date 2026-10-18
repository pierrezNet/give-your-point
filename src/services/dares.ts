import type { AppContext } from '../env';
import { ADMIN_ROLES } from '../domain/roles';
import { buildGageEmail } from '../email/templates';
import { sendInBackground } from './email';
import { sendPushToUser, adminDareNotification, dareNotification } from './push';
import { appBaseUrl } from './links';
import { sqlPlaceholders } from './users';

export interface DareMember {
  id: string;
  name: string;
  email: string | null;
  email_verified: number;
  locale: string | null;
}

export interface DareAnnouncement {
  teamId: string;
  member: DareMember;
  category: { name: string; emoji: string };
  dare: string;
  givenBy: string | null;
}

export async function announceDare(c: AppContext, { teamId, member, category, dare, givenBy }: DareAnnouncement): Promise<void> {
  const badge = `${category.emoji} ${category.name}`;
  const pushes = [sendPushToUser(c.env, member.id, (language) => dareNotification({ language, badge, dare }))];

  const { results: admins } = await c.env.DB.prepare(`
    SELECT id FROM users WHERE team_id = ? AND active = 1 AND id != ? AND role IN (${sqlPlaceholders(ADMIN_ROLES)})
  `).bind(teamId, member.id, ...ADMIN_ROLES).all<{ id: string }>();
  for (const admin of admins ?? []) {
    pushes.push(sendPushToUser(c.env, admin.id, (language) => adminDareNotification({ language, memberName: member.name, badge, dare })));
  }
  c.executionCtx.waitUntil(Promise.all(pushes).catch(() => {}));

  if (member.email && member.email_verified) {
    sendInBackground(c, member.email, buildGageEmail({
      isEn: member.locale === 'en', name: member.name, fromName: givenBy, catLabel: badge, dare, baseUrl: appBaseUrl(c),
    }));
  }
}
