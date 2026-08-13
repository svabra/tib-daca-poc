import { describe, expect, it } from 'vitest';
import { selectNextWelcomeHeroTheme, WELCOME_HERO_THEMES } from './welcome-hero-theme';

describe('welcome hero theme rotation', () => {
  it('contains the glacier and all three additional Swiss themes', () => {
    expect(WELCOME_HERO_THEMES.map((theme) => theme.id)).toEqual([
      'alps-glacier',
      'federal-palace-summer',
      'aarau-old-town-summer',
      'lion-monument-lucerne',
      'ticino-morcote-summer',
      'rhine-falls-schaffhausen',
      'graubuenden-vineyards',
      'lausanne-cathedral-summer',
      'rural-jura-summer',
    ]);
  });

  it('does not repeat the previously displayed theme', () => {
    for (const previous of WELCOME_HERO_THEMES) {
      expect(selectNextWelcomeHeroTheme(previous.id, () => 0).id).not.toBe(previous.id);
      expect(selectNextWelcomeHeroTheme(previous.id, () => 0.999).id).not.toBe(previous.id);
    }
  });

  it('selects a non-glacier image on the first refresh after rollout', () => {
    expect(selectNextWelcomeHeroTheme(null, () => 0).id).toBe('federal-palace-summer');
  });
});
