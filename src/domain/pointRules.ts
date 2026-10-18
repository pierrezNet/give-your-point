export const REASON_MAX_LENGTH = 140;
export const DUPLICATE_WINDOW_MINUTES = 5;
export const MAX_POINTS_PER_DAY = 10;
export const MAX_POINTS_PER_RECIPIENT_PER_DAY = 3;
export const UNDO_WINDOW_SECONDS = 15;
export const REASON_EDIT_WINDOW_SECONDS = 300;
export const QUOTA_TIME_ZONE = 'Europe/Paris';

export type PointRefusal = 'DUPLICATE' | 'DAILY_LIMIT' | 'RECIPIENT_DAILY_LIMIT' | 'SPAMMER_FROZEN';

export interface GiverActivity {
  sameBadgeToRecipientRecently: boolean;
  givenToday: number;
  givenToRecipientToday: number;
  isFlaggedSpammer: boolean;
}

export function findPointRefusal(activity: GiverActivity): PointRefusal | null {
  if (activity.sameBadgeToRecipientRecently) return 'DUPLICATE';
  if (activity.givenToday >= MAX_POINTS_PER_DAY) return 'DAILY_LIMIT';
  if (activity.givenToRecipientToday >= MAX_POINTS_PER_RECIPIENT_PER_DAY) return 'RECIPIENT_DAILY_LIMIT';
  if (activity.isFlaggedSpammer) return 'SPAMMER_FROZEN';
  return null;
}

export function normalizeReason(raw: unknown): string | null {
  return typeof raw === 'string' ? raw.trim().slice(0, REASON_MAX_LENGTH) || null : null;
}

function utcOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function startOfQuotaDay(now: Date, timeZone = QUOTA_TIME_ZONE): string {
  const localDate = new Date(now.getTime() + utcOffsetMs(now, timeZone));
  const localMidnightAsUtc = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
  const firstGuess = new Date(localMidnightAsUtc - utcOffsetMs(now, timeZone));
  const midnight = new Date(localMidnightAsUtc - utcOffsetMs(firstGuess, timeZone));
  return midnight.toISOString().slice(0, 19).replace('T', ' ');
}
