export type WelcomeHeroTheme = {
  readonly id: string;
  readonly assetName: string;
};

export const WELCOME_HERO_THEMES: readonly WelcomeHeroTheme[] = [
  { id: 'alps-glacier', assetName: 'swiss-alps-glacier' },
  { id: 'federal-palace-summer', assetName: 'swiss-federal-palace-summer' },
  { id: 'aarau-old-town-summer', assetName: 'swiss-aarau-old-town-summer' },
  { id: 'neuchatel-castle-lake', assetName: 'swiss-neuchatel-castle-lake' },
  { id: 'lion-monument-lucerne', assetName: 'swiss-lion-monument-lucerne' },
  { id: 'ticino-morcote-summer', assetName: 'swiss-ticino-morcote-summer' },
  { id: 'rhine-falls-schaffhausen', assetName: 'swiss-rhine-falls-schaffhausen' },
  { id: 'graubuenden-vineyards', assetName: 'swiss-graubuenden-vineyards' },
  { id: 'lausanne-cathedral-summer', assetName: 'swiss-lausanne-cathedral-summer' },
  { id: 'rural-jura-summer', assetName: 'swiss-rural-jura-summer' },
];

export function selectNextWelcomeHeroTheme(
  previousThemeId: string | null,
  random: () => number = Math.random,
): WelcomeHeroTheme {
  // Before the first selection, treat the former fixed glacier as the previous
  // image so the first refresh visibly demonstrates the new rotation.
  const previousId = previousThemeId ?? 'alps-glacier';
  const candidates = WELCOME_HERO_THEMES.filter((theme) => theme.id !== previousId);
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index] ?? WELCOME_HERO_THEMES[0];
}
