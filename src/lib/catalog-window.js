import {gameMosaic} from './game-mosaic.js';
// Only arrange the arriving page. Existing tiles stay under the user's finger.
export function appendCatalogPage(previous,incoming,{mixed=true,featureKickflip=false}={}){
 const seen=new Set(previous.map(g=>g.id));
 const fresh=incoming.filter(game=>{if(seen.has(game.id))return false;seen.add(game.id);return true;});
 return [...previous,...gameMosaic(fresh,{preserveOrder:!mixed,featureKickflip:featureKickflip&&!previous.length})];
}
