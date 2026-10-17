import { createMiddleware } from 'hono/factory';
import type { AppContext, AppEnv, AuthUser } from '../env';
import { ROLE_RANK, type Role } from '../domain/roles';
import { apiError, type ApiErrorCode } from '../http/errors';

export const SSE_PATH = '/api/events';

const FORBIDDEN_CODE: Record<Role, ApiErrorCode> = {
  member: 'FORBIDDEN',
  admin: 'ADMIN_REQUIRED',
  superadmin: 'SUPERADMIN_REQUIRED',
  owner: 'OWNER_REQUIRED',
};

function getUserByToken(db: D1Database, token: string): Promise<AuthUser | null> {
  return db.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, u.email, u.email_verified, u.locale,
           t.name AS team_name, t.company_id, c.name AS company_name
    FROM users u
    JOIN teams t ON t.id = u.team_id
    JOIN companies c ON c.id = t.company_id
    WHERE u.token = ? AND u.active = 1 AND t.active = 1 AND c.active = 1
  `).bind(token).first<AuthUser>();
}

function extractToken(c: AppContext): string | null {
  const header = c.req.header('Authorization');
  if (header) return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (c.req.path === SSE_PATH) return c.req.query('t') || null;
  return null;
}

const requireRole = (minimumRole: Role) => createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);
  if (!token) return apiError(c, 'UNAUTHENTICATED');
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return apiError(c, 'SESSION_INVALID');
  if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) return apiError(c, FORBIDDEN_CODE[minimumRole]);
  c.set('user', user);
  await next();
});

export const requireUser = requireRole('member');
export const requireAdmin = requireRole('admin');
export const requireSuperadmin = requireRole('superadmin');
export const requireOwner = requireRole('owner');
