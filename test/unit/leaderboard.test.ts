import { describe, expect, it } from 'vitest';
import { buildLeaderboard, TOP_CATEGORIES_LIMIT } from '../../src/domain/leaderboard';

const users = [{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob' }, { id: 'cid', name: 'Cid' }];
const categories = [{ id: 'blague', name: 'Blague', emoji: '😂' }, { id: 'aide', name: 'Aide', emoji: '🤝' }];
const total = (to_user_id: string, category_id: string, count: number) => ({ to_user_id, category_id, total: count });

describe('buildLeaderboard', () => {
  const board = buildLeaderboard({
    users,
    categories,
    pointTotals: [total('bob', 'blague', 2), total('bob', 'aide', 5), total('ann', 'blague', 1), total('bob', 'supprimée', 1)],
    rules: [{ category_id: 'aide', threshold: 5, dare_text: 'croissants' }],
    spammerIds: new Set(['ann']),
  });

  it('classe par total de points reçus, rang à partir de 1', () => {
    expect(board.map((entry) => [entry.name, entry.total_points, entry.rank])).toEqual([
      ['Bob', 8, 1], ['Ann', 1, 2], ['Cid', 0, 3],
    ]);
  });

  it('trie les badges reçus du plus fréquent au moins fréquent', () => {
    expect(board[0].topCategories.map((category) => category.cat_name)).toEqual(['Aide', 'Blague', 'Inconnu']);
  });

  it('remplace un badge disparu par un badge générique', () => {
    expect(board[0].topCategories[2]).toEqual({ count: 1, emoji: '✨', cat_name: 'Inconnu' });
  });

  it('indique le gage actif et le statut spammeur', () => {
    expect(board[0].gage).toBe('croissants');
    expect(board[1]).toMatchObject({ gage: null, spammer: true });
  });

  it(`limite les badges affichés à ${TOP_CATEGORIES_LIMIT}`, () => {
    const many = Array.from({ length: 12 }, (_, i) => total('ann', `c${i}`, i + 1));
    const [ann] = buildLeaderboard({ users: [users[0]], categories, pointTotals: many, rules: [], spammerIds: new Set() });
    expect(ann.topCategories).toHaveLength(TOP_CATEGORIES_LIMIT);
  });
});
