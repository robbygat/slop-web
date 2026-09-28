export const PLAYER_TABS = [
  ['home', 'Home', 'home'],
  ['feed', 'For you', 'play'],
  ['quests', 'Quests', 'quest'],
  ['social', 'Social', 'social'],
  ['shop', 'Shop', 'shop'],
  ['you', 'You', 'user'],
];

export function isLegacyCreationRoute(path) {
  return /^(?:build|create|studio|agent)(?:\/|$)/.test(path);
}

export function playerRoutePath(path) {
  if (isLegacyCreationRoute(path)) return 'connect';
  return !path || path === 'play' ? 'home' : path;
}
