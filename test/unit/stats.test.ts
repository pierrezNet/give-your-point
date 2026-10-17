import { describe, expect, it } from 'vitest';
import { dominantCategoryByTeam, personalStanding } from '../../src/domain/stats';

describe('personalStanding', () => {
  const givers = [{ id: 'bob', total: 9 }, { id: 'ann', total: 4 }];
  const receivers = [{ id: 'ann', total: 7 }];

  it('donne les totaux et les rangs (à partir de 1)', () => {
    expect(personalStanding('ann', givers, receivers, [{ id: 'ann', total: 2 }]))
      .toEqual({ given: 4, received: 7, rankGiver: 2, rankReceiver: 1, gages: 2 });
  });

  it('renvoie des zéros et aucun rang pour un absent des classements', () => {
    expect(personalStanding('cid', givers, receivers, [])).toEqual({ given: 0, received: 0, rankGiver: null, rankReceiver: null, gages: 0 });
  });
});

describe('dominantCategoryByTeam', () => {
  it('retient pour chaque équipe la première catégorie rencontrée (lignes triées par fréquence)', () => {
    const dominant = dominantCategoryByTeam([
      { team_id: 'dev', cat_name: 'Aide' }, { team_id: 'ops', cat_name: 'Blague' }, { team_id: 'dev', cat_name: 'Retard' },
    ]);
    expect(Object.fromEntries(dominant)).toEqual({ dev: 'Aide', ops: 'Blague' });
  });
});
