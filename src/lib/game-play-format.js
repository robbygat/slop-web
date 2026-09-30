import {gameFormat} from './game-format.js';
import {webGamePlatform} from './game-platforms.js';
import {desktopViewport} from './desktop-viewports.js';

// Live play may use a wider viewport than its catalog recording. Keep preview
// dimensions separate, and resize the existing iframe rather than its game run.
export function gamePlayFormat(game = {}, {desktop=false,mode='auto',stageAspect=null}={}) {
  const record=game||{},base=gameFormat(record);
  const fixed=desktopViewport(record);
  let playerAspect=base.playerAspect;
  if(Number.isFinite(stageAspect)&&stageAspect>0)playerAspect=stageAspect;
  else if(fixed)playerAspect=fixed;
  else if(desktop===true) {
    const choice=['auto','original','wide'].includes(mode)?mode:'auto';
    if(choice==='wide'||(choice==='auto'&&webGamePlatform(record)==='cross-play'&&base.orientation==='portrait'))playerAspect=16/9;
  }
  return {orientation:playerAspect===1?'square':playerAspect>1?'landscape':'portrait',playerAspect};
}
