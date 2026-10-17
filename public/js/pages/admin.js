import { startPage } from '../core/page.js';
import { ADMIN_ROLES } from '../core/session.js';
import { requirePageRole, revealRoleLinks } from '../core/guard.js';
import { startAdminConsole } from '../features/admin/controller.js';

startPage();
const me = await requirePageRole(ADMIN_ROLES, 'admin.not_admin');
if (me) {
  revealRoleLinks(me);
  await startAdminConsole(me);
}
