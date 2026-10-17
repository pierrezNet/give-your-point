import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';

export function ruleHtml(rule) {
  const id = escapeHtml(rule.id);
  return `
    <div id="rule-row-${id}" class="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
      <div class="rule-display flex justify-between items-center">
        <span class="text-sm">${t('admin.rule_if')} <b>${escapeHtml(rule.cat_emoji)} ${escapeHtml(rule.cat_name)}</b> ${t('admin.rule_reaches')} <b>${escapeHtml(rule.threshold)}</b> ${t('admin.rule_then')} <span class="text-orange-700 font-bold">${escapeHtml(rule.dare_text)}</span></span>
        <div class="flex gap-3 shrink-0 ml-3">
          <button type="button" data-action="edit-rule" data-rule-id="${id}" class="text-blue-700 hover:text-blue-800 text-xs font-bold">${t('common.edit')}</button>
          <button type="button" data-action="delete-rule" data-rule-id="${id}" class="text-red-600 hover:text-red-700 text-xs font-bold">${t('common.delete')}</button>
        </div>
      </div>
      <form class="rule-edit hidden mt-2 flex gap-2 items-center" data-rule-id="${id}">
        <input type="number" name="threshold" min="1" max="1000" class="w-20 p-2 rounded-lg border text-sm" value="${escapeHtml(rule.threshold)}" aria-label="${t('admin.rule_threshold')}">
        <input type="text" name="dare_text" maxlength="140" class="flex-1 p-2 rounded-lg border text-sm" value="${escapeHtml(rule.dare_text)}" aria-label="${t('admin.rule_dare_text')}">
        <button type="submit" class="bg-orange-600 text-white px-3 py-2 rounded-lg text-xs font-bold">${t('common.save')}</button>
        <button type="button" data-action="cancel-rule-edit" data-rule-id="${id}" class="text-slate-500 text-xs font-bold">${t('common.cancel')}</button>
      </form>
    </div>`;
}

