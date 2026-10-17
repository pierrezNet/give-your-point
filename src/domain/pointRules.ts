export const REASON_MAX_LENGTH = 140;
export const DUPLICATE_WINDOW_MINUTES = 5;
export const MAX_POINTS_PER_DAY = 10;
export const MAX_POINTS_PER_RECIPIENT_PER_DAY = 3;
export const UNDO_WINDOW_SECONDS = 15;

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
