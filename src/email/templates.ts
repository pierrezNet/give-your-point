import { escapeHtml } from '../html';

export interface Email {
  subject: string;
  html: string;
}

interface EmailContent {
  heading: string;
  paragraphs: string[];
  highlight?: string;
  call: { label: string; url: string };
  notes?: string[];
  footer: string[];
}

const NOT_MONITORED = {
  fr: "📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.",
  en: "📭 This mailbox is not monitored — please don't reply.",
};

const UNSUBSCRIBE = {
  fr: 'Tu reçois ce mail parce que ton email est associé à ton compte. Pour ne plus en recevoir, demande à un admin de retirer ton email.',
  en: 'You receive this because your email is linked to your account. To unsubscribe, ask an admin to remove your email.',
};

type Language = 'fr' | 'en';
const languageOf = (isEn: boolean): Language => (isEn ? 'en' : 'fr');

function renderEmail(content: EmailContent): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1e293b">${content.heading}</h2>
      ${content.paragraphs.map((paragraph) => `<p style="color:#334155;font-size:15px;line-height:1.6">${paragraph}</p>`).join('\n      ')}
      ${content.highlight ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin:16px 0"><span style="color:#ea580c;font-weight:800">${content.highlight}</span></div>` : ''}
      <p style="margin-top:24px">
        <a href="${escapeHtml(content.call.url)}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${content.call.label}</a>
      </p>
      ${(content.notes ?? []).map((note) => `<p style="color:#64748b;font-size:12px;margin-top:16px">${note}</p>`).join('\n      ')}
      <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">${content.footer.join('<br>')}</p>
    </div>`;
}

export function buildInviteEmail(o: { isEn: boolean; inviterName: string; teamName: string; joinUrl: string }): Email {
  const language = languageOf(o.isEn);
  const inviter = escapeHtml(o.inviterName);
  const team = escapeHtml(o.teamName);
  const copy = {
    fr: {
      subject: `${o.inviterName} t'invite à rejoindre ${o.teamName} sur Donne Ton Point`,
      heading: 'Tu es invité·e ! 🎯',
      body: `<b>${inviter}</b> t'invite à rejoindre l'équipe <b>${team}</b> sur Donne Ton Point.`,
      call: "Rejoindre l'équipe",
    },
    en: {
      subject: `${o.inviterName} invites you to ${o.teamName} on Give Your Point`,
      heading: "You're invited! 🎯",
      body: `<b>${inviter}</b> invites you to join the team <b>${team}</b> on Give Your Point.`,
      call: 'Join the team',
    },
  }[language];
  return {
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      paragraphs: [copy.body],
      call: { label: copy.call, url: o.joinUrl },
      footer: [NOT_MONITORED[language]],
    }),
  };
}

export function buildPointEmail(o: { isEn: boolean; name: string; fromName: string; catLabel: string; baseUrl: string }): Email {
  const language = languageOf(o.isEn);
  const [name, fromName, badge] = [o.name, o.fromName, o.catLabel].map(escapeHtml);
  const copy = {
    fr: { subject: `🎯 ${o.fromName} t'a donné un point !`, heading: `Bonjour ${name},`, body: `<b>${fromName}</b> vient de t'offrir un point pour <b>${badge}</b>.` },
    en: { subject: `🎯 ${o.fromName} gave you a point!`, heading: `Hi ${name},`, body: `<b>${fromName}</b> just gave you a point for <b>${badge}</b>.` },
  }[language];
  return {
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      paragraphs: [copy.body],
      call: { label: language === 'en' ? 'See on Give Your Point' : 'Voir sur Donne Ton Point', url: `${o.baseUrl}/` },
      footer: [NOT_MONITORED[language], UNSUBSCRIBE[language]],
    }),
  };
}

export function buildGageEmail(o: { isEn: boolean; name: string; fromName: string; catLabel: string; dare: string; baseUrl: string }): Email {
  const language = languageOf(o.isEn);
  const [name, fromName, badge, dare] = [o.name, o.fromName, o.catLabel, o.dare].map(escapeHtml);
  const copy = {
    fr: {
      subject: "🚨 Tu écopes d'un gage sur Donne Ton Point !",
      heading: `Aïe, ${name}… 🚨`,
      body: `<b>${fromName}</b> t'a donné un point pour <b>${badge}</b> — et tu viens d'atteindre le seuil !`,
      highlight: `🚨 GAGE : ${dare}`,
    },
    en: {
      subject: '🚨 You owe a forfeit on Give Your Point!',
      heading: `Uh oh, ${name}… 🚨`,
      body: `<b>${fromName}</b> gave you a point for <b>${badge}</b> — and you just hit the threshold!`,
      highlight: `🚨 FORFEIT: ${dare}`,
    },
  }[language];
  return {
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      paragraphs: [copy.body],
      highlight: copy.highlight,
      call: { label: language === 'en' ? 'See on Give Your Point' : 'Voir sur Donne Ton Point', url: `${o.baseUrl}/` },
      footer: [NOT_MONITORED[language]],
    }),
  };
}

export function buildWelcomeEmail(o: { isEn: boolean; name: string; teamName: string; loginUrl: string }): Email {
  const language = languageOf(o.isEn);
  const [name, team] = [o.name, o.teamName].map(escapeHtml);
  const copy = {
    fr: {
      subject: `🎯 Ton accès à ${o.teamName} sur Donne Ton Point`,
      heading: `Bienvenue ${name} ! 🎯`,
      body: `Tu as été ajouté·e à l'équipe <b>${team}</b> sur Donne Ton Point. Voici ton lien d'accès personnel :`,
      call: 'Ouvrir mon espace',
      note: 'Garde cet email : ce lien est ta clé de connexion — pas de mot de passe.',
    },
    en: {
      subject: `🎯 Your access to ${o.teamName} on Give Your Point`,
      heading: `Welcome ${name}! 🎯`,
      body: `You've been added to the team <b>${team}</b> on Give Your Point. Here's your personal access link:`,
      call: 'Open my space',
      note: 'Keep this email: this link is your key to log in — no password.',
    },
  }[language];
  return {
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      paragraphs: [copy.body],
      call: { label: copy.call, url: o.loginUrl },
      notes: [copy.note],
      footer: [NOT_MONITORED[language]],
    }),
  };
}

export interface DigestFacts {
  baseUrl: string;
  isEn: boolean;
  memberName: string;
  teamName: string;
  total: number;
  topUser: { name: string; count: number } | null;
  topCat: { name: string; emoji: string; count: number } | null;
  gages: number;
  myReceived: number;
}

export function buildDigestEmail(facts: DigestFacts): Email {
  const language = languageOf(facts.isEn);
  const [member, team] = [facts.memberName, facts.teamName].map(escapeHtml);
  const topUser = facts.topUser && { name: escapeHtml(facts.topUser.name), count: facts.topUser.count };
  const topCat = facts.topCat && { name: escapeHtml(facts.topCat.name), emoji: escapeHtml(facts.topCat.emoji ?? ''), count: facts.topCat.count };
  const copy = {
    fr: {
      subject: `📊 Ta semaine sur Donne Ton Point — ${facts.teamName}`,
      heading: `Salut ${member}, voici la semaine de ${team} 📊`,
      total: `🎯 <b>${facts.total}</b> point(s) distribué(s) cette semaine`,
      topUser: topUser && `🏆 En tête : <b>${topUser.name}</b> (${topUser.count})`,
      topCat: topCat && `${topCat.emoji} Badge favori : <b>${topCat.name}</b> (${topCat.count})`,
      dares: `🚨 <b>${facts.gages}</b> gage(s) déclenché(s)`,
      mine: `👉 Toi : tu as reçu <b>${facts.myReceived}</b> point(s) cette semaine`,
      unsubscribe: 'Tu reçois ce résumé hebdo car ton email est associé à ton compte. Pour ne plus le recevoir, demande à un admin de retirer ton email.',
    },
    en: {
      subject: `📊 Your week on Give Your Point — ${facts.teamName}`,
      heading: `Hi ${member}, here's ${team}'s week 📊`,
      total: `🎯 <b>${facts.total}</b> point(s) given this week`,
      topUser: topUser && `🏆 In the lead: <b>${topUser.name}</b> (${topUser.count})`,
      topCat: topCat && `${topCat.emoji} Favourite badge: <b>${topCat.name}</b> (${topCat.count})`,
      dares: `🚨 <b>${facts.gages}</b> dare(s) triggered`,
      mine: `👉 You received <b>${facts.myReceived}</b> point(s) this week`,
      unsubscribe: 'You receive this weekly summary because your email is linked to your account. To stop, ask an admin to remove your email.',
    },
  }[language];
  const lines = [copy.total, copy.topUser, copy.topCat, facts.gages > 0 ? copy.dares : null, copy.mine].filter(Boolean);
  return {
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      paragraphs: lines as string[],
      call: { label: language === 'en' ? 'Open Give Your Point' : 'Ouvrir Donne Ton Point', url: facts.baseUrl },
      footer: [NOT_MONITORED[language], copy.unsubscribe],
    }),
  };
}
