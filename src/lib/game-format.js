import {desktopViewport} from './desktop-viewports.js';
import {gamePlatform} from './game-platforms.js';
// Current mobile catalog previews are 360 × 640; absent metadata must keep
// the same portrait playfield. Only explicit landscape evidence changes it.
export function gameFormat(game = {}) {
  const width = Number(game.preview_width), height = Number(game.preview_height);
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 160 && height >= 160 && width <= 4096 && height <= 4096 && width >= height) {
    const aspect=Math.min(2.4,Math.max(1,width/height));return {orientation:width===height?'square':'landscape',aspect,playerAspect:desktopViewport(game)||aspect};
  }
  if(gamePlatform(game)==='desktop')return {orientation:'landscape',aspect:16/9,playerAspect:desktopViewport(game)||16/9};
  // Catalog capture size describes the preview, not the native phone viewport.
  return {orientation:'portrait',aspect:9/16,playerAspect:9/19.5};
}
