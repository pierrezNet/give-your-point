import { tText } from '../../core/i18n.js';
import { openModal, uiToast } from '../../core/dialogs.js';
import { fetchHistory } from './api.js';
import { historyHtml } from './view.js';

export async function showHistory(userId, userName) {
  const history = await fetchHistory(userId);
  if (!history) {
    uiToast(tText('history.error'));
    return;
  }
  openModal({
    id: 'history-modal',
    panelClass: 'bg-white rounded-3xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl',
    content: historyHtml(userName, history),
  });
}
