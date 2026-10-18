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

type Threshold = Pick<DareRule, 'threshold' | 'dare_text'>;

export function highestReachedRule<T extends Threshold>(count: number, rules: T[]): T | null {
  return rules
    .filter((rule) => count >= rule.threshold)
    .reduce<T | null>((highest, rule) => (!highest || rule.threshold > highest.threshold ? rule : highest), null);
}

export function findActiveDare(pointsByCategory: Map<string, number>, rules: DareRule[]): string | null {
  for (const [categoryId, count] of pointsByCategory) {
    const reached = highestReachedRule(count, rules.filter((rule) => rule.category_id === categoryId));
    if (reached) return reached.dare_text;
  }
  return null;
}

export function dareProgressAfterPoint(newCount: number, rulesByAscendingThreshold: Threshold[]): DareProgress {
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
  return totals.flatMap((total) => {
    const reached = highestReachedRule(total.total, rules.filter((rule) => rule.category_id === total.category_id));
    return reached ? [{ userId: total.to_user_id, categoryId: total.category_id, count: total.total, dare: reached.dare_text }] : [];
  });
}

export function membersReachedByRuleChange(totals: PointTotal[], rule: DareRule, previousThreshold: number | null): PointTotal[] {
  return totals.filter((total) => total.category_id === rule.category_id
    && total.total >= rule.threshold
    && (previousThreshold === null || total.total < previousThreshold));
}
