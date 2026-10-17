import { beforeEach, describe, expect, it } from 'vitest';
import { api, seedDatabase, USERS, CATEGORY_HELP, CATEGORY_GLOBEX } from './fixtures';

beforeEach(seedDatabase);

const givePoint = (from: typeof USERS.alice, to: typeof USERS.alice, category = CATEGORY_HELP) =>
  api('/api/points', { as: from, method: 'POST', body: { to_user_id: to.id, category_id: category } });

describe('don de points', () => {
  it('accepte un point entre coéquipiers', async () => {
    const response = await givePoint(USERS.alice, USERS.bob);
    expect(response.status).toBe(200);
  });

  it("refuse de s'attribuer un point", async () => {
    const response = await givePoint(USERS.alice, USERS.alice);
    expect(response.status).toBe(400);
  });

  it("refuse un point vers une autre équipe", async () => {
    const response = await givePoint(USERS.alice, USERS.opsMember);
    expect(response.status).toBe(403);
  });

  it("refuse un badge d'une autre équipe", async () => {
    const response = await givePoint(USERS.alice, USERS.bob, CATEGORY_GLOBEX);
    expect(response.status).not.toBe(200);
  });

  it('bloque le doublon même badge / même destinataire sous 5 minutes', async () => {
    await givePoint(USERS.alice, USERS.bob);
    const response = await givePoint(USERS.alice, USERS.bob);
    expect(response.status).toBe(429);
  });

  it("permet d'annuler son dernier point", async () => {
    await givePoint(USERS.alice, USERS.bob);
    const response = await api('/api/points/undo', { as: USERS.alice, method: 'POST' });
    expect(response.status).toBe(200);
  });
});
