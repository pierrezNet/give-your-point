import { t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';

const HELP_STEPS = ['help.step1', 'help.step2', 'help.step3', 'help.step4'];

export const helpHtml = () => `
  <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
    <h2 class="text-xl font-black text-slate-800">${t('help.title')}</h2>
    ${closeButtonHtml()}
  </div>
  <ol class="text-sm text-slate-600 space-y-3 list-none">
    ${HELP_STEPS.map((key, index) => `<li class="flex gap-3"><span class="font-black text-blue-600 shrink-0">${index + 1}.</span> ${t(key)}</li>`).join('')}
    <li class="flex gap-3"><span class="font-black text-orange-700 shrink-0" aria-hidden="true">⚠️</span> ${t('help.step5')}</li>
  </ol>`;
