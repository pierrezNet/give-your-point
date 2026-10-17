import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext } from '../env';

const API_ERRORS = {
  INVALID_REQUEST: [400, 'Requête invalide'],
  INTERNAL: [500, 'Erreur interne'],
  UNAUTHENTICATED: [401, 'Non autorisé'],
  SESSION_INVALID: [401, 'Session invalide'],
  FORBIDDEN: [403, 'Accès refusé'],
  ADMIN_REQUIRED: [403, 'Accès admin requis'],
  SUPERADMIN_REQUIRED: [403, 'Accès superadmin requis'],
  OWNER_REQUIRED: [403, 'Accès owner requis'],
  TURNSTILE_FAILED: [403, 'Vérification anti-bot échouée. Réessaie.'],

  NAME_INVALID: [400, 'Prénom requis (1 à 40 caractères)'],
  COMPANY_NAME_INVALID: [400, 'Nom de société requis (2 à 60 caractères)'],
  TEAM_NAME_INVALID: [400, 'Nom requis (1 à 60 caractères)'],
  EMAIL_INVALID: [400, 'Email invalide'],
  EMAIL_TAKEN: [409, 'Cet e-mail est déjà utilisé par un autre compte.'],

  SELF_POINT: [400, 'Tu ne peux pas te donner un badge à toi-même 😅'],
  RECIPIENT_NOT_IN_TEAM: [403, "Ce collègue n'est pas dans ton équipe."],
  CATEGORY_NOT_IN_TEAM: [400, 'Badge invalide pour ton équipe.'],
  DUPLICATE_POINT: [429, "Tu viens déjà d'offrir ce badge à cette personne ! 😄"],
  DAILY_LIMIT: [429, 'Tu as distribué tes {max} points du jour ! Reviens demain 🌙'],
  RECIPIENT_DAILY_LIMIT: [429, "Tu as déjà bien félicité {name} aujourd'hui ({max} max) 😄"],
  SPAMMER_FROZEN: [429, "🚨 Tu as donné beaucoup plus de badges que tu n'en as reçu cette semaine. Un admin doit lever ton gage (tu régales l'équipe) avant que tu puisses en redonner."],
  UNDO_EXPIRED: [403, "Délai d'annulation dépassé"],
  REASON_EDIT_EXPIRED: [403, 'Trop tard pour ajouter un mot à ce point.'],
  REASON_INVALID: [400, 'Mot requis (1 à 140 caractères)'],

  USER_OUTSIDE_TEAM: [403, 'Utilisateur hors de ton équipe.'],
  MEMBER_NOT_IN_TEAM: [404, 'Membre introuvable dans ton équipe.'],
  MEMBER_NOT_IN_COMPANY: [404, 'Utilisateur introuvable dans ta société.'],
  ROLE_TOO_HIGH: [403, 'Action réservée à un rôle supérieur à celui de ce membre.'],
  OWN_STATUS: [400, 'Tu ne peux pas modifier ton propre statut.'],
  MEMBER_WITHOUT_EMAIL: [400, "Ce membre n'a pas d'e-mail."],
  MEMBER_STILL_ACTIVE: [400, 'Ce membre est actif — désactive-le plutôt.'],
  MEMBER_HAS_ACTIVITY: [400, 'Ce membre a déjà une activité — désactive-le plutôt.'],
  INVITE_INVALID: [404, "Lien d'invitation invalide ou expiré."],

  BADGE_INVALID: [400, 'Badge invalide (nom de 1 à 40 caractères et emoji requis)'],
  RULE_INVALID: [400, 'Règle invalide (seuil entier de 1 à 1000, gage de 1 à 140 caractères)'],
  POINT_NOT_FOUND: [404, 'Point introuvable dans ton équipe'],
  DARE_LOG_NOT_FOUND: [404, 'Entrée introuvable.'],

  TEAM_NOT_FOUND: [404, 'Équipe introuvable'],
  OWN_TEAM: [400, 'Tu ne peux pas désactiver ta propre équipe.'],
  ROLE_INVALID: [400, 'Rôle invalide (admin ou superadmin uniquement)'],
  OWNER_UNTOUCHABLE: [403, 'Impossible de révoquer un owner.'],
  LAST_SUPERADMIN: [400, "Impossible : c'est le dernier superadmin de la société."],
  OWN_COMPANY: [400, 'Impossible de supprimer ta propre société.'],
  COMPANY_NOT_FOUND: [404, 'Société introuvable.'],

  PUSH_SUBSCRIPTION_INVALID: [400, 'Abonnement push invalide'],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>;

export type ApiErrorCode = keyof typeof API_ERRORS;
export const API_ERROR_CODES = Object.keys(API_ERRORS) as ApiErrorCode[];
export type ErrorParams = Record<string, string | number>;

export function errorMessage(code: ApiErrorCode, params: ErrorParams = {}): string {
  return API_ERRORS[code][1].replace(/\{(\w+)\}/g, (placeholder, key: string) => String(params[key] ?? placeholder));
}

export function apiError(c: AppContext, code: ApiErrorCode, params?: ErrorParams) {
  return c.json({ error: errorMessage(code, params), code, ...(params && { params }) }, API_ERRORS[code][0]);
}

export async function readJsonObject(c: AppContext): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json();
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}
