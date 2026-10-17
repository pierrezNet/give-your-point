import { openModal } from '../../core/dialogs.js';
import { registerActions } from '../../core/actions.js';
import { helpHtml } from './view.js';

export function startHelp() {
  registerActions({ 'show-help': () => openModal({ id: 'help-modal', content: helpHtml() }) });
}
