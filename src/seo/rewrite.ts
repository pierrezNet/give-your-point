import { pageMetadata, pagePath, serializeJsonLd, structuredData, translationFor, type Language, type PublicPage } from './metadata';

type Rewriter = InstanceType<typeof HTMLRewriter>;

const LOCALIZED_LINKS: Record<string, PublicPage> = { '/': 'home', '/about': 'about' };

function setAttribute(rewriter: Rewriter, selector: string, attribute: string, value: string): Rewriter {
  return rewriter.on(selector, { element: (element) => { element.setAttribute(attribute, value); } });
}

function withMetadata(rewriter: Rewriter, page: PublicPage, language: Language): Rewriter {
  const metadata = pageMetadata(page, language);
  const headExtras = [
    ...metadata.alternates.map((alternate) => `<link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}">`),
    `<meta property="og:locale:alternate" content="${metadata.ogLocaleAlternate}">`,
    ...structuredData(page, language).map((data) => `<script type="application/ld+json">${serializeJsonLd(data)}</script>`),
  ].join('\n    ');
  const metaContent: [string, string][] = [
    ['meta[name="description"]', metadata.description],
    ['meta[property="og:title"]', metadata.title],
    ['meta[property="og:description"]', metadata.description],
    ['meta[property="og:url"]', metadata.canonicalUrl],
    ['meta[property="og:locale"]', metadata.ogLocale],
    ['meta[property="og:site_name"]', metadata.siteName],
    ['meta[property="og:image"]', metadata.image.url],
    ['meta[property="og:image:width"]', String(metadata.image.width)],
    ['meta[property="og:image:height"]', String(metadata.image.height)],
    ['meta[property="og:image:alt"]', metadata.image.alt],
    ['meta[name="twitter:title"]', metadata.title],
    ['meta[name="twitter:description"]', metadata.description],
    ['meta[name="twitter:image"]', metadata.image.url],
    ['meta[name="twitter:image:alt"]', metadata.image.alt],
  ];
  const withMeta = metaContent.reduce((current, [selector, value]) => setAttribute(current, selector, 'content', value), rewriter);
  return setAttribute(setAttribute(withMeta, 'html', 'lang', language), 'link[rel="canonical"]', 'href', metadata.canonicalUrl)
    .on('title', { element: (element) => { element.setInnerContent(metadata.title); } })
    .on('head', { element: (element) => { element.append(headExtras, { html: true }); } });
}

function withTranslation(rewriter: Rewriter, language: Language): Rewriter {
  const translateAttribute = (dataAttribute: string, attribute: string) => rewriter.on(`[${dataAttribute}]`, {
    element: (element) => {
      const text = translationFor(language, element.getAttribute(dataAttribute) ?? '');
      if (text !== undefined) element.setAttribute(attribute, text);
    },
  });
  translateAttribute('data-i18n-placeholder', 'placeholder');
  translateAttribute('data-i18n-aria-label', 'aria-label');
  translateAttribute('data-i18n-title', 'title');
  return rewriter
    .on('[data-i18n]', {
      element: (element) => {
        const text = translationFor(language, element.getAttribute('data-i18n') ?? '');
        if (text !== undefined) element.setInnerContent(text);
      },
    })
    .on('[data-i18n-html]', {
      element: (element) => {
        const html = translationFor(language, element.getAttribute('data-i18n-html') ?? '');
        if (html !== undefined) element.setInnerContent(html, { html: true });
      },
    })
    .on('a[href]', {
      element: (element) => {
        const page = LOCALIZED_LINKS[element.getAttribute('href') ?? ''];
        if (page) element.setAttribute('href', pagePath(page, language));
      },
    });
}

export function renderPublicPage(asset: Response, page: PublicPage, language: Language): Response {
  const rewriter = withMetadata(new HTMLRewriter(), page, language);
  const localized = language === 'fr' ? rewriter : withTranslation(rewriter, language);
  return localized.transform(asset);
}
