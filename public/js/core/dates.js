import { dateLocale, tText } from './i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseSqlDate(value) {
  const text = String(value ?? '');
  return new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

export const daysSince = (value) => Math.floor((Date.now() - parseSqlDate(value).getTime()) / DAY_MS);

export function formatSmartDate(value) {
  const date = parseSqlDate(value);
  const time = date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY_MS);
  if (date.toDateString() === today.toDateString()) return tText('date.today_at', { time });
  if (date.toDateString() === yesterday.toDateString()) return tText('date.yesterday_at', { time });
  return tText('date.day_month_at', { date: date.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' }), time });
}

export const formatShortDate = (value) => parseSqlDate(value).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
