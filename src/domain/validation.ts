export const NAME_MAX_LENGTH = 40;
export const ORGANIZATION_NAME_MAX_LENGTH = 60;

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function normalizeOptionalEmail(raw: unknown): string | null {
  const email = typeof raw === 'string' ? raw.trim() : '';
  return email && isValidEmail(email) ? email : null;
}

export function normalizeName(raw: unknown, { min = 1, max = NAME_MAX_LENGTH } = {}): string | null {
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name.length >= min && name.length <= max ? name : null;
}

export const EMOJI_MAX_LENGTH = 16;
export const DARE_TEXT_MAX_LENGTH = 140;
export const MAX_DARE_THRESHOLD = 1000;

export function normalizeEmoji(raw: unknown): string | null {
  return normalizeName(raw, { max: EMOJI_MAX_LENGTH });
}

export function normalizeDareText(raw: unknown): string | null {
  return normalizeName(raw, { max: DARE_TEXT_MAX_LENGTH });
}

export function normalizeThreshold(raw: unknown): number | null {
  const threshold = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 1 && threshold <= MAX_DARE_THRESHOLD
    ? threshold
    : null;
}
