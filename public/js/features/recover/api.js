export async function requestMagicLink(email, turnstileToken) {
  const response = await fetch('/api/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, turnstile_token: turnstileToken }),
  }).catch(() => null);
  return { captchaRejected: response?.status === 403 };
}
