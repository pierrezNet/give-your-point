import { describe, expect, it } from 'vitest';
import { detectSpammers, spamWatchlist, SPAM_MIN_GIVEN } from '../../src/domain/spam';

const team = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `u${i}`, name: `user${i}` }));

function statusesFor(given: Record<string, number>, received: Record<string, number> = {}, pardoned: string[] = [], size = 5) {
  return detectSpammers({
    activeUsers: team(size),
    givenByUser: new Map(Object.entries(given)),
    receivedByUser: new Map(Object.entries(received)),
    pardonedUserIds: new Set(pardoned),
  });
}

describe('detectSpammers', () => {
  it('signale un gros donneur qui reçoit peu et dépasse la moyenne', () => {
    expect(statusesFor({ u0: 10 }).get('u0')?.flagged).toBe(true);
  });

  it(`ne signale pas en dessous du volume plancher (${SPAM_MIN_GIVEN})`, () => {
    expect(statusesFor({ u0: SPAM_MIN_GIVEN - 1 }).get('u0')?.flagged).toBe(false);
  });

  it('épargne un donneur populaire et équilibré', () => {
    expect(statusesFor({ u0: 10 }, { u0: 5 }).get('u0')?.flagged).toBe(false);
  });

  it("épargne un donneur dans la moyenne d'une équipe très active", () => {
    expect(statusesFor({ u0: 10, u1: 10, u2: 10 }, {}, [], 3).get('u0')?.flagged).toBe(false);
  });

  it('épargne un spammeur pardonné', () => {
    const status = statusesFor({ u0: 10 }, {}, ['u0']).get('u0');
    expect(status).toMatchObject({ flagged: false, pardoned: true });
  });

  it('calcule la jauge de proximité comme dons / seuil', () => {
    expect(statusesFor({ u0: 4 }).get('u0')?.progress).toBe(4 / SPAM_MIN_GIVEN);
  });

  it("ignore les dons d'anciens membres dans la moyenne de l'équipe", () => {
    const statuses = statusesFor({ u0: 8, ancien: 12 }, {}, [], 2);
    expect(statuses.get('u0')?.flagged).toBe(true);
    expect(statuses.has('ancien')).toBe(false);
  });
});

describe('spamWatchlist', () => {
  it('garde les signalés et ceux à mi-chemin qui donnent plus qu’ils ne reçoivent, triés par jauge', () => {
    const list = spamWatchlist(statusesFor({ u0: 10, u1: 4, u2: 4, u3: 2 }, { u2: 6 }));
    expect(list.map((entry) => entry.userId)).toEqual(['u0', 'u1']);
  });

  it('arrondit la jauge au centième', () => {
    const [entry] = spamWatchlist(statusesFor({ u0: 5 }));
    expect(entry.progress).toBe(0.63);
  });
});
