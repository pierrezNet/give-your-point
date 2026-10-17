import { handle } from 'hono/cloudflare-pages';
import app from '../src/app';

export const onRequest = handle(app);
