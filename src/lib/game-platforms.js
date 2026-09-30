import {catalogPlatformForTarget,supportedPlatformsForTarget} from './game-target-contract.js';
import {reviewedDesktopGame,desktopDiscoveryClause} from './reviewed-desktop-games.js';
export {reviewedDesktopGame} from './reviewed-desktop-games.js';
export const GAME_PLATFORMS=[['all','All games'],['mobile','Mobile'],['desktop','Desktop'],['cross-play','Cross-play']];
export function gamePlatform(game){const p=game?.supported_platforms;if(!Array.isArray(p))return 'mobile';return p.includes('mobile')&&p.includes('desktop')?'cross-play':p.includes('desktop')?'desktop':'mobile';}
export function webGamePlatform(game){return reviewedDesktopGame(game)?'cross-play':gamePlatform(game);}
export function platformValues(value){return supportedPlatformsForTarget(value);}
// Device filters describe where a game can be played. Games supporting both
// devices belong in both filters; cross-play explicitly requires both entries.
export function filterPlatform(query,value='all'){
 if(value==='all')return query;
 const platforms=platformValues(value);
 return platforms.length===1&&platforms[0]==='mobile'
  ?query.contains('supported_platforms',platforms)
  :query.or(desktopDiscoveryClause(platforms.length===2));
}
export function platformValueForTarget(value){return catalogPlatformForTarget(value);}
