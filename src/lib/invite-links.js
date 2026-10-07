import {API} from './contracts.js';

export function normalizeInviteCode(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}$/i.test(value) ? value.toUpperCase() : null;
}

export function inviteCodeFromParams(params) {
  const values = params.getAll('code');
  return [...params.keys()].length === 1 && values.length === 1 ? normalizeInviteCode(values[0]) : null;
}

export function inviteCodeFromUrl(value) {
  let url;
  try { url=new URL(value); } catch { return null; }
  if(url.protocol!=='https:'||url.hostname!=='slop.game'||url.username||url.password||url.port||url.hash)return null;
  if(url.pathname==='/invite/')return inviteCodeFromParams(url.searchParams);
  const match=/^\/invite\/([a-f0-9]{8})$/i.exec(url.pathname);
  return match&&!url.search?normalizeInviteCode(match[1]):null;
}

export async function loadInvite(code, {signal, fetchImpl = fetch} = {}) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) throw new Error('Ask your friend to share their invite again.');
  const response = await fetchImpl(`${API}/functions/v1/slop-invites?code=${normalized}`, {signal, credentials: 'omit'});
  if (!response.ok) throw new Error('Couldn’t load this invite. You can still use the code in the app.');
  const data = await response.json();
  if (data.code !== normalized || data.app_url !== `io.slop.game://invite?code=${normalized}` || data.share_url !== `https://slop.game/invite/?code=${normalized}` || data.acceptance !== 'authenticated_apply_referral') {
    throw new Error('Couldn’t verify this invite. Ask your friend to share it again.');
  }
  return data;
}

export const inviteReceiptMessages = Object.freeze({
  ok: 'Invite accepted. You and your friend received 50 Slop Coins.',
  already: 'You’ve already used a friend’s invite. Your rewards are safe.',
  self: 'This is your code. Share it with a friend.',
  expired: 'Use a friend’s invite during your first seven days on Slop.',
  invalid: 'That code isn’t available. Ask your friend to check it.',
  signin: 'Sign in again to accept this invite.',
  rate_limited: 'Too many attempts. Try again in a little while.',
});
