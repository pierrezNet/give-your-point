import { describe, expect, it } from 'vitest';
import { canManageLink, outranks } from '../../src/domain/roles';

describe('outranks', () => {
  it('compare strictement les rangs member < admin < superadmin < owner', () => {
    expect(outranks('admin', 'member')).toBe(true);
    expect(outranks('superadmin', 'admin')).toBe(true);
    expect(outranks('owner', 'superadmin')).toBe(true);
  });

  it("n'accorde rien à rang égal ou inférieur", () => {
    expect(outranks('admin', 'admin')).toBe(false);
    expect(outranks('admin', 'superadmin')).toBe(false);
    expect(outranks('superadmin', 'owner')).toBe(false);
  });

  it('traite un rôle inconnu comme un membre', () => {
    expect(outranks('admin', 'inconnu')).toBe(true);
    expect(outranks('inconnu', 'member')).toBe(false);
  });
});

describe('canManageLink', () => {
  const admin = { id: 'a', role: 'admin' };

  it('autorise son propre lien, même sans rang supérieur', () => {
    expect(canManageLink(admin, admin)).toBe(true);
  });

  it("autorise le lien d'un rôle inférieur", () => {
    expect(canManageLink(admin, { id: 'm', role: 'member' })).toBe(true);
  });

  it("refuse le lien d'un pair ou d'un supérieur", () => {
    expect(canManageLink(admin, { id: 'b', role: 'admin' })).toBe(false);
    expect(canManageLink(admin, { id: 's', role: 'superadmin' })).toBe(false);
  });
});
