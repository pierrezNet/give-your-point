import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TOKENS, openAs } from './helpers';

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

const COLOR_SCHEMES = ['light', 'dark'] as const;

for (const colorScheme of COLOR_SCHEMES) for (const { path, token, ready } of PAGES) {
  test(`${path}${token ? ' (connecté)' : ''}, thème ${colorScheme === 'dark' ? 'sombre' : 'clair'} : conforme WCAG 2.1 AA (axe)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    if (token) await openAs(page, token, path);
    else await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.cf-turnstile')
      .analyze();
    const summary = results.violations.map((violation) => `${violation.id} (${violation.nodes.length}) : ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`);
    expect(summary).toEqual([]);
  });
}
