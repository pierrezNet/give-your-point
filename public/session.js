const SESSION_TOKEN_KEY = 'my_token';
const CURRENT_USER_ID_KEY = 'my_id';
const LEGACY_TOKEN_KEY = 'my_user_id';
const LEGACY_NAME_KEY = 'my_user_name';

function migrateLegacySession() {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken && !localStorage.getItem(SESSION_TOKEN_KEY)) {
    localStorage.setItem(SESSION_TOKEN_KEY, legacyToken);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_NAME_KEY);
}

function captureLoginFromUrl() {
  const token = new URLSearchParams(location.hash.slice(1)).get('login')
    || new URLSearchParams(location.search).get('login_id');
  if (!token) return;
  setSessionToken(token);
  history.replaceState({}, document.title, location.pathname);
}

function getSessionToken() {
  try {
    migrateLegacySession();
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setSessionToken(token) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    localStorage.removeItem(CURRENT_USER_ID_KEY);
  } catch {}
}

function clearSession() {
  try {
    [SESSION_TOKEN_KEY, CURRENT_USER_ID_KEY, LEGACY_TOKEN_KEY, LEGACY_NAME_KEY].forEach((key) => localStorage.removeItem(key));
  } catch {}
}

function getCurrentUserId() {
  try {
    return localStorage.getItem(CURRENT_USER_ID_KEY);
  } catch {
    return null;
  }
}

function setCurrentUserId(id) {
  try {
    localStorage.setItem(CURRENT_USER_ID_KEY, id);
  } catch {}
}

function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { ...(options.headers || {}), ...authHeaders() } });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function apiErrorMessage(body, fallbackKey) {
  const key = body && body.code ? `errors.${body.code}` : null;
  if (key && typeof t === 'function' && t(key, body.params || {}) !== key) return t(key, body.params || {});
  return (body && body.error) || (typeof t === 'function' ? t(fallbackKey) : fallbackKey);
}
