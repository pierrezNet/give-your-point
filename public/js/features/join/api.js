export async function fetchInvitation(code) {
  const response = await fetch(`/api/join/${encodeURIComponent(code)}`).catch(() => null);
  return response?.ok ? response.json() : null;
}

export async function joinTeam({ code, name, email, language, turnstileToken }) {
  const response = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name, email, locale: language, turnstile_token: turnstileToken }),
  });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}
