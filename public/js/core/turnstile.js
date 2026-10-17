const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

let siteKeyPromise = null;

export function turnstileSiteKey() {
  siteKeyPromise ??= fetch('/api/config')
    .then((response) => (response.ok ? response.json() : {}))
    .then((config) => config.turnstileSiteKey || '')
    .catch(() => '');
  return siteKeyPromise;
}

export function loadTurnstile() {
  if (document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) return;
  const script = document.createElement('script');
  script.src = TURNSTILE_SCRIPT;
  script.async = true;
  document.head.append(script);
}

export function renderTurnstile(container, siteKey) {
  if (window.turnstile && siteKey) window.turnstile.render(container, { sitekey: siteKey });
}

export const turnstileToken = (scope = document) => scope.querySelector('[name="cf-turnstile-response"]')?.value ?? '';

export function resetTurnstile(container) {
  try {
    window.turnstile?.reset(container);
  } catch {
    return;
  }
}
