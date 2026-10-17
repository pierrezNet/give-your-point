import { applyI18n, bindLanguageToggles } from './i18n.js';

export function startPage() {
  bindLanguageToggles();
  applyI18n();
}
