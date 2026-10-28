const SESSION_TOKEN_KEY = 'my_token';
const CURRENT_USER_ID_KEY = 'my_id';
const LEGACY_TOKEN_KEY = 'my_user_id';
const LEGACY_NAME_KEY = 'my_user_name';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function migrateLegacySession(store) {
  const legacyToken = store.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken && !store.getItem(SESSION_TOKEN_KEY)) store.setItem(SESSION_TOKEN_KEY, legacyToken);
  store.removeItem(LEGACY_TOKEN_KEY);
  store.removeItem(LEGACY_NAME_KEY);
}

export function getSessionToken() {
  const store = storage();
  if (!store) return null;
  migrateLegacySession(store);
  return store.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(token) {
  storage()?.setItem(SESSION_TOKEN_KEY, token);
  storage()?.removeItem(CURRENT_USER_ID_KEY);
}

export function clearSession() {
  [SESSION_TOKEN_KEY, CURRENT_USER_ID_KEY, LEGACY_TOKEN_KEY, LEGACY_NAME_KEY].forEach((key) => storage()?.removeItem(key));
}

export const getCurrentUserId = () => storage()?.getItem(CURRENT_USER_ID_KEY) ?? null;
export const setCurrentUserId = (id) => storage()?.setItem(CURRENT_USER_ID_KEY, id);

export function captureLoginFromUrl() {
  const token = new URLSearchParams(location.hash.slice(1)).get('login')
    || new URLSearchParams(location.search).get('login_id');
  if (!token) return;
  setSessionToken(token);
  history.replaceState({}, document.title, location.pathname);
}

export function authFetch(url, options = {}) {
  const token = getSessionToken();
  const headers = { ...(options.headers ?? {}), ...(token && { Authorization: `Bearer ${token}` }) };
  return fetch(url, { ...options, headers });
}

export function postJson(url, body, method = 'POST') {
  return authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export const SESSION_CHECK_TIMEOUT_MS = 10000;
const REJECTED_SESSION_STATUSES = new Set([401, 403]);

export function sessionStatusOf(httpStatus) {
  if (REJECTED_SESSION_STATUSES.has(httpStatus)) return 'invalid';
  return httpStatus >= 200 && httpStatus < 300 ? 'ok' : 'unreachable';
}

export async function checkSession({ timeoutMs = SESSION_CHECK_TIMEOUT_MS } = {}) {
  if (!getSessionToken()) return { status: 'invalid' };
  try {
    const response = await authFetch('/api/me', { signal: AbortSignal.timeout(timeoutMs) });
    const status = sessionStatusOf(response.status);
    if (status !== 'ok') return { status };
    const me = await response.json();
    setCurrentUserId(me.id);
    return { status, me };
  } catch {
    return { status: 'unreachable' };
  }
}

export async function fetchCurrentUser() {
  return (await checkSession()).me ?? null;
}

export const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
export const SUPERADMIN_ROLES = ['superadmin', 'owner'];
