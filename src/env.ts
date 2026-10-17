import type { Context } from 'hono';
import type { Role } from './domain/roles';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY_JWK: string;
  VAPID_SUBJECT: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  CRON_SECRET: string;
  APP_BASE_URL: string;
};

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  active: number;
  team_id: string;
  team_name: string;
  company_id: string;
  company_name: string;
  email: string | null;
  email_verified: number;
  locale: string | null;
}

export type AppEnv = { Bindings: Bindings; Variables: { user: AuthUser } };
export type AppContext = Context<AppEnv>;
