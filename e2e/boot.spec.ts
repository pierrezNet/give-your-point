import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TOKENS, openAs } from './helpers';

const failMe = (page: Page, respond: Parameters<Page['route']>[1]) => page.route('**/api/me', respond);

test.describe("démarrage de l'app connectée", () => {
  test('affiche le chargement, puis le tableau', async ({ page }) => {
    let releaseMe: () => void = () => {};
    const meHeld = new Promise<void>((resolve) => { releaseMe = resolve; });
    await failMe(page, async (route) => { await meHeld; await route.continue(); });
    await openAs(page, TOKENS.alice, '/');
    await expect(page.getByRole('status').filter({ hasText: 'Chargement de ton équipe' })).toBeVisible();
    releaseMe();
    await expect(page.locator('.user-card').first()).toBeVisible();
    await expect(page.locator('#boot-status')).toBeEmpty();
  });

  test("bascule sur l'erreur si le serveur est injoignable, sans perdre la session, puis réessaie", async ({ page }) => {
    let failing = true;
    await failMe(page, (route) => (failing ? route.abort('internetdisconnected') : route.continue()));
    await openAs(page, TOKENS.alice, '/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Impossible de charger ton équipe');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeFocused();
    await expect(alert.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/#accueil');
    expect(await page.evaluate(() => localStorage.getItem('my_token'))).toBe(TOKENS.alice);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    failing = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.user-card').first()).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test('bascule sur une erreur 5xx comme sur une coupure', async ({ page }) => {
    await failMe(page, (route) => route.fulfill({ status: 503, body: '' }));
    await openAs(page, TOKENS.alice, '/');
    await expect(page.getByRole('alert')).toContainText('Impossible de charger ton équipe');
  });

  test("ne reste pas bloqué si /api/me ne répond jamais", async ({ page }) => {
    test.setTimeout(30_000);
    await failMe(page, () => {});
    await openAs(page, TOKENS.alice, '/');
    await expect(page.getByRole('alert')).toContainText('Impossible de charger ton équipe', { timeout: 15_000 });
  });

  test("le retour à l'accueil montre la landing sans effacer la session", async ({ page }) => {
    await openAs(page, TOKENS.alice, '/#accueil');
    await expect(page.locator('#ob-company')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('my_token'))).toBe(TOKENS.alice);
  });

  test('un jeton refusé mène à la récupération par e-mail', async ({ page }) => {
    await page.goto('/#login=jeton-inconnu');
    await expect(page.getByRole('alert')).toContainText('Session invalide');
    expect(await page.evaluate(() => localStorage.getItem('my_token'))).toBeNull();
    await page.getByRole('link', { name: 'Recevoir mon lien par e-mail' }).click();
    await expect(page.locator('#recover-modal')).toBeVisible();
  });
});

test.describe('sans JavaScript', () => {
  for (const path of ['/', '/admin', '/stats']) {
    test(`${path} explique le besoin de JavaScript et propose un retour à l'accueil`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(path);
      const note = page.getByRole('note').filter({ hasText: 'JavaScript' });
      await expect(note).toBeVisible();
      await expect(note.getByRole('link')).toHaveAttribute('href', '/');
      await context.close();
    });
  }
});

test.describe("appel à l'action", () => {
  test("un seul libellé de création, les attentes et l'accès des habitués à côté", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: '🚀 Créer mon espace' })).toBeVisible();
    await expect(page.getByRole('button', { name: '🚀 Créer mon espace' })).toBeVisible();
    await expect(page.getByText('Gratuit · Sans carte bancaire · 30 secondes').first()).toBeVisible();
    await page.getByRole('link', { name: 'reçois-le par e-mail' }).click();
    await expect(page.locator('#recover-modal')).toBeVisible();
  });
});
