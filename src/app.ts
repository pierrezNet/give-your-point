import { Hono } from 'hono';
import type { AppEnv } from './env';
import { canonicalHost, handleError, securityHeaders } from './middleware/security';
import { searchIndexing } from './middleware/indexing';
import { accountRoutes } from './routes/account';
import { pointRoutes } from './routes/points';
import { statsRoutes } from './routes/stats';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { superadminRoutes } from './routes/superadmin';
import { ownerRoutes } from './routes/owner';
import { cronRoutes } from './routes/cron';
import { pageRoutes } from './routes/pages';
import { feedbackRoutes } from './routes/feedback';

export type { Bindings } from './env';

const app = new Hono<AppEnv>()
  .use('*', securityHeaders)
  .use('*', searchIndexing)
  .use('*', canonicalHost)
  .onError(handleError)
  .route('/', publicRoutes)
  .route('/', accountRoutes)
  .route('/', pointRoutes)
  .route('/', statsRoutes)
  .route('/', cronRoutes)
  .route('/', feedbackRoutes)
  .route('/api/admin', adminRoutes)
  .route('/api/superadmin', superadminRoutes)
  .route('/api/owner', ownerRoutes)
  .route('/', pageRoutes);

export default app;
