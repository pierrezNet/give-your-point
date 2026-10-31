import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TOKENS, openAs } from './helpers';

async function fillAndSend(page: Page) {
  const modal = page.getByRole('dialog', { name: "J'ai un retour" });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Type de retour').selectOption('suggestion');
  await modal.getByLabel('Message').fill('Un mode sombre pour le classement ?');
  await expect(modal.getByText('35 / 1800')).toBeVisible();
  await expect(page.locator('#feedback-turnstile [name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 15_000 });
  await modal.getByRole('button', { name: 'Envoyer' }).click();
  return modal;
}

test.describe("retour « J'ai un retour »", () => {
  test('depuis la landing : envoi, puis remerciement avec le lien du forum', async ({ page }) => {
    let sent: Record<string, unknown> = {};
    await page.route('**/api/feedback', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { success: true } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: "J'ai un retour" }).click();
    const results = await new AxeBuilder({ page }).include('#feedback-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#feedback-turnstile').analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    await fillAndSend(page);
    const modal = page.getByRole('dialog', { name: 'Merci, ton retour est bien arrivé !' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Fermer' })).toBeFocused();
    await expect(modal.getByRole('link', { name: 'forum de Donne Ton Point' })).toHaveAttribute('href', 'https://avrobb.org/forum/3-donne-ton-point');
    expect(sent).toMatchObject({ type: 'suggestion', message: 'Un mode sombre pour le classement ?', lang: 'fr' });
  });

  test("depuis l'app connectée : l'échec est annoncé et propose le forum", async ({ page }) => {
    await page.route('**/api/feedback', (route) => route.fulfill({ status: 503, json: { code: 'FEEDBACK_UNAVAILABLE' } }));
    await openAs(page, TOKENS.alice, '/');
    await expect(page.locator('.user-card').first()).toBeVisible();
    await page.locator('nav').getByRole('button', { name: "J'ai un retour" }).click();
    const modal = await fillAndSend(page);
    await expect(modal.getByRole('alert')).toContainText("L'envoi du retour a échoué");
    await expect(modal.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  test('depuis la page À propos', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('button', { name: "J'ai un retour" }).click();
    await expect(page.getByRole('dialog', { name: "J'ai un retour" })).toBeVisible();
  });
});
