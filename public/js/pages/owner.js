import { startPage } from '../core/page.js';
import { requirePageRole } from '../core/guard.js';
import { startOwnerConsole } from '../features/owner/controller.js';

const me = startPage() && await requirePageRole(['owner'], 'owner.not_owner');
if (me) await startOwnerConsole(me);
