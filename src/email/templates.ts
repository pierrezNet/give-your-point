import { escapeHtml } from '../html';

export function buildInviteEmail(o: { isEn: boolean; inviterName: string; teamName: string; joinUrl: string }): { subject: string; html: string } {
  const inviter = escapeHtml(o.inviterName);
  const team = escapeHtml(o.teamName);
  const joinUrl = escapeHtml(o.joinUrl);
  const copy = o.isEn
    ? { subject: `${o.inviterName} invites you to ${o.teamName} on Give Your Point`, title: "You're invited! 🎯",
        body: `<b>${inviter}</b> invites you to join the team <b>${team}</b> on Give Your Point.`,
        cta: 'Join the team', footer: "📭 This mailbox is not monitored — please don't reply." }
    : { subject: `${o.inviterName} t'invite à rejoindre ${o.teamName} sur Donne Ton Point`, title: 'Tu es invité·e ! 🎯',
        body: `<b>${inviter}</b> t'invite à rejoindre l'équipe <b>${team}</b> sur Donne Ton Point.`,
        cta: "Rejoindre l'équipe", footer: "📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message." };
  return {
    subject: copy.subject,
    html: `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1e293b">${copy.title}</h2>
      <p style="color:#334155;font-size:15px">${copy.body}</p>
      <p style="margin-top:24px">
        <a href="${joinUrl}"
           style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
          ${copy.cta}
        </a>
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">${copy.footer}</p>
    </div>`,
  };
}

// Mail « tu as reçu un point » (fr/en). Valeurs dynamiques échappées.
export function buildPointEmail(o: { isEn: boolean; name: string; fromName: string; catLabel: string; baseUrl: string }): { subject: string; html: string } {
  const name = escapeHtml(o.name), fromName = escapeHtml(o.fromName), catLabel = escapeHtml(o.catLabel);
  if (o.isEn) {
    return {
      subject: `🎯 ${fromName} gave you a point!`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Hi ${name},</h2>
          <p style="color:#334155;font-size:15px"><b>${fromName}</b> just gave you a point for <b>${catLabel}</b>.</p>
          <p style="margin-top:24px"><a href="${o.baseUrl}/" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">See on Give Your Point</a></p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">📭 This mailbox is not monitored — please don't reply.<br>You receive this because your email is linked to your account. To unsubscribe, ask an admin to remove your email.</p>
        </div>`,
    };
  }
  return {
    subject: `🎯 ${fromName} t'a donné un point !`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1e293b">Bonjour ${name},</h2>
        <p style="color:#334155;font-size:15px"><b>${fromName}</b> vient de t'offrir un point pour <b>${catLabel}</b>.</p>
        <p style="margin-top:24px"><a href="${o.baseUrl}/" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Voir sur Donne Ton Point</a></p>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.<br>Tu reçois ce mail parce que ton email est associé à ton compte. Pour ne plus en recevoir, demande à un admin de retirer ton email.</p>
      </div>`,
  };
}

// Mail « tu écopes d'un gage » : le point vient de faire franchir le seuil.
export function buildGageEmail(o: { isEn: boolean; name: string; fromName: string; catLabel: string; dare: string; baseUrl: string }): { subject: string; html: string } {
  const name = escapeHtml(o.name), fromName = escapeHtml(o.fromName), catLabel = escapeHtml(o.catLabel), dare = escapeHtml(o.dare);
  if (o.isEn) {
    return {
      subject: `🚨 You owe a forfeit on Give Your Point!`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Uh oh, ${name}… 🚨</h2>
          <p style="color:#334155;font-size:15px"><b>${fromName}</b> gave you a point for <b>${catLabel}</b> — and you just hit the threshold!</p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin:16px 0"><span style="color:#ea580c;font-weight:800">🚨 FORFEIT: ${dare}</span></div>
          <p style="margin-top:16px"><a href="${o.baseUrl}/" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">See on Give Your Point</a></p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">📭 This mailbox is not monitored — please don't reply.</p>
        </div>`,
    };
  }
  return {
    subject: `🚨 Tu écopes d'un gage sur Donne Ton Point !`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1e293b">Aïe, ${name}… 🚨</h2>
        <p style="color:#334155;font-size:15px"><b>${fromName}</b> t'a donné un point pour <b>${catLabel}</b> — et tu viens d'atteindre le seuil !</p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin:16px 0"><span style="color:#ea580c;font-weight:800">🚨 GAGE : ${dare}</span></div>
        <p style="margin-top:16px"><a href="${o.baseUrl}/" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Voir sur Donne Ton Point</a></p>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.</p>
      </div>`,
  };
}

// Mail de bienvenue avec lien magique, envoyé à la création d'un compte (si email fourni).
export function buildWelcomeEmail(o: { isEn: boolean; name: string; teamName: string; loginUrl: string }): { subject: string; html: string } {
  const name = escapeHtml(o.name), teamName = escapeHtml(o.teamName);
  if (o.isEn) {
    return {
      subject: `🎯 Your access to ${teamName} on Give Your Point`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Welcome ${name}! 🎯</h2>
          <p style="color:#334155;font-size:15px">You've been added to the team <b>${teamName}</b> on Give Your Point. Here's your personal access link:</p>
          <p style="margin-top:24px"><a href="${o.loginUrl}" style="background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Open my space</a></p>
          <p style="color:#64748b;font-size:12px;margin-top:16px">Keep this email: this link is your key to log in — no password.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:24px;line-height:1.6">📭 This mailbox is not monitored — please don't reply.</p>
        </div>`,
    };
  }
  return {
    subject: `🎯 Ton accès à ${teamName} sur Donne Ton Point`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1e293b">Bienvenue ${name} ! 🎯</h2>
        <p style="color:#334155;font-size:15px">Tu as été ajouté·e à l'équipe <b>${teamName}</b> sur Donne Ton Point. Voici ton lien d'accès personnel :</p>
        <p style="margin-top:24px"><a href="${o.loginUrl}" style="background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Ouvrir mon espace</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:16px">Garde cet email : ce lien est ta clé de connexion — pas de mot de passe.</p>
        <p style="color:#94a3b8;font-size:11px;margin-top:24px;line-height:1.6">📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.</p>
      </div>`,
  };
}

// Construit le mail de digest hebdomadaire (fr/en). Les valeurs dynamiques sont échappées.
export function buildDigestEmail(opts: {
  baseUrl: string; isEn: boolean; memberName: string; teamName: string;
  total: number; topUser: { name: string; count: number } | null;
  topCat: { name: string; emoji: string; count: number } | null;
  gages: number; myReceived: number;
}): { subject: string; html: string } {
  const { baseUrl, isEn, total, gages, myReceived } = opts;
  const memberName = escapeHtml(opts.memberName);
  const teamName = escapeHtml(opts.teamName);
  const topUser = opts.topUser ? { name: escapeHtml(opts.topUser.name), count: opts.topUser.count } : null;
  const topCat = opts.topCat ? { name: escapeHtml(opts.topCat.name), emoji: escapeHtml(opts.topCat.emoji ?? ''), count: opts.topCat.count } : null;

  if (isEn) {
    return {
      subject: `📊 Your week on Give Your Point — ${teamName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Hi ${memberName}, here's ${teamName}'s week 📊</h2>
          <ul style="color:#334155;font-size:15px;line-height:1.9;list-style:none;padding:0">
            <li>🎯 <b>${total}</b> point(s) given this week</li>
            ${topUser ? `<li>🏆 In the lead: <b>${topUser.name}</b> (${topUser.count})</li>` : ''}
            ${topCat ? `<li>${topCat.emoji} Favourite badge: <b>${topCat.name}</b> (${topCat.count})</li>` : ''}
            ${gages > 0 ? `<li>🚨 <b>${gages}</b> dare(s) triggered</li>` : ''}
            <li>👉 You received <b>${myReceived}</b> point(s) this week</li>
          </ul>
          <p style="margin-top:24px">
            <a href="${baseUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open Give Your Point</a>
          </p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
            📭 This mailbox is not monitored — please don't reply.<br>
            You receive this weekly summary because your email is linked to your account. To stop, ask an admin to remove your email.
          </p>
        </div>`,
    };
  }
  return {
    subject: `📊 Ta semaine sur Donne Ton Point — ${teamName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1e293b">Salut ${memberName}, voici la semaine de ${teamName} 📊</h2>
        <ul style="color:#334155;font-size:15px;line-height:1.9;list-style:none;padding:0">
          <li>🎯 <b>${total}</b> point(s) distribué(s) cette semaine</li>
          ${topUser ? `<li>🏆 En tête : <b>${topUser.name}</b> (${topUser.count})</li>` : ''}
          ${topCat ? `<li>${topCat.emoji} Badge favori : <b>${topCat.name}</b> (${topCat.count})</li>` : ''}
          ${gages > 0 ? `<li>🚨 <b>${gages}</b> gage(s) déclenché(s)</li>` : ''}
          <li>👉 Toi : tu as reçu <b>${myReceived}</b> point(s) cette semaine</li>
        </ul>
        <p style="margin-top:24px">
          <a href="${baseUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ouvrir Donne Ton Point</a>
        </p>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
          📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.<br>
          Tu reçois ce résumé hebdo car ton email est associé à ton compte. Pour ne plus le recevoir, demande à un admin de retirer ton email.
        </p>
      </div>`,
  };
}
