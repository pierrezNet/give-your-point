import { tText } from './i18n.js';

const TOAST_DURATION_MS = 3400;
const FADE_MS = 200;

const TOAST_STYLES = {
  info: 'bg-slate-800 text-white',
  success: 'bg-emerald-700 text-white',
  error: 'bg-red-600 text-white',
};

function toastRoot() {
  let root = document.getElementById('ui-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-toast-root';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.className = 'fixed z-[9999] bottom-4 right-4 flex flex-col gap-2 items-end pointer-events-none';
    document.body.append(root);
  }
  return root;
}

export function uiToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto max-w-xs px-4 py-3 rounded-xl shadow-lg text-sm font-bold whitespace-pre-line ${TOAST_STYLES[type] ?? TOAST_STYLES.info} opacity-0 translate-y-2 transition-all duration-200`;
  toast.textContent = message;
  toastRoot().append(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0', 'translate-y-2'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), FADE_MS);
  }, TOAST_DURATION_MS);
}

export const isModalOpen = () => document.querySelector('[data-modal]') !== null;

export const closeButtonHtml = () =>
  `<button type="button" data-close-modal aria-label="${tText('common.close')}" class="text-slate-600 hover:text-slate-600 text-3xl leading-none">&times;</button>`;

const clickedOutside = (dialog, event) => {
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
};

export function openModal({ id, content, panelClass = 'bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl', onClose }) {
  document.getElementById(id)?.remove();
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.dataset.modal = '';
  dialog.className = panelClass;
  dialog.innerHTML = content;

  const close = () => {
    if (!dialog.isConnected) return;
    dialog.close();
    dialog.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
    onClose?.();
  };

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]') || (event.target === dialog && clickedOutside(dialog, event))) close();
  });
  document.body.append(dialog);
  const heading = dialog.querySelector('h2');
  if (heading) {
    heading.id ||= `${id}-title`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus();
  return { element: dialog, close };
}

function askInDialog({ message, withInput, defaultValue = '', placeholder = '' }) {
  return new Promise((resolve) => {
    const { element, close } = openModal({
      id: 'ui-dialog',
      panelClass: 'bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6',
      onClose: () => resolve(withInput ? null : false),
      content: `
        <form class="ui-form">
          <p class="ui-msg text-slate-700 text-sm leading-relaxed mb-3 whitespace-pre-line"></p>
          ${withInput ? '<input class="ui-input w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 mb-5" type="text" autofocus />' : ''}
          <div class="flex justify-end gap-2 mt-2">
            <button type="button" data-close-modal class="px-4 py-2 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition-colors"></button>
            <button type="submit" class="ui-ok px-4 py-2 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors" ${withInput ? '' : 'autofocus'}></button>
          </div>
        </form>`,
    });
    element.querySelector('.ui-msg').textContent = message;
    element.querySelector('[data-close-modal]').textContent = tText('common.cancel');
    element.querySelector('.ui-ok').textContent = tText('common.confirm');
    const input = element.querySelector('.ui-input');
    if (input) {
      input.value = defaultValue;
      input.placeholder = placeholder;
      input.focus();
      input.select();
    }
    element.querySelector('.ui-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = input ? input.value : true;
      resolve(answer);
      close();
    });
  });
}

export const uiConfirm = (message) => askInDialog({ message, withInput: false });
export const uiPrompt = (message, defaultValue = '', placeholder = '') => askInDialog({ message, withInput: true, defaultValue, placeholder });
