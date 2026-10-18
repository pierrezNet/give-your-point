import { describe, expect, it } from 'vitest';
import { rotateForWeek, summarizeWeek } from '../../src/domain/digest';

const point = (to_user_id: string, category_id: string) => ({
  to_user_id, to_name: to_user_id.toUpperCase(), category_id, cat_name: `badge-${category_id}`, emoji: '⭐',
});

describe('summarizeWeek', () => {
  it('résume la semaine : total, membre le plus récompensé, badge favori, points par membre', () => {
    const summary = summarizeWeek([point('ann', 'aide'), point('bob', 'aide'), point('bob', 'blague'), point('bob', 'aide')]);
    expect(summary.total).toBe(4);
    expect(summary.topUser).toEqual({ name: 'BOB', count: 3 });
    expect(summary.topCat).toEqual({ name: 'badge-aide', emoji: '⭐', count: 3 });
    expect(Object.fromEntries(summary.receivedByUser)).toEqual({ ann: 1, bob: 3 });
  });

  it('gère une semaine vide', () => {
    expect(summarizeWeek([])).toMatchObject({ total: 0, topUser: null, topCat: null });
  });
});

describe('rotateForWeek', () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  it("change d'équipe de tête chaque semaine pour ne pas toujours priver les mêmes", () => {
    const teams = ['a', 'b', 'c'];
    const firsts = [0, 1, 2].map((week) => rotateForWeek(teams, new Date(week * WEEK_MS))[0]);
    expect(new Set(firsts).size).toBe(3);
  });

  it('garde toutes les équipes', () => {
    expect(rotateForWeek(['a', 'b', 'c'], new Date()).sort()).toEqual(['a', 'b', 'c']);
  });
});
