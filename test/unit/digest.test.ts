import { describe, expect, it } from 'vitest';
import { summarizeWeek } from '../../src/domain/digest';

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
