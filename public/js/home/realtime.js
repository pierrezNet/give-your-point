import { getSessionToken } from '../core/session.js';
import { isModalOpen } from '../core/dialogs.js';
import { isRenderingTransition, renderUsers } from './scoreboard.js';

const RECONNECT_DELAY_MS = 5000;

export function startRealtimeScores() {
  const token = getSessionToken();
  if (!token) return;
  const source = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
  source.addEventListener('stats', (event) => {
    if (isModalOpen() || isRenderingTransition()) return;
    renderUsers(JSON.parse(event.data));
  });
  source.addEventListener('error', () => {
    source.close();
    setTimeout(startRealtimeScores, RECONNECT_DELAY_MS);
  });
}
