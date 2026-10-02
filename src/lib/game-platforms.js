import {catalogPlatformForTarget,supportedPlatformsForTarget} from './game-target-contract.js';
export {reviewedDesktopGame} from './reviewed-desktop-games.js';
export const GAME_PLATFORMS=[['all','All games'],['mobile','Mobile'],['desktop','Desktop']];
// Phone games keep their mobile presentation even when they also accept a mouse.
// This does not change the published device support or creator targets.
export function gamePlatform(game){const p=game?.supported_platforms;return Array.isArray(p)&&p.includes('desktop')&&!p.includes('mobile')?'desktop':'mobile';}
export function webGamePlatform(game){return gamePlatform(game);}
export function platformValues(value){return supportedPlatformsForTarget(value);}
// Legacy cross-play filters now resolve to Mobile; Desktop is desktop-only.
export function filterPlatform(query,value='all'){
 if(value==='all')return query;
 const platforms=platformValues(value);
 return platforms.includes('mobile')
  ?query.contains('supported_platforms',['mobile'])
  :query.contains('supported_platforms',['desktop']).containedBy('supported_platforms',['desktop']);
}
export function platformValueForTarget(value){return catalogPlatformForTarget(value);}
