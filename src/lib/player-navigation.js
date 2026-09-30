export const PLAYER_TABS = [
  ['home', 'Home', 'home'],
  ['social', 'Social', 'social'],
  ['feed', 'Play', 'play'],
  ['quests', 'Quests', 'quest'],
  ['connect', 'Create', 'code'],
];

export function isLegacyCreationRoute(path) {
  return /^(?:build|create|studio|agent)(?:\/|$)/.test(path);
}

export function playerRoutePath(path) {
  if (isLegacyCreationRoute(path)) return 'connect';
  return !path || path === 'play' ? 'home' : path;
}
