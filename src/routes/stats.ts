import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv } from '../env';
import { requireUser, SSE_PATH } from '../middleware/auth';
import { dominantCategoryByTeam, personalStanding, type RankedTotal } from '../domain/stats';
import { getTeamLeaderboard, teamActivityFingerprint } from '../services/teamStats';

const SSE_TICK_MS = 10_000;
const SSE_FORCED_REFRESH_EVERY_TICKS = 6;
const RANKING_LIMIT = 50;
const DARE_LOG_LIMIT = 30;
const EVOLUTION_WEEKS = 12;
const PERIOD_DAYS: Record<string, number> = { '7': 7, '30': 30, all: 0 };
const DEFAULT_PERIOD = '30';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/api/users-stats', requireUser, async (c) => c.json(await getTeamLeaderboard(c.env.DB, c.get('user').team_id)));

statsRoutes.get('/api/company/teams-activity', requireUser, async (c) => {
  const me = c.get('user');
  const [teams, categoryUsage] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.id, t.name,
        (SELECT COUNT(*) FROM users WHERE team_id = t.id AND active = 1) AS members,
        (SELECT COUNT(*) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS points_7d,
        (SELECT COUNT(DISTINCT from_user_id) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS givers,
        (SELECT COUNT(DISTINCT category_id) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS categories_used
      FROM teams t
      WHERE t.company_id = ? AND t.active = 1
      ORDER BY points_7d DESC, t.name ASC
    `).bind(me.company_id).all<{ id: string }>(),
    c.env.DB.prepare(`
      SELECT p.team_id, c.name AS cat_name, COUNT(*) AS n
      FROM points_log p JOIN categories c ON c.id = p.category_id JOIN teams t ON t.id = p.team_id
      WHERE t.company_id = ? AND p.created_at >= datetime('now','-7 days')
      GROUP BY p.team_id, p.category_id ORDER BY n DESC
    `).bind(me.company_id).all<{ team_id: string; cat_name: string }>(),
  ]);
  const dominantCategory = dominantCategoryByTeam(categoryUsage.results ?? []);
  return c.json({
    company_name: me.company_name,
    my_team_id: me.team_id,
    teams: (teams.results ?? []).map((team) => ({ ...team, top_category: dominantCategory.get(team.id) ?? null })),
  });
});

statsRoutes.get('/api/stats', requireUser, async (c) => {
  const me = c.get('user');
  const requestedPeriod = c.req.query('period') ?? '';
  const period = requestedPeriod in PERIOD_DAYS ? requestedPeriod : DEFAULT_PERIOD;
  const since = PERIOD_DAYS[period] ? `-${PERIOD_DAYS[period]} days` : null;
  const db = c.env.DB;

  const [givers, receivers, categories, matrix, dares, dareLog, total, evolution] = await Promise.all([
    db.prepare(`
      SELECT u.id, u.name, COUNT(*) as total FROM points_log p JOIN users u ON p.from_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ?2 AND (?1 IS NULL OR p.created_at >= datetime('now', ?1))
      GROUP BY p.from_user_id ORDER BY total DESC LIMIT ?3
    `).bind(since, me.team_id, RANKING_LIMIT).all<RankedTotal>(),
    db.prepare(`
      SELECT u.id, u.name, COUNT(*) as total FROM points_log p JOIN users u ON p.to_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ?2 AND (?1 IS NULL OR p.created_at >= datetime('now', ?1))
      GROUP BY p.to_user_id ORDER BY total DESC LIMIT ?3
    `).bind(since, me.team_id, RANKING_LIMIT).all<RankedTotal>(),
    db.prepare(`
      SELECT c.name, c.emoji, COUNT(*) as total FROM points_log p JOIN categories c ON p.category_id = c.id
      WHERE p.team_id = ?2 AND (?1 IS NULL OR p.created_at >= datetime('now', ?1))
      GROUP BY p.category_id ORDER BY total DESC
    `).bind(since, me.team_id).all(),
    db.prepare(`
      SELECT u_from.id as from_id, u_from.name as from_name, u_to.id as to_id, u_to.name as to_name, COUNT(*) as total
      FROM points_log p JOIN users u_from ON p.from_user_id = u_from.id JOIN users u_to ON p.to_user_id = u_to.id
      WHERE u_from.active = 1 AND u_to.active = 1 AND p.team_id = ?2 AND (?1 IS NULL OR p.created_at >= datetime('now', ?1))
      GROUP BY p.from_user_id, p.to_user_id
    `).bind(since, me.team_id).all(),
    db.prepare(`
      SELECT u.id, u.name, COUNT(*) as total FROM dare_log dl JOIN users u ON dl.user_id = u.id
      WHERE dl.team_id = ?2 AND dl.category_id IS NOT NULL AND u.active = 1 AND (?1 IS NULL OR dl.cleared_at >= datetime('now', ?1))
      GROUP BY dl.user_id ORDER BY total DESC LIMIT ?3
    `).bind(since, me.team_id, RANKING_LIMIT).all<RankedTotal>(),
    db.prepare(`
      SELECT dl.id, u.name, c.name AS category, c.emoji, dl.dare_text, dl.cleared_at
      FROM dare_log dl JOIN users u ON dl.user_id = u.id JOIN categories c ON dl.category_id = c.id
      WHERE dl.team_id = ?2 AND dl.category_id IS NOT NULL AND u.active = 1 AND (?1 IS NULL OR dl.cleared_at >= datetime('now', ?1))
      ORDER BY dl.cleared_at DESC LIMIT ?3
    `).bind(since, me.team_id, DARE_LOG_LIMIT).all(),
    db.prepare("SELECT COUNT(*) as total FROM points_log WHERE team_id = ?2 AND (?1 IS NULL OR created_at >= datetime('now', ?1))")
      .bind(since, me.team_id).first<{ total: number }>(),
    db.prepare(`
      SELECT strftime('%Y-%W', created_at) as week, COUNT(*) as total FROM points_log WHERE team_id = ?
      GROUP BY week ORDER BY week DESC LIMIT ?
    `).bind(me.team_id, EVOLUTION_WEEKS).all(),
  ]);

  return c.json({
    period,
    totalPoints: total?.total ?? 0,
    me: personalStanding(me.id, givers.results ?? [], receivers.results ?? [], dares.results ?? []),
    givers: givers.results ?? [],
    receivers: receivers.results ?? [],
    gages: dares.results ?? [],
    gageLog: dareLog.results ?? [],
    categories: categories.results ?? [],
    matrix: matrix.results ?? [],
    evolution: (evolution.results ?? []).reverse(),
  });
});

statsRoutes.get(SSE_PATH, requireUser, (c) => {
  const teamId = c.get('user').team_id;
  return streamSSE(c, async (stream) => {
    let lastFingerprint = '';
    let lastPayload = '';
    for (let tick = 0; !stream.aborted; tick++) {
      const fingerprint = await teamActivityFingerprint(c.env.DB, teamId);
      if (fingerprint !== lastFingerprint || tick % SSE_FORCED_REFRESH_EVERY_TICKS === 0) {
        lastFingerprint = fingerprint;
        const payload = JSON.stringify(await getTeamLeaderboard(c.env.DB, teamId));
        if (payload !== lastPayload) {
          lastPayload = payload;
          await stream.writeSSE({ data: payload, event: 'stats' });
        }
      }
      await stream.sleep(SSE_TICK_MS);
    }
  });
});
