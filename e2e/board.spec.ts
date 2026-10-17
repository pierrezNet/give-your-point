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

  test('donne un badge en deux gestes puis l’annule', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    const bob = userCard(page, 'Bob');
    const pointsBefore = await bob.locator('.user-points-total').innerText();
    await category(page, 'Entraide').click();
    await bob.click();
    const toast = page.locator('#toast-notification');
    await expect(toast).toContainText('Point envoyé');
    await expect(bob.locator('.user-points-total')).not.toHaveText(pointsBefore);
    await toast.getByRole('button', { name: /Annuler \(\d+ s\)/ }).click();
    await expect(bob.locator('.user-points-total')).toHaveText(pointsBefore);
  });

  test('ajoute un mot au point qui vient d’être donné', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').click();
    await userCard(page, 'Olivia').click();
    const toast = page.locator('#toast-notification');
    await toast.getByRole('button', { name: 'Ajouter un mot' }).click();
    await page.locator('#point-reason').fill('Merci pour le café');
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-notification')).toContainText('Mot ajouté');
    await userCard(page, 'Olivia').locator('.history-button').click();
    await expect(page.getByText('Merci pour le café')).toBeVisible();
  });

  test('donne un badge entièrement au clavier', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').focus();
    await page.keyboard.press('Enter');
    await expect(category(page, 'Entraide')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Donner le badge sélectionné à Adam' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast-notification')).toContainText('Point envoyé');
  });

  test('indique de choisir un badge avant de cliquer sur un membre', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await userCard(page, 'Bob').click();
    await expect(page.locator('#toast-notification')).toContainText("Choisis d'abord le badge");
  });

  test("refuse de s'offrir un point", async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').click();
    await userCard(page, 'Alice').click();
    await expect(page.locator('#toast-notification')).toContainText("toi-même");
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

  test('choisit le destinataire dans un sélecteur et donne aussitôt', async ({ page }) => {
    await loginAs(page, TOKENS.alice);
    await category(page, 'Entraide').click();
    await expect(page.getByText('À qui offres-tu ce badge ?')).toBeVisible();
    await expect(page.locator('#wheel-selector button', { hasText: 'Alice' })).toHaveCount(0);
    await page.locator('#wheel-selector button', { hasText: 'Bob' }).click();
    await expect(page.locator('#toast-notification')).toContainText('Point envoyé');
  });
});
