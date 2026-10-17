import { startPage } from '../core/page.js';
import { ADMIN_ROLES } from '../core/session.js';
import { requirePageRole, revealRoleLinks } from '../core/guard.js';
import { startAdminConsole } from '../features/admin/controller.js';

const me = startPage() && await requirePageRole(ADMIN_ROLES, 'admin.not_admin');
if (me) {
  revealRoleLinks(me);
  await startAdminConsole(me);
}
