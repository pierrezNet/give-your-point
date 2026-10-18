import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { requireUser } from '../middleware/auth';
import { apiError, readJsonObject, type ApiErrorCode, type ErrorParams } from '../http/errors';
import {
  DUPLICATE_WINDOW_MINUTES, MAX_POINTS_PER_DAY, MAX_POINTS_PER_RECIPIENT_PER_DAY, REASON_EDIT_WINDOW_SECONDS, UNDO_WINDOW_SECONDS,
  findPointRefusal, normalizeReason, startOfQuotaDay, type PointRefusal,
} from '../domain/pointRules';
import { dareProgressAfterPoint } from '../domain/dares';
import { buildPointEmail } from '../email/templates';
import { computeSpammers, countPointsTowardsDare } from '../services/teamStats';
import { sendInBackground } from '../services/email';
import { pointNotification, sendPushToUser } from '../services/push';
import { announceDare } from '../services/dares';
import { appBaseUrl } from '../services/links';

interface Recipient {
  id: string;
  name: string;
  team_id: string;
  active: number;
  email: string | null;
  email_verified: number;
  locale: string | null;
}

const REFUSAL_ERROR: Record<PointRefusal, { code: ApiErrorCode; params: (recipient: Recipient) => ErrorParams | undefined }> = {
  DUPLICATE: { code: 'DUPLICATE_POINT', params: () => undefined },
  DAILY_LIMIT: { code: 'DAILY_LIMIT', params: () => ({ max: MAX_POINTS_PER_DAY }) },
  RECIPIENT_DAILY_LIMIT: { code: 'RECIPIENT_DAILY_LIMIT', params: (recipient) => ({ name: recipient.name, max: MAX_POINTS_PER_RECIPIENT_PER_DAY }) },
  SPAMMER_FROZEN: { code: 'SPAMMER_FROZEN', params: () => undefined },
};

async function giverActivity(c: AppContext, recipientId: string, categoryId: string) {
  const giver = c.get('user');
  const quotaDayStart = startOfQuotaDay(new Date());
  const [recentDuplicate, givenToday, givenToRecipientToday, spamStatuses] = await Promise.all([
    c.env.DB.prepare(`
      SELECT 1 FROM points_log
      WHERE from_user_id = ? AND to_user_id = ? AND category_id = ? AND created_at >= datetime('now', ?)
    `).bind(giver.id, recipientId, categoryId, `-${DUPLICATE_WINDOW_MINUTES} minutes`).first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND created_at >= ?")
      .bind(giver.id, quotaDayStart).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND to_user_id = ? AND created_at >= ?")
      .bind(giver.id, recipientId, quotaDayStart).first<{ count: number }>(),
    computeSpammers(c.env.DB, giver.team_id),
  ]);
  return {
    sameBadgeToRecipientRecently: !!recentDuplicate,
    givenToday: givenToday?.count ?? 0,
    givenToRecipientToday: givenToRecipientToday?.count ?? 0,
    isFlaggedSpammer: spamStatuses.get(giver.id)?.flagged ?? false,
  };
}

async function dareProgressFor(c: AppContext, recipientId: string, categoryId: string) {
  const teamId = c.get('user').team_id;
  const [count, rules] = await Promise.all([
    countPointsTowardsDare(c.env.DB, teamId, recipientId, categoryId),
    c.env.DB.prepare('SELECT dare_text, threshold FROM dare_rules WHERE team_id = ? AND category_id = ? ORDER BY threshold ASC')
      .bind(teamId, categoryId).all<{ dare_text: string; threshold: number }>(),
  ]);
  return dareProgressAfterPoint(count, rules.results ?? []);
}

function notifyRecipient(c: AppContext, recipient: Recipient, category: { id: string; name: string; emoji: string }, triggeredDare: string | null) {
  const giver = c.get('user');
  if (triggeredDare) {
    c.executionCtx.waitUntil(announceDare(c, { teamId: giver.team_id, member: recipient, category, dare: triggeredDare, givenBy: giver.name }).catch(() => {}));
    return;
  }
  const badge = `${category.emoji} ${category.name}`;
  c.executionCtx.waitUntil(sendPushToUser(c.env, recipient.id, (language) => pointNotification({ language, fromName: giver.name, badge })).catch(() => {}));
  if (!recipient.email || !recipient.email_verified) return;
  sendInBackground(c, recipient.email, buildPointEmail({ isEn: recipient.locale === 'en', name: recipient.name, fromName: giver.name, catLabel: badge, baseUrl: appBaseUrl(c) }));
}

export const pointRoutes = new Hono<AppEnv>();

pointRoutes.post('/api/points', requireUser, async (c) => {
  const giver = c.get('user');
  const body = await readJsonObject(c);
  const recipientId = String(body.to_user_id ?? '');
  const categoryId = String(body.category_id ?? '');
  if (recipientId === giver.id) return apiError(c, 'SELF_POINT');

  const recipient = await c.env.DB.prepare('SELECT id, name, team_id, active, email, email_verified, locale FROM users WHERE id = ?')
    .bind(recipientId).first<Recipient>();
  if (recipient?.active !== 1 || recipient.team_id !== giver.team_id) return apiError(c, 'RECIPIENT_NOT_IN_TEAM');

  const category = await c.env.DB.prepare('SELECT id, name, emoji FROM categories WHERE id = ? AND team_id = ? AND active = 1')
    .bind(categoryId, giver.team_id).first<{ id: string; name: string; emoji: string }>();
  if (!category) return apiError(c, 'CATEGORY_NOT_IN_TEAM');

  const refusal = findPointRefusal(await giverActivity(c, recipientId, categoryId));
  if (refusal) return apiError(c, REFUSAL_ERROR[refusal].code, REFUSAL_ERROR[refusal].params(recipient));

  const inserted = await c.env.DB.prepare('INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, reason) VALUES (?, ?, ?, ?, ?)')
    .bind(giver.team_id, giver.id, recipientId, categoryId, normalizeReason(body.reason)).run();

  const progress = await dareProgressFor(c, recipientId, categoryId);
  const gageTriggered = progress?.kind === 'triggered' ? { name: recipient.name, dare: progress.dare } : null;
  const gageWarning = progress?.kind === 'warning' ? { name: recipient.name } : null;
  notifyRecipient(c, recipient, category, gageTriggered?.dare ?? null);

  return c.json({ success: true, pointId: inserted.meta.last_row_id, gageTriggered, gageWarning });
});

pointRoutes.patch('/api/points/:id/reason', requireUser, async (c) => {
  const reason = normalizeReason((await readJsonObject(c)).reason);
  if (!reason) return apiError(c, 'REASON_INVALID');
  const result = await c.env.DB.prepare(`
    UPDATE points_log SET reason = ?
    WHERE id = ? AND from_user_id = ? AND created_at >= datetime('now', ?)
  `).bind(reason, c.req.param('id'), c.get('user').id, `-${REASON_EDIT_WINDOW_SECONDS} seconds`).run();
  if (result.meta.changes === 0) return apiError(c, 'REASON_EDIT_EXPIRED');
  return c.json({ success: true });
});

pointRoutes.post('/api/points/undo', requireUser, async (c) => {
  const result = await c.env.DB.prepare(`
    DELETE FROM points_log WHERE id = (
      SELECT id FROM points_log WHERE from_user_id = ? AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC LIMIT 1
    )
  `).bind(c.get('user').id, `-${UNDO_WINDOW_SECONDS} seconds`).run();
  if (result.meta.changes === 0) return apiError(c, 'UNDO_EXPIRED');
  return c.json({ success: true });
});
