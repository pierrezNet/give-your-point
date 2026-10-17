import { expect, type Page } from '@playwright/test';

export const TOKENS = {
  owner: 'k-owner',
  admin: 'k-admin',
  alice: 'k-alice',
  gina: 'k-gina',
} as const;

export function collectPageErrors(page: Page, { ignore = [] as RegExp[] } = {}): string[] {
  const errors: string[] = [];
  const keep = (message: string) => !ignore.some((pattern) => pattern.test(message));
  page.on('pageerror', (error) => keep(error.message) && errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && keep(message.text()) && errors.push(message.text()));
  return errors;
}

export async function loginAs(page: Page, token: string) {
  await page.goto(`/login/${token}`);
  await expect(page.locator('.user-card').first()).toBeVisible();
}

export async function openAs(page: Page, token: string, path: string) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('my_token')) localStorage.setItem('my_token', value);
  }, token);
  await page.goto(path);
}

export const userCard = (page: Page, name: string) => page.locator('.user-card', { has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) });
export const category = (page: Page, name: string) => page.locator('.category-card', { hasText: name });
