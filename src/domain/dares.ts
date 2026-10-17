export interface DareRule {
  category_id: string;
  threshold: number;
  dare_text: string;
}

export interface PointTotal {
  to_user_id: string;
  category_id: string;
  total: number;
}

export type DareProgress =
  | { kind: 'triggered'; dare: string }
  | { kind: 'warning' }
  | null;

export function findActiveDare(pointsByCategory: Map<string, number>, rules: DareRule[]): string | null {
  const reached = rules.find((rule) => {
    const count = pointsByCategory.get(rule.category_id);
    return count !== undefined && count >= rule.threshold;
  });
  return reached?.dare_text ?? null;
}

export function dareProgressAfterPoint(newCount: number, rulesByAscendingThreshold: Pick<DareRule, 'threshold' | 'dare_text'>[]): DareProgress {
  for (const rule of rulesByAscendingThreshold) {
    if (newCount === rule.threshold) return { kind: 'triggered', dare: rule.dare_text };
    if (newCount === rule.threshold - 1) return { kind: 'warning' };
  }
  return null;
}

export interface ActiveDare {
  userId: string;
  categoryId: string;
  count: number;
  dare: string;
}

export function listActiveDares(rules: DareRule[], totals: PointTotal[]): ActiveDare[] {
  return rules.flatMap((rule) => totals
    .filter((total) => total.category_id === rule.category_id && total.total >= rule.threshold)
    .map((total) => ({ userId: total.to_user_id, categoryId: total.category_id, count: total.total, dare: rule.dare_text })));
}
