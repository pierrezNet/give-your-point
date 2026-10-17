import { escapeHtml } from './html';

export type Language = 'fr' | 'en';
export type OgPage = '/' | '/about';

export interface OgData {
  title: string;
  desc: string;
  locale: string;
}

const OG_DATA: Record<OgPage, Record<Language, OgData>> = {
  '/': {
    fr: {
      title: "Donne Ton Point — Le rituel d'équipe",
      desc: "Récompense les bons coups (et les bourdes) de ton équipe avec des badges. Quand un seuil est atteint, c'est gage !",
      locale: 'fr_FR',
    },
    en: {
      title: 'Give Your Point — The team ritual',
      desc: 'Reward the wins (and the goofs) of your team with badges. When a threshold is reached, time for a dare!',
      locale: 'en_US',
    },
  },
  '/about': {
    fr: {
      title: "À propos — Donne Ton Point",
      desc: "Présentation, modèle de rôles, politique RGPD et contact.",
      locale: 'fr_FR',
    },
    en: {
      title: 'About — Give Your Point',
      desc: 'Presentation, roles model, GDPR policy and contact.',
      locale: 'en_US',
    },
  },
};

export function languageFromAcceptLanguage(header: string | undefined): Language {
  return (header || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function ogDataFor(page: OgPage, language: Language): OgData {
  return OG_DATA[page][language];
}

export function fillOgPlaceholders(html: string, og: OgData, origin: string): string {
  return html
    .replace(/\{\{OG_TITLE\}\}/g, escapeHtml(og.title))
    .replace(/\{\{OG_DESC\}\}/g, escapeHtml(og.desc))
    .replace(/\{\{OG_URL\}\}/g, escapeHtml(origin))
    .replace(/\{\{OG_LOCALE\}\}/g, og.locale);
}
