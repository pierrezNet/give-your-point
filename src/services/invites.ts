const INVITE_CODE_LENGTH = 16;

export function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, INVITE_CODE_LENGTH);
}

export async function getOrCreateInviteCode(db: D1Database, teamId: string): Promise<string> {
  const team = await db.prepare('SELECT invite_code FROM teams WHERE id = ?').bind(teamId).first<{ invite_code: string | null }>();
  if (team?.invite_code) return team.invite_code;
  const code = generateInviteCode();
  await db.prepare('UPDATE teams SET invite_code = ? WHERE id = ?').bind(code, teamId).run();
  return code;
}

export async function findJoinableTeam(db: D1Database, inviteCode: unknown) {
  if (typeof inviteCode !== 'string') return null;
  return db.prepare(`
    SELECT t.id, t.name AS team_name, c.name AS company_name
    FROM teams t JOIN companies c ON c.id = t.company_id
    WHERE t.invite_code = ? AND t.active = 1 AND c.active = 1
  `).bind(inviteCode).first<{ id: string; team_name: string; company_name: string }>();
}
