import { t } from '../core/i18n.js';

export const languageSwitchHtml = (buttonClass = 'px-1') => `
  <button type="button" data-lang-toggle="fr" class="${buttonClass}" lang="fr">FR</button>
  <span class="text-slate-300" aria-hidden="true">|</span>
  <button type="button" data-lang-toggle="en" class="${buttonClass}" lang="en">EN</button>`;

export const publicHeaderHtml = ({ withAboutLink }) => `
  <header class="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="text-2xl" aria-hidden="true">🎯</span>
        <span class="font-black text-slate-800">${t('app.title')}</span>
      </a>
      <nav class="flex items-center gap-3 text-xs font-bold text-slate-500">
        ${withAboutLink ? `<a href="/about" class="px-1 hover:text-slate-800">${t('nav.about')}</a><span class="text-slate-300" aria-hidden="true">|</span>` : ''}
        ${languageSwitchHtml()}
      </nav>
    </div>
  </header>`;
