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
