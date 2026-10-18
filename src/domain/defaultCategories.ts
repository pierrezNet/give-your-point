const DEFAULT_CATEGORIES_FR = [
  { name: 'Méchanceté', emoji: '👿', dare: 'Viennoiseries' },
  { name: 'Super blague', emoji: '😂', dare: 'Continue ainsi' },
  { name: 'Flemme', emoji: '😴', dare: 'Chouquettes' },
  { name: 'Désespérance', emoji: '😩', dare: '1 séance chez le psy' },
  { name: 'Colère', emoji: '😡', dare: 'Chocolats' },
  { name: 'Blague affligeante', emoji: '😓', dare: 'Bonbons' },
  { name: 'Mauvaise foi', emoji: '🤷', dare: 'Jus de fruits' },
];

const DEFAULT_CATEGORIES_EN = [
  { name: 'Meanness', emoji: '👿', dare: 'Pastries' },
  { name: 'Great joke', emoji: '😂', dare: 'Keep going' },
  { name: 'Laziness', emoji: '😴', dare: 'Donuts' },
  { name: 'Despair', emoji: '😩', dare: 'Therapy session' },
  { name: 'Anger', emoji: '😡', dare: 'Chocolates' },
  { name: 'Bad joke', emoji: '😓', dare: 'Candy' },
  { name: 'Bad faith', emoji: '🤷', dare: 'Juice' },
];

export function defaultCategoriesFor(locale: string | null | undefined) {
  return locale === 'en' ? DEFAULT_CATEGORIES_EN : DEFAULT_CATEGORIES_FR;
}

export const DEFAULT_DARE_THRESHOLD = 5;
