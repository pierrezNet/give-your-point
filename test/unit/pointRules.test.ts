import { describe, expect, it } from 'vitest';
import {
  findPointRefusal, normalizeReason, MAX_POINTS_PER_DAY, MAX_POINTS_PER_RECIPIENT_PER_DAY, REASON_MAX_LENGTH,
} from '../../src/domain/pointRules';

const calm = { sameBadgeToRecipientRecently: false, givenToday: 0, givenToRecipientToday: 0, isFlaggedSpammer: false };

describe('findPointRefusal', () => {
  it('accepte un don ordinaire', () => {
    expect(findPointRefusal(calm)).toBeNull();
  });

  it('refuse le même badge au même collègue à quelques minutes d’intervalle', () => {
    expect(findPointRefusal({ ...calm, sameBadgeToRecipientRecently: true })).toBe('DUPLICATE');
  });

  it(`refuse au-delà de ${MAX_POINTS_PER_DAY} points par jour`, () => {
    expect(findPointRefusal({ ...calm, givenToday: MAX_POINTS_PER_DAY - 1 })).toBeNull();
    expect(findPointRefusal({ ...calm, givenToday: MAX_POINTS_PER_DAY })).toBe('DAILY_LIMIT');
  });

  it(`refuse au-delà de ${MAX_POINTS_PER_RECIPIENT_PER_DAY} points au même collègue par jour`, () => {
    expect(findPointRefusal({ ...calm, givenToRecipientToday: MAX_POINTS_PER_RECIPIENT_PER_DAY })).toBe('RECIPIENT_DAILY_LIMIT');
  });

  it('gèle un spammeur signalé', () => {
    expect(findPointRefusal({ ...calm, isFlaggedSpammer: true })).toBe('SPAMMER_FROZEN');
  });

  it('applique les refus dans l’ordre : doublon, quota, quota par collègue, spam', () => {
    expect(findPointRefusal({ sameBadgeToRecipientRecently: true, givenToday: 99, givenToRecipientToday: 99, isFlaggedSpammer: true })).toBe('DUPLICATE');
    expect(findPointRefusal({ ...calm, givenToday: 99, givenToRecipientToday: 99, isFlaggedSpammer: true })).toBe('DAILY_LIMIT');
    expect(findPointRefusal({ ...calm, givenToRecipientToday: 99, isFlaggedSpammer: true })).toBe('RECIPIENT_DAILY_LIMIT');
  });
});

describe('normalizeReason', () => {
  it('nettoie et tronque la raison', () => {
    expect(normalizeReason('  merci ')).toBe('merci');
    expect(normalizeReason('x'.repeat(200))).toHaveLength(REASON_MAX_LENGTH);
  });

  it.each([undefined, null, 3, '', '   '])('renvoie null pour %p', (raw) => {
    expect(normalizeReason(raw)).toBeNull();
  });
});
