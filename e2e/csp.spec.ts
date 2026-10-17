import { expect, test } from '@playwright/test';
import { TOKENS, collectPageErrors, openAs } from './helpers';

const PAGES: { path: string; token?: string; ready: string }[] = [
  { path: '/', ready: '#onboarding-form' },
  { path: '/about', ready: 'h1' },
  { path: '/join/e2e-dev', ready: '#join-form' },
  { path: '/', token: TOKENS.alice, ready: '.user-card' },
  { path: '/stats', token: TOKENS.alice, ready: '#stats-content section' },
  { path: '/admin', token: TOKENS.owner, ready: '#admin-users-list tr' },
  { path: '/superadmin', token: TOKENS.owner, ready: '#teams-list tr' },
  { path: '/owner', token: TOKENS.owner, ready: '#companies-list tr' },
];

for (const { path, token, ready } of PAGES) {
  test(`${path}${token ? ' (connecté)' : ''} : aucune erreur ni violation CSP`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = token ? (await openAs(page, token, path), null) : await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    if (response) expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(errors).toEqual([]);
  });
}
