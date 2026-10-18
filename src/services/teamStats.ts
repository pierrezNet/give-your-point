import { detectSpammers, SPAM_WINDOW_DAYS, type SpamStatus } from '../domain/spam';
import type { DareRule, PointTotal } from '../domain/dares';
import { buildLeaderboard, type LeaderboardEntry } from '../domain/leaderboard';

export async function computeSpammers(db: D1Database, teamId: string): Promise<Map<string, SpamStatus>> {
  const window = `-${SPAM_WINDOW_DAYS} days`;
  const [givenRes, receivedRes, usersRes, pardonRes] = await Promise.all([
    db.prepare("SELECT from_user_id AS uid, COUNT(*) as n FROM points_log WHERE team_id = ? AND created_at >= datetime('now', ?) GROUP BY from_user_id").bind(teamId, window).all<{ uid: string; n: number }>(),
    db.prepare("SELECT to_user_id AS uid, COUNT(*) as n FROM points_log WHERE team_id = ? AND created_at >= datetime('now', ?) GROUP BY to_user_id").bind(teamId, window).all<{ uid: string; n: number }>(),
    db.prepare('SELECT id, name FROM users WHERE active = 1 AND team_id = ?').bind(teamId).all<{ id: string; name: string }>(),
    db.prepare("SELECT DISTINCT user_id FROM dare_log WHERE team_id = ? AND category_id IS NULL AND cleared_at >= datetime('now', ?)").bind(teamId, window).all<{ user_id: string }>(),
  ]);
  return detectSpammers({
    activeUsers: usersRes.results ?? [],
    givenByUser: new Map((givenRes.results ?? []).map((row) => [row.uid, row.n])),
    receivedByUser: new Map((receivedRes.results ?? []).map((row) => [row.uid, row.n])),
    pardonedUserIds: new Set((pardonRes.results ?? []).map((row) => row.user_id)),
  });
}

const RECEIVED_SINCE_LAST_CLEARED_DARE = `p.created_at > IFNULL((
  SELECT MAX(d.cleared_at) FROM dare_log d
  WHERE d.team_id = p.team_id AND d.user_id = p.to_user_id AND d.category_id = p.category_id
), '')`;

export async function fetchPointTotals(db: D1Database, teamId: string): Promise<PointTotal[]> {
  const { results } = await db.prepare(`
    SELECT p.to_user_id, p.category_id, COUNT(*) as total FROM points_log p
    WHERE p.team_id = ? AND ${RECEIVED_SINCE_LAST_CLEARED_DARE}
    GROUP BY p.to_user_id, p.category_id
  `).bind(teamId).all<PointTotal>();
  return results ?? [];
}

export async function countPointsTowardsDare(db: D1Database, teamId: string, userId: string, categoryId: string): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) as count FROM points_log p
    WHERE p.team_id = ? AND p.to_user_id = ? AND p.category_id = ? AND ${RECEIVED_SINCE_LAST_CLEARED_DARE}
  `).bind(teamId, userId, categoryId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function fetchDareRules(db: D1Database, teamId: string): Promise<DareRule[]> {
  const { results } = await db.prepare('SELECT * FROM dare_rules WHERE team_id = ?').bind(teamId).all<DareRule>();
  return results ?? [];
}

export async function getTeamLeaderboard(db: D1Database, teamId: string): Promise<LeaderboardEntry[]> {
  const [categoriesRes, pointTotals, rules, usersRes, spamStatuses] = await Promise.all([
    db.prepare('SELECT id, name, emoji FROM categories WHERE team_id = ?').bind(teamId).all<{ id: string; name: string; emoji: string }>(),
    fetchPointTotals(db, teamId),
    fetchDareRules(db, teamId),
    db.prepare('SELECT id, name FROM users WHERE active = 1 AND team_id = ?').bind(teamId).all<{ id: string; name: string }>(),
    computeSpammers(db, teamId),
  ]);
  const spammerIds = new Set([...spamStatuses].filter(([, status]) => status.flagged).map(([userId]) => userId));
  return buildLeaderboard({ users: usersRes.results ?? [], categories: categoriesRes.results ?? [], pointTotals, rules, spammerIds });
}

export async function teamActivityFingerprint(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) FROM points_log WHERE team_id = ?1) || '|' ||
      (SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) FROM dare_log WHERE team_id = ?1) AS fingerprint
  `).bind(teamId).first<{ fingerprint: string }>();
  return row?.fingerprint ?? '';
}
