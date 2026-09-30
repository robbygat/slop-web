// Website-only compatibility reviews. These immutable public releases use
// authored pointer controls and Slop.onResize; publishing targets stay intact.
// A new release root or bundle version requires its own review.
export const REVIEWED_DESKTOP_RELEASES=Object.freeze([
 Object.freeze({
  name:'Ice Cream Stack',
  hint:'Drag with your mouse to catch',
  root:'releases/82955da708e8021a5893f7b156f9e1a086aa9778731c7b47a8ed63b749362509/mcp-e097d7abbb874f0a9fbb951ee138b624',
  version:'1.0.0',
  sourceSHA256:'631fb30095b59e97531580a192612656c21953cbfcb93881e25e159e53f0fc3a',
 }),
 Object.freeze({
  name:'Wobble Tower',
  hint:'Drag to move · click to rotate',
  root:'releases/e94095a0d30dbcd36ec0c41ee349779083eacd3fb379fd3d8462b82674e04fab/mcp-079919f48fc24687b642bfeb0bcd376d',
  version:'1.0.0',
  sourceSHA256:'3a1e438db2d9dffda24bc366eeb107a13b1a25a353aa6ff6996e65630b6cb1e7',
 }),
]);

export function reviewedDesktopGame(game){
 if(game?.status!=='published'||!Array.isArray(game.supported_platforms)||!game.supported_platforms.includes('mobile'))return null;
 return REVIEWED_DESKTOP_RELEASES.find(review=>game.published_bundle_path===review.root&&game.bundle_version===review.version)||null;
}

// Only fixed, reviewed strings enter PostgREST's filter grammar. The server
// matches the same publication, mobile support, root and version as the helper.
export function reviewedDesktopClauses(){
 return REVIEWED_DESKTOP_RELEASES.map(review=>`and(status.eq.published,supported_platforms.cs.{mobile},published_bundle_path.eq.${review.root},bundle_version.eq.${review.version})`);
}

export function desktopDiscoveryClause(crossPlay=false){
 const declared=crossPlay?'and(supported_platforms.cs.{mobile},supported_platforms.cs.{desktop})':'supported_platforms.cs.{desktop}';
 return [declared,...reviewedDesktopClauses()].join(',');
}
