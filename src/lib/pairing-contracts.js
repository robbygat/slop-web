import {parsePairing} from './contracts.js';

export function pendingPairing(raw, now=Date.now()) {
  try {
    const value=JSON.parse(raw);
    if(!Number.isFinite(value?.expires)||value.expires<=now||value.expires>now+10*60_000)return null;
    return parsePairing(`https://slop.game/mcp/pair#id=${value.id}&code=${value.code}`);
  } catch {return null;}
}

export function oauthCallbackUrl(raw) {
  try {
    const url=new URL(raw);const codes=url.searchParams.getAll('code');
    return codes.length===1&&codes[0].length>0&&codes[0].length<=4096&&!url.searchParams.has('error');
  } catch {return false;}
}
