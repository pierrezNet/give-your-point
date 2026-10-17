import { applyI18n, bindLanguageToggles } from './i18n.js';
import { captureLoginFromUrl, getSessionToken } from './session.js';

const CANONICAL_ORIGIN = 'https://donnetonpoint.fr';
const LEGACY_HOSTS = new Set(['compteur.pierrez.net', 'give-your-point.pages.dev']);

function moveToCanonicalDomain() {
  const token = getSessionToken();
  const fragment = token ? `#login=${encodeURIComponent(token)}` : location.hash;
  location.replace(`${CANONICAL_ORIGIN}${location.pathname}${location.search}${fragment}`);
}

export function startPage() {
  if (LEGACY_HOSTS.has(location.hostname)) {
    moveToCanonicalDomain();
    return false;
  }
  captureLoginFromUrl();
  bindLanguageToggles();
  applyI18n();
  return true;
}
