import { expect, test } from '@playwright/test';
import { collectPageErrors } from './helpers';

test.describe('landing (non connecté)', () => {
  test("présente l'offre, le formulaire de création et les liens À propos", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Donne Ton Point/ })).toBeVisible();
    await expect(page.locator('#ob-company')).toBeVisible();
    await expect(page.locator('#ob-admin')).toBeVisible();
    await expect(page.locator('#landing a[href="/about"]')).toHaveCount(2);
    await expect(page.locator('details')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test("bascule en anglais vers l'adresse /en/, et retour", async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#landing [data-lang-toggle="fr"].active')).toBeVisible();
    await page.locator('#landing [data-lang-toggle="en"]').click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Give Your Point/ })).toBeVisible();
    await expect(page.locator('#landing [data-lang-toggle="en"].active')).toBeVisible();
    await page.locator('#landing [data-lang-toggle="fr"]').click();
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Donne Ton Point/ })).toBeVisible();
  });

  test("sert la version anglaise directement à /en/, sans JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto('/en/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Give Your Point');
    await expect(page.locator('link[hreflang="fr"]')).toHaveAttribute('href', 'https://donnetonpoint.fr/');
    await expect(page.locator('#landing a[href="/en/about"]').first()).toBeVisible();
    await context.close();
  });

  test("ouvre la récupération de lien depuis un lien magique invalide", async ({ page }) => {
    await page.goto('/login/inconnu');
    await page.getByRole('link', { name: /Récupérer mon accès/ }).click();
    await expect(page.getByRole('heading', { name: 'Récupérer mon accès' })).toBeVisible();
  });

  test('crée un espace et accueille le fondateur', async ({ page }) => {
    await page.goto('/');
    await page.fill('#ob-company', 'E2E Corp');
    await page.fill('#ob-admin', 'Eva');
    await expect(page.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator('#ob-submit').click();
    await expect(page.getByRole('heading', { name: /Ton espace est prêt/ })).toBeVisible();
    await expect(page.locator('#empty-invite-link')).toHaveValue(/\/join\//);
  });
});

test.describe("page À propos", () => {
  test('présente le cloisonnement des espaces', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'Cloisonnement des espaces' })).toBeVisible();
    await expect(page.getByText("Un superadmin ne voit ni ne modifie les équipes d'une autre société.")).toBeVisible();
    await page.getByRole('link', { name: /Chaque société est un espace étanche/ }).click();
    await expect(page).toHaveURL(/#cloisonnement$/);
    expect(errors).toEqual([]);
  });
});

test.describe("inscription par lien d'invitation", () => {
  test("affiche l'équipe invitante puis met l'inscrit en attente", async ({ page }) => {
    await page.goto('/join/e2e-ops');
    await expect(page.getByRole('heading', { name: "Rejoins l'équipe Ops" })).toBeVisible();
    await page.fill('#join-name', 'Nina');
    await expect(page.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.locator('#join-submit').click();
    await expect(page.getByRole('heading', { name: /Presque terminé/ })).toBeVisible();
  });

  test('signale un lien invalide', async ({ page }) => {
    await page.goto('/join/inexistant');
    await expect(page.getByRole('heading', { name: 'Lien invalide' })).toBeVisible();
  });
});
