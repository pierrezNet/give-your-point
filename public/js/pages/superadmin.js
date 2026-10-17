import { startPage } from '../core/page.js';
import { SUPERADMIN_ROLES } from '../core/session.js';
import { requirePageRole, revealRoleLinks } from '../core/guard.js';
import { startSuperadminConsole } from '../features/superadmin/controller.js';

const me = startPage() && await requirePageRole(SUPERADMIN_ROLES, 'superadmin.not_superadmin');
if (me) {
  revealRoleLinks(me);
  await startSuperadminConsole(me);
}
