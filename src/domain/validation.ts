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
