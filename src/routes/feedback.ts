import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError, readJsonObject } from '../http/errors';
import { parseFeedback } from '../domain/feedback';
import { passesTurnstile } from '../services/turnstile';

export const feedbackRoutes = new Hono<AppEnv>();

feedbackRoutes.post('/api/feedback', async (c) => {
  const body = await readJsonObject(c);
  const feedback = parseFeedback(body);
  if (!feedback) return apiError(c, 'FEEDBACK_INVALID');
  if (!await passesTurnstile(c, body.turnstile_token)) return apiError(c, 'TURNSTILE_FAILED');
  if (!c.env.FORUM) return apiError(c, 'FEEDBACK_UNAVAILABLE');
  try {
    const result = await c.env.FORUM.submit(feedback);
    if (!result.ok) {
      console.error('Le forum a refusé le retour', result.reason);
      return apiError(c, 'FEEDBACK_UNAVAILABLE');
    }
  } catch (error) {
    console.error("Le forum n'a pas reçu le retour", error);
    return apiError(c, 'FEEDBACK_UNAVAILABLE');
  }
  return c.json({ success: true });
});
