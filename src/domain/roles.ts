export type Role = 'member' | 'admin' | 'superadmin' | 'owner'

export const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, superadmin: 2, owner: 3 }

export function outranks(actorRole: string, targetRole: string): boolean {
  return (ROLE_RANK[actorRole as Role] ?? 0) > (ROLE_RANK[targetRole as Role] ?? 0)
}

export function canManageLink(actor: { id: string; role: string }, target: { id: string; role: string }): boolean {
  return actor.id === target.id || outranks(actor.role, target.role)
}

export const ADMIN_ROLES: Role[] = ['admin', 'superadmin', 'owner'];
export const SUPERADMIN_ROLES: Role[] = ['superadmin', 'owner'];
