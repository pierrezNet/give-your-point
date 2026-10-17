import type { AppContext, Bindings } from '../env';
import { buildWelcomeEmail } from '../email/templates';
import { magicLinkUrl } from './links';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(env: Bindings, to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !to) return;
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to, subject, html }),
    });
    if (!response.ok) console.error(`Resend ${response.status}:`, await response.text());
  } catch (error) {
    console.error('Email error:', error);
  }
}

export function sendInBackground(c: AppContext, to: string, mail: { subject: string; html: string }): void {
  c.executionCtx.waitUntil(sendEmail(c.env, to, mail.subject, mail.html));
}

export interface MagicLinkRecipient {
  email: string;
  name: string;
  teamName: string;
  locale: string | null;
  token: string;
}

export function sendMagicLinkEmail(c: AppContext, recipient: MagicLinkRecipient): void {
  sendInBackground(c, recipient.email, buildWelcomeEmail({
    isEn: recipient.locale === 'en',
    name: recipient.name,
    teamName: recipient.teamName,
    loginUrl: magicLinkUrl(c, recipient.token),
  }));
}
