import { describe, expect, it } from 'vitest';
import { pointNotification } from '../../src/services/push';

describe('notification push de point reçu', () => {
  it('est rédigée dans la langue du destinataire', () => {
    expect(pointNotification({ language: 'fr', fromName: 'Ann', badge: '🤝 Entraide' }).body).toBe("Ann t'a donné un point pour 🤝 Entraide !");
    expect(pointNotification({ language: 'en', fromName: 'Ann', badge: '🤝 Help' })).toEqual({
      title: '🎯 Give Your Point', body: 'Ann gave you a point for 🤝 Help!', url: '/en/',
    });
  });

  it('reste lisible si le badge a disparu', () => {
    expect(pointNotification({ language: 'fr', fromName: 'Ann', badge: null }).body).toContain('un badge');
  });
});
