import { translations } from '../../public/js/core/translations.js';

export type Language = 'fr' | 'en';
export type PublicPage = 'home' | 'about';

export const LANGUAGES: Language[] = ['fr', 'en'];
export const CANONICAL_ORIGIN = 'https://donnetonpoint.fr';
export const SITE_NAME: Record<Language, string> = { fr: 'Donne Ton Point', en: 'Give Your Point' };
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

const PAGE_PATHS: Record<PublicPage, Record<Language, string>> = {
  home: { fr: '/', en: '/en/' },
  about: { fr: '/about', en: '/en/about' },
};

const PAGE_COPY: Record<PublicPage, Record<Language, { title: string; description: string }>> = {
  home: {
    fr: {
      title: "Donne Ton Point — Le rituel d'équipe",
      description: "Récompense les bons coups (et les bourdes) de ton équipe avec des badges. Quand un seuil est atteint, c'est gage !",
    },
    en: {
      title: 'Give Your Point — The team ritual',
      description: 'Reward the wins (and the goofs) of your team with badges. When a threshold is reached, time for a dare!',
    },
  },
  about: {
    fr: {
      title: 'À propos — Donne Ton Point',
      description: 'Présentation, cloisonnement des sociétés et des équipes, rôles, politique RGPD et contact.',
    },
    en: {
      title: 'About — Give Your Point',
      description: 'Presentation, isolation between companies and teams, roles, GDPR policy and contact.',
    },
  },
};

const OG_LOCALES: Record<Language, string> = { fr: 'fr_FR', en: 'en_US' };
const OG_IMAGE_ALT: Record<Language, string> = {
  fr: 'Donne Ton Point : classement d’équipe avec badges et gage déclenché',
  en: 'Give Your Point: team leaderboard with badges and a triggered dare',
};

export interface PageMetadata {
  language: Language;
  title: string;
  description: string;
  canonicalUrl: string;
  alternates: { hreflang: string; href: string }[];
  ogLocale: string;
  ogLocaleAlternate: string;
  image: { url: string; alt: string; width: number; height: number };
  siteName: string;
}

export const absoluteUrl = (path: string) => `${CANONICAL_ORIGIN}${path}`;
export const pagePath = (page: PublicPage, language: Language) => PAGE_PATHS[page][language];

export function pageMetadata(page: PublicPage, language: Language): PageMetadata {
  const other: Language = language === 'fr' ? 'en' : 'fr';
  return {
    language,
    ...PAGE_COPY[page][language],
    canonicalUrl: absoluteUrl(pagePath(page, language)),
    alternates: [
      ...LANGUAGES.map((alternate) => ({ hreflang: alternate, href: absoluteUrl(pagePath(page, alternate)) })),
      { hreflang: 'x-default', href: absoluteUrl(pagePath(page, 'fr')) },
    ],
    ogLocale: OG_LOCALES[language],
    ogLocaleAlternate: OG_LOCALES[other],
    image: { url: absoluteUrl(`/og-${language}.png`), alt: OG_IMAGE_ALT[language], ...OG_IMAGE_SIZE },
    siteName: SITE_NAME[language],
  };
}

const FAQ_ENTRIES = ['free', 'data', 'account'];

export function structuredData(page: PublicPage, language: Language): object[] {
  const metadata = pageMetadata(page, language);
  const application = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: metadata.siteName,
    url: absoluteUrl(pagePath('home', language)),
    description: PAGE_COPY.home[language].description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: language,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
  if (page !== 'home') return [application];
  const dictionary = translations[language] as Record<string, string>;
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: language,
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      '@type': 'Question',
      name: dictionary[`landing.faq_${entry}_q`],
      acceptedAnswer: { '@type': 'Answer', text: dictionary[`landing.faq_${entry}_a`] },
    })),
  };
  return [application, faq];
}

export const serializeJsonLd = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c');

export function translationFor(language: Language, key: string): string | undefined {
  return (translations[language] as Record<string, string>)[key];
}
