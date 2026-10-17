export interface RankedTotal { id: string; total: number }

export interface PersonalStanding {
  given: number;
  received: number;
  rankGiver: number | null;
  rankReceiver: number | null;
  gages: number;
}

function standingIn(ranking: RankedTotal[], userId: string) {
  const index = ranking.findIndex((entry) => entry.id === userId);
  return index >= 0 ? { total: ranking[index].total, rank: index + 1 } : { total: 0, rank: null };
}

export function personalStanding(userId: string, givers: RankedTotal[], receivers: RankedTotal[], dares: RankedTotal[]): PersonalStanding {
  const asGiver = standingIn(givers, userId);
  const asReceiver = standingIn(receivers, userId);
  return {
    given: asGiver.total,
    received: asReceiver.total,
    rankGiver: asGiver.rank,
    rankReceiver: asReceiver.rank,
    gages: standingIn(dares, userId).total,
  };
}

export function dominantCategoryByTeam(rowsByDescendingCount: { team_id: string; cat_name: string }[]): Map<string, string> {
  const dominant = new Map<string, string>();
  for (const row of rowsByDescendingCount) {
    if (!dominant.has(row.team_id)) dominant.set(row.team_id, row.cat_name);
  }
  return dominant;
}
