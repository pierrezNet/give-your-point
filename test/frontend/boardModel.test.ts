import { describe, expect, it } from 'vitest';
import { newlyTriggeredDares } from '../../public/js/features/board/model.js';

const member = (id: string, gage: string | null) => ({ id, name: id.toUpperCase(), gage });

describe('newlyTriggeredDares', () => {
  it('annonce un gage apparu depuis le dernier classement', () => {
    expect(newlyTriggeredDares([member('a', null), member('b', null)], [member('a', 'croissants'), member('b', null)]))
      .toEqual([{ name: 'A', dare: 'croissants' }]);
  });

  it("n'annonce rien au premier affichage", () => {
    expect(newlyTriggeredDares([], [member('a', 'croissants')])).toEqual([]);
  });

  it("n'annonce pas un gage déjà connu ni un nouveau membre", () => {
    expect(newlyTriggeredDares([member('a', 'croissants')], [member('a', 'croissants'), member('n', 'pizza')])).toEqual([]);
  });
});
