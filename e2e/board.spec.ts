import { expect, test } from '@playwright/test';
import { TOKENS, category, collectPageErrors, loginAs, userCard } from './helpers';

test.describe('tableau de jeu (membre)', () => {
  test("affiche l'équipe, marque l'utilisateur et nettoie l'URL de connexion", async ({ page }) => {
    const errors = collectPageErrors(page);
    await loginAs(page, TOKENS.alice);
    await expect(page.locator('.user-card')).toHaveCount(5);
    await expect(userCard(page, 'Alice')).toContainText('(toi)');
    await expect(page.locator('.category-card')).toHaveCount(2);
    expect(page.url()).not.toContain('login');
    expect(errors).toEqual([]);
  });

  test('donne un point avec une raison puis l’annule', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    const bob = userCard(page, 'Bob');
    const pointsBefore = await bob.locator('.user-points-total').innerText();
    await category(page, 'Entraide').click();
    await bob.click();
    await expect(page.getByRole('heading', { name: 'Point pour Bob' })).toBeVisible();
    await page.locator('#reason-input').fill('Merci pour la relecture');
    await page.getByRole('button', { name: 'Donner le point' }).click();
    const toast = page.locator('#toast-notification');
    await expect(toast).toContainText('Point envoyé');
    await expect(bob.locator('.user-points-total')).not.toHaveText(pointsBefore);
    await toast.getByRole('button', { name: 'Annuler' }).click();
    await expect(bob.locator('.user-points-total')).toHaveText(pointsBefore);
  });

  test('déclenche un gage au seuil', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Blague').click();
    await userCard(page, 'Carol').click();
    await page.getByRole('button', { name: 'Donner le point' }).click();
    await expect(page.locator('#toast-notification')).toContainText('Croissants');
    await expect(userCard(page, 'Carol').locator('.gage-banner')).toBeVisible();
  });

  test("refuse de s'offrir un point", async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').click();
    await userCard(page, 'Alice').click();
    await expect(page.locator('#toast-notification')).toContainText("auto-mousser");
  });

  test("ouvre l'historique d'un membre avec la raison des points", async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await userCard(page, 'Carol').locator('.history-button').click();
    await expect(page.getByRole('heading', { name: 'Historique de Carol' })).toBeVisible();
    await expect(page.getByText('La blague du lundi')).toBeVisible();
  });

  test("ouvre l'aide et le profil", async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await page.getByRole('button', { name: 'Aide' }).first().click();
    await expect(page.getByRole('heading', { name: /Comment ça marche/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.locator('#current-user-display').click();
    await expect(page.getByRole('heading', { name: /Mon email/ })).toBeVisible();
  });

  test("montre l'activité des autres équipes de la société", async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await page.locator('#company-activity-pill').click();
    await expect(page.getByRole('heading', { name: /Ailleurs chez Acme/ })).toBeVisible();
    await expect(page.getByText('Ops', { exact: true }).last()).toBeVisible();
  });
});

test.describe('tableau de jeu sur mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('choisit le destinataire dans un sélecteur', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').click();
    await expect(page.getByText('À qui offres-tu ce badge ?')).toBeVisible();
    await expect(page.locator('#wheel-selector button', { hasText: 'Alice' })).toHaveCount(0);
    await page.locator('#wheel-selector button', { hasText: 'Bob' }).click();
    await expect(page.getByRole('heading', { name: 'Point pour Bob' })).toBeVisible();
  });
});
