import { findActiveDare, type DareRule, type PointTotal } from './dares';

export const TOP_CATEGORIES_LIMIT = 10;
const FALLBACK_CATEGORY = { emoji: '✨', name: 'Inconnu' };

export interface LeaderboardInput {
  users: { id: string; name: string }[];
  categories: { id: string; name: string; emoji: string }[];
  pointTotals: PointTotal[];
  rules: DareRule[];
  spammerIds: Set<string>;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  total_points: number;
  topCategories: { count: number; emoji: string; cat_name: string }[];
  gage: string | null;
  spammer: boolean;
  rank: number;
}

export function buildLeaderboard({ users, categories, pointTotals, rules, spammerIds }: LeaderboardInput): LeaderboardEntry[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return users
    .map((user) => {
      const received = pointTotals
        .filter((total) => total.to_user_id === user.id)
        .sort((a, b) => b.total - a.total);
      const pointsByCategory = new Map(received.map((total) => [total.category_id, total.total]));
      return {
        ...user,
        total_points: received.reduce((sum, total) => sum + total.total, 0),
        topCategories: received.slice(0, TOP_CATEGORIES_LIMIT).map((total) => {
          const category = categoriesById.get(total.category_id) ?? FALLBACK_CATEGORY;
          return { count: total.total, emoji: category.emoji || FALLBACK_CATEGORY.emoji, cat_name: category.name || FALLBACK_CATEGORY.name };
        }),
        gage: findActiveDare(pointsByCategory, rules),
        spammer: spammerIds.has(user.id),
      };
    })
    .sort((a, b) => b.total_points - a.total_points)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
