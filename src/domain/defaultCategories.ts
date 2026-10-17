const DEFAULT_CATEGORIES_FR = [
  { name: 'Méchanceté', emoji: '👿', forfeit: 'Viennoiseries' },
  { name: 'Super blague', emoji: '😂', forfeit: 'Continue ainsi' },
  { name: 'Flemme', emoji: '😴', forfeit: 'Chouquettes' },
  { name: 'Désespérance', emoji: '😩', forfeit: '1 séance chez le psy' },
  { name: 'Colère', emoji: '😡', forfeit: 'Chocolats' },
  { name: 'Blague affligeante', emoji: '😓', forfeit: 'Bonbons' },
  { name: 'Mauvaise foi', emoji: '🤷', forfeit: 'Jus de fruits' },
];

const DEFAULT_CATEGORIES_EN = [
  { name: 'Meanness', emoji: '👿', forfeit: 'Pastries' },
  { name: 'Great joke', emoji: '😂', forfeit: 'Keep going' },
  { name: 'Laziness', emoji: '😴', forfeit: 'Donuts' },
  { name: 'Despair', emoji: '😩', forfeit: 'Therapy session' },
  { name: 'Anger', emoji: '😡', forfeit: 'Chocolates' },
  { name: 'Bad joke', emoji: '😓', forfeit: 'Candy' },
  { name: 'Bad faith', emoji: '🤷', forfeit: 'Juice' },
];

export function defaultCategoriesFor(locale: string | null | undefined) {
  return locale === 'en' ? DEFAULT_CATEGORIES_EN : DEFAULT_CATEGORIES_FR;
}
