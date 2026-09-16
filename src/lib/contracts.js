export const API = 'https://api.slop.game';
export const GAMES = `${API}/storage/v1/object/public/games/`;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const DIGEST = /^[0-9a-f]{64}$/;
export const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const hosts = new Set(['api.slop.game', 'yqlolbebqfsodqgjlbeh.supabase.co']);
export function trustedMedia(value) {
  if (typeof value !== 'string' || !value || value.length > 3000) return null;
  try {
    const url = new URL(value, GAMES);
    return url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password && !url.port && url.pathname.startsWith('/storage/v1/object/public/') ? url.href : null;
  } catch { return null; }
}
export function gameEntry(game) {
  if (game?.status !== 'published' || !SLUG.test(game.slug)) throw new Error('This game is not available to play.');
  const version = /^\d+(?:\.\d+){0,3}$/.test(game.bundle_version) ? game.bundle_version : '1.0.0';
  const release = game.published_bundle_path;
  if (release && !new RegExp(`^releases/[0-9a-f]{64}/${game.slug}$`).test(release)) throw new Error('This game has an invalid release.');
  return `${GAMES}${release || game.slug}/${version}/index.html`;
}
export function trustedEntry(value, {preview = false, slug} = {}) {
  if (typeof value !== 'string' || /[%\\]/.test(value)) return false;
  try {
    const u = new URL(value);
    if(u.protocol !== 'https:' || !hosts.has(u.hostname) || u.port || u.username || u.password || u.search || u.hash) return false;
    if (preview) {
      const match = u.pathname.match(/^\/functions\/v1\/game-bundle\/preview\/([0-9a-f]{64})\/([A-Za-z0-9_-]{1,160})\/(\d+(?:\.\d+){0,3})\/index\.html$/);
      return !!match && (!slug || match[2] === slug);
    }
    return /^\/storage\/v1\/object\/public\/games\/(?:releases\/[0-9a-f]{64}\/)?[A-Za-z0-9][A-Za-z0-9_-]{0,159}\/\d+(?:\.\d+){0,3}\/index\.html$/.test(u.pathname);
  } catch { return false; }
}
export function parsePairing(value) {
  if (typeof value !== 'string' || value.length > 240 || value !== value.trim()) return null;
  const prefixes=['https://slop.game/mcp/pair#','https://api.slop.game/functions/v1/slop-mcp/authorize#'];
  const prefix=prefixes.find(p=>value.startsWith(p));if(!prefix)return null;
  const hash = value.slice(prefix.length);
  if(!/^(?:id=[0-9a-f-]{36}&code=[0-9a-f]{32}|code=[0-9a-f]{32}&id=[0-9a-f-]{36})$/.test(hash)) return null;
  const params = new URLSearchParams(hash);
  return UUID.test(params.get('id')) ? {id:params.get('id'),code:params.get('code')} : null;
}
export function trustedCheckout(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'checkout.stripe.com' && !u.username && !u.password && !u.port ? u.href : null; }
  catch {return null;}
}
export class SlopError extends Error {
  constructor(code, message, status = 0) {super(message || errorMessage(code));this.name='SlopError';this.code=code;this.status=status;}
}
export function errorMessage(code) {
  return ({
    authentication_required:'Sign in to your Slop account to continue.',
    account_changed:'Your account changed. Please reopen this screen.',
    invalid_pairing:'This pairing link is not valid. Ask your agent for a new one.',
    pairing_expired:'This pairing link expired. Ask your agent for a new one.',
    invalid_connection:'This connection is no longer active.',
    version_changed:'A newer version is ready. Refresh and review it again.',
    revision_superseded:'A newer revision is available. Refresh your drafts.',
    confirmation_busy:'This draft is being prepared. Wait a moment, then retry.',
    run_busy:'A build is already in progress. Refresh to catch up.',
    request_conflict:'This request changed. Start a new build request.',
    insufficient_credits:'You do not have enough coins for this build.',
    rate_limited:'You have reached a temporary limit. Please try again later.',
    feature_disabled:'This feature is not available for your account yet.',
    service_unavailable:'We could not reach Slop. Check your connection and try again.',
    invalid_response:'Slop returned an unexpected response. Please refresh.',
  })[code] || 'Slop could not complete this. Please retry in a moment.';
}
export async function boundedJson(response, max = 4 * 1024 * 1024) {
  if(Number(response.headers.get('content-length')) > max) throw new SlopError('invalid_response');
  if(!response.body)throw new SlopError('invalid_response');
  const reader = response.body.getReader(); let size=0; const chunks=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new SlopError('invalid_response');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  const bytes = new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch {throw new SlopError('invalid_response');}
}
export function createOwnerScope({getSession,clientFactory}) {
  return async work=>{
    const owner=getSession();
    if(!owner?.user?.id||owner.user.is_anonymous||!owner.access_token)throw new SlopError('authentication_required');
    const assertOwner=()=>{const current=getSession();if(current?.user?.id!==owner.user.id||current?.epoch!==owner.epoch)throw new SlopError('account_changed');};
    const client=clientFactory(async()=>{assertOwner();return owner.access_token;});
    try{const data=await work(owner.user.id,client);assertOwner();return data;}
    catch(error){assertOwner();throw error;}
  };
}
export function ownerRequest({getSession, fetcher = fetch, base = `${API}/functions/v1`}) {
  return async (service,path,{body,signal,ownerReceipt=true}={}) => {
    if(!['slop-mcp','slop-creator','game-bundle','stripe-checkout','stripe-portal','billing-status'].includes(service) || !/^\/[A-Za-z0-9/?=&_%-]*$/.test(path)) throw new SlopError('invalid_request');
    const owner=getSession();
    if(!owner?.user?.id || owner.user.is_anonymous || !owner.access_token) throw new SlopError('authentication_required');
    const assertOwner=()=>{const current=getSession();if(current?.user?.id!==owner.user.id || current?.epoch!==owner.epoch) throw new SlopError('account_changed');};
    try {
      const response=await fetcher(`${base}/${service}${path}`,{
        method:body==null?'GET':'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{Authorization:`Bearer ${owner.access_token}`,'Content-Type':'application/json',Accept:'application/json'},
        body:body==null?undefined:JSON.stringify(body),signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
      });
      assertOwner(); const data=await boundedJson(response);assertOwner();
      if(!response.ok || data?.ok===false) throw new SlopError(data?.code || data?.error || 'service_unavailable',undefined,response.status);
      if(!data || typeof data!=='object' || Array.isArray(data))throw new SlopError('invalid_response');
      if(ownerReceipt && data.owner_id!==owner.user.id)throw new SlopError('account_changed');
      return data;
    } catch(e) {assertOwner();if(e instanceof SlopError || e.name==='AbortError')throw e;throw new SlopError('service_unavailable');}
  };
}
