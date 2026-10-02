import {gameFormat} from './game-format.js';
import {gamePlatform} from './game-platforms.js';
import {desktopViewport} from './desktop-viewports.js';

// Mobile games keep their original playfield on every screen. Only desktop-only
// games offer a wider view; captures and audited fixed viewports take priority.
export function gamePlayFormat(game = {}, {desktop=false,mode='auto',stageAspect=null}={}) {
  const record=game||{},base=gameFormat(record);
  const fixed=desktopViewport(record);
  let playerAspect=base.playerAspect;
  if(Number.isFinite(stageAspect)&&stageAspect>0)playerAspect=stageAspect;
  else if(fixed)playerAspect=fixed;
  else if(desktop===true&&gamePlatform(record)==='desktop'&&mode==='wide')playerAspect=16/9;
  return {orientation:playerAspect===1?'square':playerAspect>1?'landscape':'portrait',playerAspect};
}
