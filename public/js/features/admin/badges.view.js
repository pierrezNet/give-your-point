import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';

export function badgeCardHtml(category) {
  const isActive = category.active === 1;
  return `
    <div class="relative flex flex-col p-5 bg-white rounded-2xl border-2 ${isActive ? 'border-slate-100' : 'border-slate-50 bg-slate-50/50'} transition-all shadow-sm">
      <div class="flex items-center gap-4 mb-4">
        <span class="text-4xl ${isActive ? '' : 'grayscale opacity-30'}" aria-hidden="true">${escapeHtml(category.emoji)}</span>
        <div class="flex flex-col">
          <span class="font-bold text-lg ${isActive ? 'text-slate-800' : 'text-slate-500 italic'}">${escapeHtml(category.name)}</span>
          <span class="text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-700' : 'text-slate-500'}">${t(isActive ? 'admin.badge_active' : 'admin.badge_inactive')}</span>
        </div>
      </div>
      <div class="flex justify-end mt-auto">
        <button type="button" data-action="${isActive ? 'deactivate-badge' : 'restore-badge'}" data-category-id="${escapeHtml(category.id)}"
                class="p-2 rounded-xl transition-all ${isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}"
                title="${t(isActive ? 'common.deactivate' : 'common.restore')}" aria-label="${t(isActive ? 'common.deactivate' : 'common.restore')} : ${escapeHtml(category.name)}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isActive ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M12 4v16m8-8H4'}" />
          </svg>
        </button>
      </div>
    </div>`;
}

export const badgeOptionsHtml = (categories) => categories
  .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</option>`).join('');
