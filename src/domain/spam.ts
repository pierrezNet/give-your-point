export const SPAM_WINDOW_DAYS = 7;
export const SPAM_MIN_GIVEN = 8;
export const SPAM_RATIO = 3;
export const SPAM_RATIO_BUFFER = 1;
export const SPAM_TEAM_MULT = 2;
export const SPAM_WATCH_THRESHOLD = 0.5;

export interface SpamStatus {
  flagged: boolean;
  name: string;
  given: number;
  received: number;
  progress: number;
  pardoned: boolean;
}

export interface SpamInput {
  activeUsers: { id: string; name: string }[];
  givenByUser: Map<string, number>;
  receivedByUser: Map<string, number>;
  pardonedUserIds: Set<string>;
}

const sum = (values: Iterable<number>) => [...values].reduce((total, value) => total + value, 0);

export function detectSpammers({ activeUsers, givenByUser, receivedByUser, pardonedUserIds }: SpamInput): Map<string, SpamStatus> {
  const teamAverageGiven = activeUsers.length ? sum(activeUsers.map((user) => givenByUser.get(user.id) || 0)) / activeUsers.length : 0;

  return new Map(activeUsers.map((user) => {
    const given = givenByUser.get(user.id) || 0;
    const received = receivedByUser.get(user.id) || 0;
    const pardoned = pardonedUserIds.has(user.id);
    const flagged = !pardoned
      && given >= SPAM_MIN_GIVEN
      && given / (received + SPAM_RATIO_BUFFER) >= SPAM_RATIO
      && given >= SPAM_TEAM_MULT * teamAverageGiven;
    return [user.id, { flagged, name: user.name, given, received, progress: given / SPAM_MIN_GIVEN, pardoned }];
  }));
}

export interface SpamWatchEntry {
  userId: string;
  name: string;
  given: number;
  received: number;
  progress: number;
  flagged: boolean;
  pardoned: boolean;
}

export function spamWatchlist(statuses: Map<string, SpamStatus>): SpamWatchEntry[] {
  return [...statuses.entries()]
    .map(([userId, status]) => ({
      userId,
      name: status.name,
      given: status.given,
      received: status.received,
      progress: Math.round(status.progress * 100) / 100,
      flagged: status.flagged,
      pardoned: status.pardoned,
    }))
    .filter((entry) => entry.flagged || (!entry.pardoned && entry.progress >= SPAM_WATCH_THRESHOLD && entry.given > entry.received))
    .sort((a, b) => b.progress - a.progress);
}
