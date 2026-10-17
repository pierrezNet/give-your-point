import type { Role } from '../domain/roles';

export interface UserRecord {
  id: string;
  name: string;
  role: Role;
  active: number;
  email: string | null;
  locale: string | null;
  token: string;
}

const USER_COLUMNS = 'u.id, u.name, u.role, u.active, u.email, u.locale, u.token';

export function newUserCredentials(): { id: string; token: string } {
  return { id: crypto.randomUUID(), token: crypto.randomUUID() };
}

export function findTeamMember(db: D1Database, userId: string, teamId: string): Promise<UserRecord | null> {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ? AND u.team_id = ?`)
    .bind(userId, teamId).first<UserRecord>();
}

export function findCompanyMember(db: D1Database, userId: string, companyId: string): Promise<UserRecord | null> {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users u JOIN teams t ON t.id = u.team_id WHERE u.id = ? AND t.company_id = ?`)
    .bind(userId, companyId).first<UserRecord>();
}

export async function emailTaken(db: D1Database, email: string, exceptUserId?: string): Promise<boolean> {
  const row = exceptUserId
    ? await db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, exceptUserId).first()
    : await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  return !!row;
}

export async function tokenOf(db: D1Database, userId: string): Promise<string> {
  const row = await db.prepare('SELECT token FROM users WHERE id = ?').bind(userId).first<{ token: string }>();
  return row?.token ?? '';
}

export const sqlPlaceholders = (values: readonly unknown[]) => values.map(() => '?').join(', ');
