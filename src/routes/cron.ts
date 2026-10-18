import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../http/errors';
import { rotateForWeek, summarizeWeek, type WeeklyPoint } from '../domain/digest';
import { buildDigestEmail } from '../email/templates';
import { sendEmail } from '../services/email';
import { appBaseUrl } from '../services/links';

const MAX_DIGEST_EMAILS_PER_RUN = 200;

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([provided, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(a, b);
}

export const cronRoutes = new Hono<AppEnv>();

cronRoutes.post('/api/cron/weekly-digest', async (c) => {
  const header = c.req.header('Authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!c.env.CRON_SECRET || !await secretsMatch(provided, c.env.CRON_SECRET)) return apiError(c, 'UNAUTHENTICATED');

  const db = c.env.DB;
  const dryRun = c.req.query('dry') === '1';
  const baseUrl = appBaseUrl(c);
  const teams = await db.prepare(`
    SELECT t.id, t.name AS team_name FROM teams t JOIN companies co ON co.id = t.company_id
    WHERE t.active = 1 AND co.active = 1 ORDER BY t.id
  `).all<{ id: string; team_name: string }>();

  let teamsWithActivity = 0;
  let emailsSent = 0;
  let processed = 0;
  const preview: { team: string; to: string; myReceived: number; subject: string }[] = [];

  for (const team of rotateForWeek(teams.results ?? [], new Date())) {
    const weekPoints = await db.prepare(`
      SELECT p.to_user_id, p.category_id, c.name AS cat_name, c.emoji, u.name AS to_name
      FROM points_log p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.to_user_id
      WHERE p.team_id = ? AND p.created_at >= datetime('now', '-7 days')
    `).bind(team.id).all<WeeklyPoint>();
    if (!weekPoints.results?.length) continue;
    teamsWithActivity++;

    const week = summarizeWeek(weekPoints.results);
    const [dares, members] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM dare_log WHERE team_id = ? AND category_id IS NOT NULL AND cleared_at >= datetime('now', '-7 days')").bind(team.id).first<{ n: number }>(),
      db.prepare("SELECT id, name, email, locale FROM users WHERE team_id = ? AND active = 1 AND email_verified = 1 AND email IS NOT NULL AND email != ''")
        .bind(team.id).all<{ id: string; name: string; email: string; locale: string | null }>(),
    ]);

    for (const member of members.results ?? []) {
      if (processed >= MAX_DIGEST_EMAILS_PER_RUN) break;
      processed++;
      const myReceived = week.receivedByUser.get(member.id) ?? 0;
      const { subject, html } = buildDigestEmail({
        baseUrl, isEn: member.locale === 'en', memberName: member.name, teamName: team.team_name,
        total: week.total, topUser: week.topUser, topCat: week.topCat, gages: dares?.n ?? 0, myReceived,
      });
      if (dryRun) {
        preview.push({ team: team.team_name, to: member.email, myReceived, subject });
      } else {
        await sendEmail(c.env, member.email, subject, html);
        emailsSent++;
      }
    }
  }

  return c.json({ ok: true, dryRun, teamsWithActivity, emailsSent, ...(dryRun && { wouldSend: preview.length, preview }) });
});
