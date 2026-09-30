import {gamePlatform} from './game-platforms.js';
import {previewVideo} from './contracts.js';

export function landscapeGame(game) {
  const video=previewVideo(game);
  if(video)return video.width>video.height;
  if(game.preview_width>0&&game.preview_height>0)return game.preview_width>game.preview_height;
  return gamePlatform(game)==='desktop';
}

/** Weave the two formats without duplicating games or reordering either format's ranking. */
export function gameMosaic(games,{preserveOrder=false,featureKickflip=false}={}) {
  const feature=items=>{
    const result=[...items];
    const featured=featureKickflip?result.findIndex(g=>/kickflip[\s-]*coast/i.test(`${g.name} ${g.slug}`)):-1;
    if(featured>2)result.splice(2,0,...result.splice(featured,1));
    return result;
  };
  if(preserveOrder)return feature(games);
  const phones=games.filter(g=>!landscapeGame(g)),wide=games.filter(landscapeGame);
  if(!phones.length||!wide.length)return feature(games);
  const mixed=[];let p=0,d=0;
  const spacing=[4,8,5,7];
  while(p<phones.length||d<wide.length){
    const take=spacing[d%spacing.length];
    for(let i=0;i<take&&p<phones.length;i++)mixed.push(phones[p++]);
    if(d<wide.length)mixed.push(wide[d++]);
    else {mixed.push(...phones.slice(p));p=phones.length;}
  }
  return feature(mixed);
}
