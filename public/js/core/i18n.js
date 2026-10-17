import { translations } from './translations.js';
import { escapeHtml } from './html.js';
import { authFetch, getSessionToken } from './session.js';

const LANGUAGE_KEY = 'lang';
const DEFAULT_LANGUAGE = 'fr';

const ENGLISH_PATH = /^\/en(\/|$)/;
const LOCALIZED_PAGES = { '/': '/en/', '/about': '/en/about' };

const languageFromPath = () => (ENGLISH_PATH.test(globalThis.location?.pathname ?? '') ? 'en' : null);

function storedLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_KEY);
    return stored && translations[stored] ? stored : null;
  } catch {
    return null;
  }
}

const browserLanguage = () => ((globalThis.navigator?.language || DEFAULT_LANGUAGE).toLowerCase().startsWith('en') ? 'en' : DEFAULT_LANGUAGE);

export const getLang = () => languageFromPath() ?? storedLanguage() ?? browserLanguage();

export function localizedPathFor(language, pathname) {
  const frenchPath = Object.entries(LOCALIZED_PAGES).find(([, english]) => english === pathname)?.[0] ?? pathname;
  if (!(frenchPath in LOCALIZED_PAGES)) return null;
  return language === 'en' ? LOCALIZED_PAGES[frenchPath] : frenchPath;
}

const lookup = (key) => translations[getLang()]?.[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;

const interpolate = (template, params, encode) =>
  Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, encode(String(value))), template);

export const t = (key, params = {}) => interpolate(lookup(key), params, escapeHtml);
export const tText = (key, params = {}) => interpolate(lookup(key), params, (value) => value);
export const hasTranslation = (key) => lookup(key) !== key;
export const dateLocale = () => (getLang() === 'en' ? 'en-GB' : 'fr-FR');

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = lookup(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((element) => { element.innerHTML = lookup(element.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = lookup(element.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => { element.title = lookup(element.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => element.setAttribute('aria-label', lookup(element.dataset.i18nAriaLabel)));
  const language = getLang();
  root.querySelectorAll('[data-lang-toggle]').forEach((button) => button.classList.toggle('active', button.dataset.langToggle === language));
  document.documentElement.lang = language;
}

export async function setLang(language) {
  if (!translations[language]) return;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    return;
  }
  if (getSessionToken()) {
    await authFetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: language }),
    }).catch(() => null);
  }
  const localizedPath = localizedPathFor(language, location.pathname);
  if (localizedPath && localizedPath !== location.pathname) location.assign(`${localizedPath}${location.search}${location.hash}`);
  else location.reload();
}

export function bindLanguageToggles() {
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-lang-toggle]');
    if (toggle) setLang(toggle.dataset.langToggle);
  });
}
