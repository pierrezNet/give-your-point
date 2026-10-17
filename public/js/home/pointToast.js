import { tText } from '../core/i18n.js';

const STYLES = {
  success: { background: 'bg-slate-800', durationMs: 5000, undoable: true },
  warning: { background: 'bg-amber-500', durationMs: 6000, undoable: true },
  danger: { background: 'bg-rose-600', durationMs: 8000, undoable: true },
  error: { background: 'bg-orange-600', durationMs: 5000, undoable: false },
};

export function hidePointToast() {
  document.getElementById('toast-notification')?.remove();
}

export function showPointToast(message, type = 'success') {
  hidePointToast();
  const { background, durationMs, undoable } = STYLES[type] ?? STYLES.error;
  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 ${background} text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-4 max-w-[90vw]`;
  toast.innerHTML = `<span class="text-sm font-medium"></span>${undoable
    ? '<button type="button" data-action="undo-last-point" class="text-yellow-200 font-black uppercase text-xs hover:text-white transition-colors shrink-0"></button>'
    : ''}`;
  toast.querySelector('span').textContent = message;
  if (undoable) toast.querySelector('button').textContent = tText('toast.undo');
  document.body.append(toast);
  setTimeout(() => toast.remove(), durationMs);
}
