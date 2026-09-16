export const GAME_PLATFORMS=[['all','All games'],['mobile','Mobile'],['desktop','Desktop'],['cross-play','Cross-play']];
export function gamePlatform(game){const p=game?.supported_platforms;if(!Array.isArray(p))return 'mobile';return p.includes('mobile')&&p.includes('desktop')?'cross-play':p.includes('desktop')?'desktop':'mobile';}
export function platformValues(value){if(value==='cross-play')return ['mobile','desktop'];if(value==='mobile'||value==='desktop')return [value];throw new Error('Choose Mobile, Desktop, or Cross-play.');}
export function filterPlatform(query,value='all'){if(value==='all')return query;const platforms=platformValues(value);return query.contains('supported_platforms',platforms).containedBy('supported_platforms',platforms);}
