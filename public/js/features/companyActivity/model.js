export const ACTIVE_FLAVOR_COUNT = 10;
export const CALM_FLAVOR_COUNT = 5;

export const isCalm = (team) => (team.points_7d || 0) === 0;

export const otherTeams = (activity) => (activity?.teams ?? []).filter((team) => String(team.id) !== String(activity.my_team_id));

export function flavorKey(team, random = Math.random) {
  const calm = isCalm(team);
  const variant = Math.floor(random() * (calm ? CALM_FLAVOR_COUNT : ACTIVE_FLAVOR_COUNT));
  return `company.flavor_${calm ? 'calm' : 'active'}_${variant}`;
}

const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`;

export function statLine(team, language) {
  const [givers, points, categories] = [team.givers || 0, team.points_7d || 0, team.categories_used || 0];
  return language === 'en'
    ? `${plural(givers, 'member', 'members')} gave ${plural(points, 'pt', 'pts')} across ${plural(categories, 'category', 'categories')}`
    : `${plural(givers, 'membre a', 'membres ont')} distribué ${plural(points, 'pt', 'pts')} dans ${plural(categories, 'catégorie', 'catégories')}`;
}

export function teamMood(team, position) {
  if (isCalm(team)) return '😴';
  return position === 0 ? '🔥' : '👏';
}
