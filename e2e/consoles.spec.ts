import { expect, test } from '@playwright/test';
import { TOKENS, collectPageErrors, openAs } from './helpers';

test.describe('console admin', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test("liste l'équipe, le membre en attente et le lien d'invitation", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAs(page, TOKENS.admin, '/admin');
    await expect(page.locator('#admin-users-list tr')).toHaveCount(6);
    await expect(page.locator('#admin-users-list tr', { hasText: 'Dan' })).toContainText('en attente');
    await expect(page.locator('#invite-link')).toHaveValue(/\/join\/e2e-dev$/);
    expect(errors).toEqual([]);
  });

  test("copie le lien de connexion d'un membre", async ({ page }) => {
    await openAs(page, TOKENS.admin, '/admin');
    await page.locator('#admin-users-list tr', { hasText: 'Bob' }).getByRole('button', { name: 'Lien', exact: true }).click();
    await expect(page.getByText('Lien copié')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/login/k-bob');
  });

  test("refuse le lien d'un rôle supérieur", async ({ page }) => {
    await openAs(page, TOKENS.admin, '/admin');
    await page.locator('#admin-users-list tr', { hasText: 'Olivia' }).getByRole('button', { name: 'Lien', exact: true }).click();
    await expect(page.getByText('Action réservée à un rôle supérieur')).toBeVisible();
  });

  test('crée un badge puis une règle de gage', async ({ page }) => {
    await openAs(page, TOKENS.admin, '/admin');
    await expect(page.locator('#admin-categories-list')).toContainText('Entraide');
    await page.fill('#new-cat-emoji', '⏰');
    await page.fill('#new-cat-name', 'Ponctualité');
    await page.getByRole('button', { name: 'Créer le badge' }).click();
    await expect(page.locator('#admin-categories-list')).toContainText('Ponctualité');
    await page.selectOption('#rule-cat', { label: '⏰ Ponctualité' });
    await page.fill('#rule-threshold', '2');
    await page.fill('#rule-text', 'Café pour tous');
    await page.locator('#rule-text').locator('xpath=following-sibling::button').click();
    await expect(page.locator('#rules-list')).toContainText('Café pour tous');
  });

  test('valide un membre en attente', async ({ page }) => {
    await openAs(page, TOKENS.admin, '/admin');
    await page.locator('#admin-users-list tr', { hasText: 'Dan' }).getByRole('button', { name: 'Valider' }).click();
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.locator('#admin-users-list tr', { hasText: 'Dan' })).not.toContainText('en attente');
  });

  test('régénère son propre lien sans perdre la session', async ({ page }) => {
    await openAs(page, TOKENS.admin, '/admin');
    await page.locator('#admin-users-list tr', { hasText: 'Adam' }).getByTitle(/./).filter({ hasText: '↻' }).click();
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText("L'ancien lien ne fonctionne plus")).toBeVisible();
    await page.reload();
    await expect(page.locator('#admin-users-list tr').first()).toBeVisible();
  });

  test("renvoie un membre vers l'accueil", async ({ page }) => {
    await openAs(page, TOKENS.alice, '/admin');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('console superadmin', () => {
  test('liste les équipes et crée une équipe', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAs(page, TOKENS.owner, '/superadmin');
    await expect(page.locator('#teams-list')).toContainText('Ops');
    await expect(page.locator('#admins-list')).toContainText('Adam');
    await page.getByRole('button', { name: '+ Créer une équipe' }).click();
    await page.locator('.ui-input').fill('Design');
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.locator('#teams-list')).toContainText('Design');
    expect(errors).toEqual([]);
  });
});

test.describe('console owner', () => {
  test("liste les sociétés et l'entonnoir", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAs(page, TOKENS.owner, '/owner');
    await expect(page.locator('#companies-list')).toContainText('Globex');
    await expect(page.locator('#agg-companies')).not.toHaveText('…');
    await expect(page.locator('#fn-landing')).not.toHaveText('…');
    expect(errors).toEqual([]);
  });
});

test.describe('statistiques', () => {
  test('affichent la période et changent de période', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAs(page, TOKENS.alice, '/stats');
    await expect(page.locator('#stats-content')).toContainText('Carol');
    await page.locator('[data-period="all"], button:has-text("Tout")').first().click();
    await expect(page.locator('#stats-content')).toContainText('Carol');
    expect(errors).toEqual([]);
  });
});
