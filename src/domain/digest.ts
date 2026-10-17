export interface WeeklyPoint {
  to_user_id: string;
  to_name: string;
  category_id: string;
  cat_name: string;
  emoji: string;
}

export interface WeeklySummary {
  total: number;
  topUser: { name: string; count: number } | null;
  topCat: { name: string; emoji: string; count: number } | null;
  receivedByUser: Map<string, number>;
}

function countBy<T>(items: T[], keyOf: (item: T) => string) {
  const counts = new Map<string, { sample: T; count: number }>();
  for (const item of items) {
    const key = keyOf(item);
    const entry = counts.get(key) ?? { sample: item, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return counts;
}

const mostFrequent = <T>(counts: Map<string, { sample: T; count: number }>) =>
  [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;

export function summarizeWeek(points: WeeklyPoint[]): WeeklySummary {
  const byRecipient = countBy(points, (point) => point.to_user_id);
  const byCategory = countBy(points, (point) => point.category_id);
  const topRecipient = mostFrequent(byRecipient);
  const topCategory = mostFrequent(byCategory);
  return {
    total: points.length,
    topUser: topRecipient && { name: topRecipient.sample.to_name, count: topRecipient.count },
    topCat: topCategory && { name: topCategory.sample.cat_name, emoji: topCategory.sample.emoji, count: topCategory.count },
    receivedByUser: new Map([...byRecipient].map(([userId, { count }]) => [userId, count])),
  };
}
