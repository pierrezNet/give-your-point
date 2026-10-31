import { t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';

export const FORUM_URL = 'https://avrobb.org/forum/3-donne-ton-point';
export const FEEDBACK_TYPES = ['bug', 'suggestion', 'question', 'other'];
export const FEEDBACK_MESSAGE_MAX_LENGTH = 1800;
export const FEEDBACK_PSEUDO_MAX_LENGTH = 40;
export const FEEDBACK_CONTACT_MAX_LENGTH = 120;

const FIELD_CLASS = 'w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500';
const LABEL_CLASS = 'block text-sm font-bold text-slate-700 mb-1';
const forumLink = () => `<a href="${FORUM_URL}" target="_blank" rel="noopener" class="font-bold text-blue-700 underline">${t('feedback.forum_link')}</a>`;

export const counterText = (length) => `${length} / ${FEEDBACK_MESSAGE_MAX_LENGTH}`;

export const feedbackFormHtml = () => `
  <div class="flex justify-between items-center mb-2">
    <h2 class="text-xl font-black text-slate-800">${t('feedback.title')}</h2>
    ${closeButtonHtml()}
  </div>
  <p class="text-sm text-slate-600 mb-4">${t('feedback.intro')}</p>
  <form id="feedback-form" class="space-y-4" novalidate>
    <div>
      <label for="feedback-type" class="${LABEL_CLASS}">${t('feedback.type_label')}</label>
      <select id="feedback-type" name="type" class="${FIELD_CLASS}">
        ${FEEDBACK_TYPES.map((type) => `<option value="${type}">${t(`feedback.type_${type}`)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label for="feedback-message" class="${LABEL_CLASS}">${t('feedback.message_label')}</label>
      <textarea id="feedback-message" name="message" rows="5" required maxlength="${FEEDBACK_MESSAGE_MAX_LENGTH}" autofocus
                aria-describedby="feedback-counter" placeholder="${t('feedback.message_placeholder')}" class="${FIELD_CLASS} resize-y"></textarea>
      <p id="feedback-counter" class="text-xs text-slate-600 text-right">${counterText(0)}</p>
    </div>
    <div>
      <label for="feedback-pseudo" class="${LABEL_CLASS}">${t('feedback.pseudo_label')}</label>
      <input id="feedback-pseudo" name="pseudo" type="text" maxlength="${FEEDBACK_PSEUDO_MAX_LENGTH}" autocomplete="nickname"
             placeholder="${t('feedback.pseudo_placeholder')}" class="${FIELD_CLASS}" />
    </div>
    <div>
      <label for="feedback-contact" class="${LABEL_CLASS}">${t('feedback.contact_label')}</label>
      <input id="feedback-contact" name="contact" type="text" maxlength="${FEEDBACK_CONTACT_MAX_LENGTH}" autocomplete="email"
             placeholder="${t('feedback.contact_placeholder')}" class="${FIELD_CLASS}" />
    </div>
    <div id="feedback-turnstile" data-size="flexible"></div>
    <p id="feedback-error" class="text-sm text-red-600 hidden" role="alert"></p>
    <div class="flex justify-end gap-2">
      <button type="button" data-close-modal class="px-4 py-2 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200">${t('common.cancel')}</button>
      <button type="submit" id="feedback-submit" class="px-4 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">${t('feedback.submit')}</button>
    </div>
  </form>`;

export const feedbackSentHtml = () => `
  <div class="text-center space-y-3" role="status">
    <div class="text-4xl" aria-hidden="true">✅</div>
    <h2 class="text-xl font-black text-slate-800">${t('feedback.sent_title')}</h2>
    <p class="text-sm text-slate-600">${t('feedback.sent_desc')} ${forumLink()}</p>
    <button type="button" data-close-modal class="px-4 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700">${t('common.close')}</button>
  </div>`;

export const feedbackErrorHtml = (message) => `${message} ${forumLink()}`;
