import { describe, expect, it } from 'vitest';
import { adminDareNotification, dareNotification, pointNotification } from '../../src/services/push';

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

describe('notifications push de gage', () => {
  it('annonce le gage au membre concerné', () => {
    expect(dareNotification({ language: 'fr', badge: '🤝 Entraide', dare: 'croissants' }).body).toBe('Tu as atteint le seuil de 🤝 Entraide : croissants');
  });

  it("renvoie l'admin vers sa console", () => {
    expect(adminDareNotification({ language: 'en', memberName: 'Bob', badge: '🤝 Help', dare: 'pastries' })).toEqual({
      title: '🚨 Forfeit in your team', body: 'Bob reached the threshold for 🤝 Help: pastries', url: '/admin.html',
    });
  });
});
