export async function sendFeedback(feedback) {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}
