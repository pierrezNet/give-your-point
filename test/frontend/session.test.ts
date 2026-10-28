import { describe, expect, it } from 'vitest';
import { sessionStatusOf } from '../../public/js/core/session.js';

describe('statut de session à partir de la réponse de /api/me', () => {
  it.each([[200, 'ok'], [401, 'invalid'], [403, 'invalid'], [500, 'unreachable'], [502, 'unreachable'], [503, 'unreachable'], [429, 'unreachable']])(
    'HTTP %i → %s', (httpStatus, status) => {
      expect(sessionStatusOf(httpStatus)).toBe(status);
    },
  );
});
