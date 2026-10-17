import { describe, expect, it } from 'vitest';
import { bestDuo, biggestIngrate, heatmapGrid, mostObsessed, percentOf } from '../../public/js/features/stats/model.js';
import { activityLevel, companyTotals, conversionRate, isCleanupCandidate } from '../../public/js/features/owner/model.js';
import { flavorKey, otherTeams, statLine, teamMood } from '../../public/js/features/companyActivity/model.js';

const cell = (from_id: string, to_id: string, total: number) => ({ from_id, to_id, from_name: from_id.toUpperCase(), to_name: to_id.toUpperCase(), total });

describe('palmarès des statistiques', () => {
  const matrix = [cell('a', 'b', 5), cell('b', 'a', 1), cell('c', 'a', 4), cell('a', 'c', 3)];

  it("l'obsédé·e est la plus grosse relation donneur → receveur", () => {
    expect(mostObsessed(matrix)).toMatchObject({ from_id: 'a', to_id: 'b', total: 5 });
  });

  it('le duo est la paire réciproque au plus fort total cumulé', () => {
    expect(bestDuo(matrix)).toEqual({ a: 'A', b: 'C', score: 7 });
  });

  it("l'ingrat·e reçoit beaucoup plus qu'il ne donne (au moins 3 reçus)", () => {
    const givers = [{ id: 'a', total: 1 }, { id: 'b', total: 5 }];
    const receivers = [{ id: 'a', name: 'Ann', total: 6 }, { id: 'b', name: 'Bob', total: 2 }];
    expect(biggestIngrate(givers, receivers)).toEqual({ name: 'Ann', score: 5 });
  });

  it('la heatmap liste les noms et donne null sur la diagonale', () => {
    const grid = heatmapGrid(matrix);
    expect(grid.names).toEqual(['A', 'B', 'C']);
    expect(grid.valueOf('A', 'A')).toBeNull();
    expect(grid.valueOf('B', 'C')).toBe(0);
    expect(grid.maxCell).toBe(5);
  });

  it('calcule des pourcentages bornés', () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(3, 0)).toBe(0);
  });
});

describe('console owner', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("classe l'activité d'une société", () => {
    expect(activityLevel(null)).toBe('never');
    expect(activityLevel(2)).toBe('active');
    expect(activityLevel(20)).toBe('idle');
    expect(activityLevel(90)).toBe('dormant');
  });

  it('propose au nettoyage les sociétés inactives, sauf la sienne', () => {
    expect(isCleanupCandidate({ id: 'x', last_point_at: daysAgo(45) }, 'own')).toBe(true);
    expect(isCleanupCandidate({ id: 'x', last_point_at: null }, 'own')).toBe(true);
    expect(isCleanupCandidate({ id: 'own', last_point_at: null }, 'own')).toBe(false);
    expect(isCleanupCandidate({ id: 'x', last_point_at: daysAgo(3) }, 'own')).toBe(false);
  });

  it('agrège les compteurs', () => {
    expect(companyTotals([{ team_count: 2, member_count: 5, points_last_7d: 1 }, { team_count: 1, member_count: 2 }]))
      .toEqual({ companies: 2, teams: 3, members: 7, points7d: 1 });
  });

  it('calcule les taux de conversion', () => {
    expect(conversionRate(1, 4)).toBe('25%');
    expect(conversionRate(1, 0)).toBe('—');
  });
});

describe('activité des autres équipes', () => {
  it("exclut l'équipe de l'utilisateur", () => {
    expect(otherTeams({ my_team_id: 't1', teams: [{ id: 't1' }, { id: 't2' }] })).toEqual([{ id: 't2' }]);
    expect(otherTeams(null)).toEqual([]);
  });

  it("choisit une phrase d'ambiance selon l'activité", () => {
    expect(flavorKey({ points_7d: 0 }, () => 0)).toBe('company.flavor_calm_0');
    expect(flavorKey({ points_7d: 4 }, () => 0.99)).toBe('company.flavor_active_9');
  });

  it('accorde les pluriels en français et en anglais', () => {
    const team = { givers: 1, points_7d: 3, categories_used: 2 };
    expect(statLine(team, 'fr')).toBe('1 membre a distribué 3 pts dans 2 catégories');
    expect(statLine(team, 'en')).toBe('1 member gave 3 pts across 2 categories');
  });

  it("donne une humeur à chaque équipe", () => {
    expect(teamMood({ points_7d: 0 }, 0)).toBe('😴');
    expect(teamMood({ points_7d: 5 }, 0)).toBe('🔥');
    expect(teamMood({ points_7d: 5 }, 1)).toBe('👏');
  });
});
