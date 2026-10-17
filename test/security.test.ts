import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  acceptTurnstile, api, findUser, findUserByName, seedDatabase, USERS,
  TEAM_ACME_OPS, CATEGORY_HELP,
} from './fixtures';

beforeEach(seedDatabase);
afterEach(() => vi.restoreAllMocks());

const json = async (response: Response) => response.json() as Promise<any>;

describe("séparation de l'identité et du jeton", () => {
  it("un id de coéquipier ne permet pas de s'authentifier", async () => {
    const teammates = await json(await api('/api/users', { as: USERS.alice }));
    const admin = teammates.find((u: { name: string }) => u.name === 'admin');
    const response = await api('/api/me', { headers: { Authorization: `Bearer ${admin.id}` } });
    expect(response.status).toBe(401);
  });

  it("un membre créé par un admin a un jeton distinct de son id", async () => {
    await api('/api/admin/users', { as: USERS.admin, method: 'POST', body: { name: 'carol' } });
    const carol = await findUserByName('carol');
    expect(carol?.token).toBeTruthy();
    expect(carol?.token).not.toBe(carol?.id);
  });

  it("un membre créé par un superadmin a un jeton distinct de son id", async () => {
    await api(`/api/superadmin/teams/${TEAM_ACME_OPS}/users`, { as: USERS.superadmin, method: 'POST', body: { name: 'dave' } });
    const dave = await findUserByName('dave');
    expect(dave?.token).not.toBe(dave?.id);
  });

  it("un auto-inscrit par lien a un jeton distinct de son id", async () => {
    acceptTurnstile();
    await api('/api/join', { method: 'POST', body: { code: 'invite-acme-dev', name: 'erin', turnstile_token: 'ok' } });
    const erin = await findUserByName('erin');
    expect(erin?.token).not.toBe(erin?.id);
  });

  it("le fondateur d'un espace a un jeton distinct de son id", async () => {
    acceptTurnstile();
    const created = await json(await api('/api/onboarding', {
      method: 'POST',
      body: { company_name: 'Initech', admin_name: 'frank', turnstile_token: 'ok' },
    }));
    const frank = await findUserByName('frank');
    expect(created.token).toBe(frank?.token);
    expect(frank?.token).not.toBe(frank?.id);
  });

  it('le lien magique redirige avec le jeton dans le fragment, pas dans la requête', async () => {
    const response = await api(`/login/${USERS.alice.token}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/#login=${USERS.alice.token}`);
  });
});

describe('aucun jeton dans les réponses', () => {
  it('la liste admin des membres ne contient pas de jeton', async () => {
    const users = await json(await api('/api/admin/users', { as: USERS.admin }));
    expect(JSON.stringify(users)).not.toContain('token-');
    expect(users[0]).not.toHaveProperty('token');
  });

  it('la liste superadmin des admins ne contient pas de jeton', async () => {
    const admins = await json(await api('/api/superadmin/admins', { as: USERS.superadmin }));
    expect(JSON.stringify(admins)).not.toContain('token-');
  });

  it("la création d'un membre par un superadmin ne renvoie pas de jeton brut", async () => {
    const created = await json(await api(`/api/superadmin/teams/${TEAM_ACME_OPS}/users`, {
      as: USERS.superadmin, method: 'POST', body: { name: 'gina' },
    }));
    const gina = await findUserByName('gina');
    expect(created).not.toHaveProperty('token');
    expect(created.login_url).toContain(`/login/${gina?.token}`);
  });
});

describe('lien magique à la demande', () => {
  const adminLink = (as: typeof USERS.admin, target: typeof USERS.admin) =>
    api(`/api/admin/users/${target.id}/magic-link`, { as, method: 'POST' });
  const superadminLink = (as: typeof USERS.admin, target: typeof USERS.admin) =>
    api(`/api/superadmin/users/${target.id}/magic-link`, { as, method: 'POST' });

  it("un admin obtient le lien d'un membre de son équipe", async () => {
    const response = await adminLink(USERS.admin, USERS.alice);
    expect(response.status).toBe(200);
    expect((await json(response)).url).toBe(`https://donnetonpoint.fr/login/${USERS.alice.token}`);
  });

  it("un admin n'obtient pas le lien d'un superadmin", async () => {
    expect((await adminLink(USERS.admin, USERS.superadmin)).status).toBe(403);
  });

  it("un admin n'obtient pas le lien d'un membre d'une autre équipe", async () => {
    expect((await adminLink(USERS.admin, USERS.opsMember)).status).toBe(404);
  });

  it("un superadmin obtient le lien d'un membre d'une autre équipe de sa société", async () => {
    expect((await superadminLink(USERS.superadmin, USERS.opsMember)).status).toBe(200);
  });

  it("un superadmin n'obtient pas le lien du owner", async () => {
    expect((await superadminLink(USERS.superadmin, USERS.owner)).status).toBe(403);
  });

  it("un superadmin n'obtient pas le lien d'une autre société", async () => {
    expect((await superadminLink(USERS.superadmin, USERS.globexAdmin)).status).toBe(404);
  });

  it("le Host de la requête n'influence pas les liens en production", async () => {
    const response = await api(`/api/admin/users/${USERS.alice.id}/magic-link`, {
      as: USERS.admin, method: 'POST', headers: { Host: 'localhost.attaquant.example' },
    });
    expect((await json(response)).url).toMatch(/^https:\/\/donnetonpoint\.fr\//);
  });
});

describe('régénération du lien', () => {
  const regenerate = (as: typeof USERS.admin, target: typeof USERS.admin) =>
    api(`/api/admin/users/${target.id}/regenerate-link`, { as, method: 'POST' });

  it("change le jeton d'un membre sans changer son id", async () => {
    const response = await regenerate(USERS.admin, USERS.alice);
    expect(response.status).toBe(200);
    const alice = await findUser(USERS.alice.id);
    expect(alice).not.toBeNull();
    expect(alice?.token).not.toBe(USERS.alice.token);
    expect((await api('/api/me', { as: USERS.alice })).status).toBe(401);
  });

  it("permet de régénérer son propre lien et signale qu'il faut mettre la session à jour", async () => {
    const body = await json(await regenerate(USERS.admin, USERS.admin));
    const admin = await findUser(USERS.admin.id);
    expect(body).toMatchObject({ is_self: true, token: admin?.token });
  });

  it("refuse qu'un admin régénère le lien d'un superadmin", async () => {
    expect((await regenerate(USERS.admin, USERS.superadmin)).status).toBe(403);
    expect((await findUser(USERS.superadmin.id))?.token).toBe(USERS.superadmin.token);
  });
});

describe('hiérarchie des rôles sur la gestion des membres', () => {
  it("refuse qu'un admin désactive un superadmin", async () => {
    const response = await api(`/api/admin/users/${USERS.superadmin.id}`, { as: USERS.admin, method: 'DELETE' });
    expect(response.status).toBe(403);
    expect((await findUser(USERS.superadmin.id))?.active).toBe(1);
  });

  it("refuse qu'un admin se désactive lui-même", async () => {
    const response = await api(`/api/admin/users/${USERS.admin.id}`, { as: USERS.admin, method: 'DELETE' });
    expect(response.status).toBe(400);
  });

  it('permet à un admin de désactiver puis restaurer un membre', async () => {
    expect((await api(`/api/admin/users/${USERS.alice.id}`, { as: USERS.admin, method: 'DELETE' })).status).toBe(200);
    expect((await findUser(USERS.alice.id))?.active).toBe(0);
    expect((await api(`/api/admin/users/${USERS.alice.id}/restore`, { as: USERS.admin, method: 'PATCH' })).status).toBe(200);
    expect((await findUser(USERS.alice.id))?.active).toBe(1);
  });

  it("refuse qu'un superadmin modifie le rôle du owner", async () => {
    const response = await api(`/api/superadmin/users/${USERS.owner.id}/promote`, {
      as: USERS.superadmin, method: 'POST', body: { role: 'admin' },
    });
    expect(response.status).toBe(403);
    expect((await findUser(USERS.owner.id))?.role).toBe('owner');
  });
});

describe('extraction du jeton', () => {
  it('refuse un en-tête Authorization sans préfixe Bearer', async () => {
    const response = await api('/api/me', { headers: { Authorization: USERS.alice.token } });
    expect(response.status).toBe(401);
  });

  it('refuse le jeton en paramètre de requête hors flux SSE', async () => {
    expect((await api(`/api/me?t=${USERS.alice.token}`)).status).toBe(401);
  });

  it("refuse la session d'un membre dont l'équipe est désactivée", async () => {
    await env.DB.prepare('UPDATE teams SET active = 0 WHERE id = ?').bind(TEAM_ACME_OPS).run();
    expect((await api('/api/me', { as: USERS.opsMember })).status).toBe(401);
  });
});

describe('secret du cron', () => {
  it('refuse le secret passé en paramètre de requête', async () => {
    const response = await api('/api/cron/weekly-digest?dry=1&secret=cron-test-secret', { method: 'POST' });
    expect(response.status).toBe(401);
  });

  it("accepte le secret dans l'en-tête Authorization", async () => {
    const response = await api('/api/cron/weekly-digest?dry=1', {
      method: 'POST', headers: { Authorization: 'Bearer cron-test-secret' },
    });
    expect(response.status).toBe(200);
  });
});

describe('abonnement push', () => {
  const subscribe = (endpoint: string, keys: unknown = { p256dh: 'p', auth: 'a' }) =>
    api('/api/push/subscribe', { as: USERS.alice, method: 'POST', body: { endpoint, keys } });

  it("refuse un endpoint qui n'est pas un service push connu", async () => {
    expect((await subscribe('https://attaquant.example/collect')).status).toBe(400);
    expect((await subscribe('http://fcm.googleapis.com/fcm/send/x')).status).toBe(400);
  });

  it('refuse un abonnement sans clés', async () => {
    expect((await subscribe('https://fcm.googleapis.com/fcm/send/x', null)).status).toBe(400);
  });

  it('accepte un endpoint FCM', async () => {
    expect((await subscribe('https://fcm.googleapis.com/fcm/send/abc')).status).toBe(200);
  });
});

describe('mesure analytique', () => {
  it("ignore un événement sans en-tête Origin", async () => {
    await api('/api/track', { method: 'POST', body: { event: 'landing_vue' } });
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM analytics_events').first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe('en-têtes de sécurité', () => {
  it('sont posés sur les réponses API', async () => {
    const response = await api('/api/me', { as: USERS.alice });
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe('erreurs internes', () => {
  it("ne divulguent pas le message d'exception", async () => {
    const response = await api('/api/push/subscribe', {
      as: USERS.alice, method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await json(response))).not.toMatch(/SyntaxError|JSON|at /);
  });
});

describe('don de point', () => {
  it('fonctionne toujours avec les id séparés des jetons', async () => {
    const response = await api('/api/points', {
      as: USERS.alice, method: 'POST', body: { to_user_id: USERS.bob.id, category_id: CATEGORY_HELP },
    });
    expect(response.status).toBe(200);
  });
});
