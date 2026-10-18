import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { api, COMPANY_ACME, COMPANY_GLOBEX, seedDatabase, USERS } from './fixtures';

beforeEach(seedDatabase);

const json = async (response: Response) => response.json() as Promise<any>;
const companyExists = async (id: string) => !!await env.DB.prepare('SELECT 1 FROM companies WHERE id = ?').bind(id).first();
const deleteGlobex = () => api(`/api/owner/companies/${COMPANY_GLOBEX}`, { as: USERS.owner, method: 'DELETE' });
const setGlobexActive = (active: boolean) => api(`/api/owner/companies/${COMPANY_GLOBEX}/active`, { as: USERS.owner, method: 'PATCH', body: { active } });

describe("suppression d'une société", () => {
  it("refuse de supprimer une société encore active", async () => {
    expect((await json(await deleteGlobex())).code).toBe('COMPANY_STILL_ACTIVE');
    expect(await companyExists(COMPANY_GLOBEX)).toBe(true);
  });

  it('supprime une société désactivée, avec ses membres', async () => {
    await setGlobexActive(false);
    expect((await deleteGlobex()).status).toBe(200);
    expect(await companyExists(COMPANY_GLOBEX)).toBe(false);
    expect(await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(USERS.globexAdmin.id).first()).toBeNull();
  });

  it('coupe les sessions des membres pendant la désactivation, et les rend à la réactivation', async () => {
    await setGlobexActive(false);
    expect((await api('/api/me', { as: USERS.globexAdmin })).status).toBe(401);
    await setGlobexActive(true);
    expect((await api('/api/me', { as: USERS.globexAdmin })).status).toBe(200);
  });

  it("refuse de désactiver sa propre société", async () => {
    const response = await api(`/api/owner/companies/${COMPANY_ACME}/active`, { as: USERS.owner, method: 'PATCH', body: { active: false } });
    expect((await json(response)).code).toBe('OWN_COMPANY');
  });
});
