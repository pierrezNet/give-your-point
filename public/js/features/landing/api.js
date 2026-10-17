export async function createSpace(fields) {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}
