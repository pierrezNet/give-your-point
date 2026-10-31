export const FEEDBACK_MESSAGE_MAX_LENGTH = 1800;
export const FEEDBACK_PSEUDO_MAX_LENGTH = 40;
export const FEEDBACK_CONTACT_MAX_LENGTH = 120;

export const FEEDBACK_TYPE_LABELS = {
  bug: 'Bug',
  suggestion: 'Suggestion / idée',
  question: 'Question',
  other: 'Autre',
} as const;

export type FeedbackType = keyof typeof FEEDBACK_TYPE_LABELS;

export interface ForumFeedback {
  type: (typeof FEEDBACK_TYPE_LABELS)[FeedbackType];
  message: string;
  pseudo: string;
  contact: string;
  lang: 'fr' | 'en';
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isFeedbackType = (value: string): value is FeedbackType => Object.hasOwn(FEEDBACK_TYPE_LABELS, value);

export function parseFeedback(body: Record<string, unknown>): ForumFeedback | null {
  const type = text(body.type);
  const message = text(body.message);
  const pseudo = text(body.pseudo).replace(/\s+/g, ' ');
  const contact = text(body.contact);
  if (!isFeedbackType(type)) return null;
  if (!message || message.length > FEEDBACK_MESSAGE_MAX_LENGTH) return null;
  if (pseudo.length > FEEDBACK_PSEUDO_MAX_LENGTH || contact.length > FEEDBACK_CONTACT_MAX_LENGTH) return null;
  return { type: FEEDBACK_TYPE_LABELS[type], message, pseudo, contact, lang: body.lang === 'en' ? 'en' : 'fr' };
}
