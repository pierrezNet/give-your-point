import { beforeEach, describe, expect, it } from 'vitest';
import { api, seedDatabase, USERS, TEAM_ACME_DEV } from './fixtures';

beforeEach(seedDatabase);

describe('authentification', () => {
  it('refuse une requête sans jeton', async () => {
    const response = await api('/api/me');
    expect(response.status).toBe(401);
  });

  it('refuse un jeton inconnu', async () => {
    const response = await api('/api/me', { as: { ...USERS.alice, token: 'inconnu' } });
    expect(response.status).toBe(401);
  });

  it("renvoie le profil de l'utilisateur authentifié", async () => {
    const response = await api('/api/me', { as: USERS.alice });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: 'alice', role: 'member', team_id: TEAM_ACME_DEV });
  });
});

describe('hiérarchie des rôles', () => {
  it('interdit la console admin à un membre', async () => {
    const response = await api('/api/admin/users', { as: USERS.alice });
    expect(response.status).toBe(403);
  });

  it('ouvre la console admin à un superadmin (héritage)', async () => {
    const response = await api('/api/admin/users', { as: USERS.superadmin });
    expect(response.status).toBe(200);
  });

  it('interdit la console superadmin à un admin', async () => {
    const response = await api('/api/superadmin/teams', { as: USERS.admin });
    expect(response.status).toBe(403);
  });

  it('réserve la console owner au owner', async () => {
    expect((await api('/api/owner/companies', { as: USERS.superadmin })).status).toBe(403);
    expect((await api('/api/owner/companies', { as: USERS.owner })).status).toBe(200);
  });
});

describe('étanchéité entre sociétés', () => {
  it("un superadmin ne voit que les équipes de sa société", async () => {
    const teams = await (await api('/api/superadmin/teams', { as: USERS.superadmin })).json() as { name: string }[];
    expect(teams.map((team) => team.name).sort()).toEqual(['Dev', 'Ops']);
  });

  it("un superadmin ne peut pas renommer l'équipe d'une autre société", async () => {
    const response = await api('/api/superadmin/teams/team-globex', { as: USERS.superadmin, method: 'PATCH', body: { name: 'Piratée' } });
    expect(response.status).toBe(404);
  });

  it("un membre ne voit pas l'historique d'une autre équipe", async () => {
    const response = await api(`/api/users/${USERS.opsMember.id}/history`, { as: USERS.alice });
    expect(response.status).toBe(403);
  });

  it('refuse un nom d’équipe trop long', async () => {
    const response = await api('/api/superadmin/teams', { as: USERS.superadmin, method: 'POST', body: { name: 'x'.repeat(61) } });
    expect(response.status).toBe(400);
  });
});

describe('lien de connexion invalide', () => {
  it('affiche une page dans la langue du navigateur', async () => {
    const french = await (await api('/login/inconnu')).text();
    expect(french).toContain("Ce lien n'est plus valide");
    const english = await (await api('/login/inconnu', { headers: { 'Accept-Language': 'en-GB' } })).text();
    expect(english).toContain('This link is no longer valid');
    expect(english).toContain('href="/en/?lost=1"');
  });
});
