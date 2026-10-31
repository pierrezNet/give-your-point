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
  let script = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`);
  if (!script) {
    script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    document.head.append(script);
  }
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve) => {
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', resolve, { once: true });
  });
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
