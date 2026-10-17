import { describe, expect, it } from 'vitest';
import { dareProgressAfterPoint, findActiveDare, listActiveDares } from '../../src/domain/dares';

const rule = (category_id: string, threshold: number, dare_text: string) => ({ category_id, threshold, dare_text });

describe('findActiveDare', () => {
  const rules = [rule('blague', 3, 'croissants'), rule('retard', 2, 'café')];

  it('renvoie le gage de la première règle atteinte', () => {
    expect(findActiveDare(new Map([['blague', 3], ['retard', 5]]), rules)).toBe('croissants');
  });

  it("ignore les catégories sans point", () => {
    expect(findActiveDare(new Map([['retard', 2]]), rules)).toBe('café');
  });

  it('renvoie null sous tous les seuils', () => {
    expect(findActiveDare(new Map([['blague', 2]]), rules)).toBeNull();
  });
});

describe('dareProgressAfterPoint', () => {
  const rules = [rule('blague', 3, 'croissants'), rule('blague', 6, 'pizza')];

  it('déclenche le gage pile au seuil', () => {
    expect(dareProgressAfterPoint(3, rules)).toEqual({ kind: 'triggered', dare: 'croissants' });
    expect(dareProgressAfterPoint(6, rules)).toEqual({ kind: 'triggered', dare: 'pizza' });
  });

  it('avertit à un point du seuil', () => {
    expect(dareProgressAfterPoint(2, rules)).toEqual({ kind: 'warning' });
    expect(dareProgressAfterPoint(5, rules)).toEqual({ kind: 'warning' });
  });

  it('ne dit rien ailleurs, y compris au-delà du seuil (comportement actuel)', () => {
    expect(dareProgressAfterPoint(1, rules)).toBeNull();
    expect(dareProgressAfterPoint(4, rules)).toBeNull();
    expect(dareProgressAfterPoint(9, rules)).toBeNull();
  });
});

describe('listActiveDares', () => {
  it('liste chaque membre ayant atteint un seuil, par règle', () => {
    const totals = [
      { to_user_id: 'ann', category_id: 'blague', total: 4 },
      { to_user_id: 'bob', category_id: 'blague', total: 1 },
      { to_user_id: 'bob', category_id: 'retard', total: 2 },
    ];
    expect(listActiveDares([rule('blague', 3, 'croissants'), rule('retard', 2, 'café')], totals)).toEqual([
      { userId: 'ann', categoryId: 'blague', count: 4, dare: 'croissants' },
      { userId: 'bob', categoryId: 'retard', count: 2, dare: 'café' },
    ]);
  });
});
