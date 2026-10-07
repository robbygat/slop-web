import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizeInviteCode,inviteCodeFromParams,inviteCodeFromUrl,loadInvite} from '../src/lib/invite-links.js';
const source=readFileSync(new URL('../public/route.js',import.meta.url),'utf8');
function route(pathname,search='',hash=''){let target=null;runInNewContext(source,{URLSearchParams,location:{pathname,search,hash,replace:value=>{target=value;}}});return target;}
test('invitation compatibility routes preserve the code instead of losing it at Download',()=>{
  assert.equal(route('/invite/','?code=abcdef12'),'/#/invite?code=ABCDEF12');
  assert.equal(route('/invite/abcdef12'),'/#/invite?code=ABCDEF12');
  for(const search of ['', '?code=123','?code=ABCDEF12&code=12345678','?code=ABCDEF12&next=elsewhere'])assert.equal(route('/invite/',search),'/#/invite');
  assert.equal(route('/invite/','?code=ABCDEF12','#bad'),'/#/invite');
});
test('direct app routes reject untrusted origins and ambiguous invite codes',()=>{
  assert.equal(normalizeInviteCode('abcdef12'),'ABCDEF12');
  assert.equal(inviteCodeFromParams(new URLSearchParams('code=ABCDEF12')),'ABCDEF12');
  for(const value of ['https://slop.game/invite/?code=ABCDEF12','https://slop.game/invite/abcdef12'])assert.equal(inviteCodeFromUrl(value),'ABCDEF12');
  for(const value of ['https://other.test/invite/?code=ABCDEF12','https://user@slop.game/invite/?code=ABCDEF12','https://slop.game:8443/invite/?code=ABCDEF12','https://slop.game/invite/?code=ABCDEF12&code=12345678','https://slop.game/invite/ABCDEF12?next=other','https://slop.game/invite/?code=ABCDEF12#bad'])assert.equal(inviteCodeFromUrl(value),null,value);
});
test('public instructions load only from the exact Supabase origin without credentials or a mutation',async()=>{
  let observed;
  const payload={code:'ABCDEF12',app_url:'io.slop.game://invite?code=ABCDEF12',share_url:'https://slop.game/invite/?code=ABCDEF12',acceptance:'authenticated_apply_referral'};
  const fetchImpl=async(url,options)=>{observed={url,options};return Response.json(payload);};
  assert.deepEqual(await loadInvite('abcdef12',{fetchImpl}),payload);
  assert.equal(observed.url,'https://api.slop.game/functions/v1/slop-invites?code=ABCDEF12');
  assert.equal(observed.options.credentials,'omit');assert.equal(observed.options.method,undefined);
  await assert.rejects(loadInvite('ABCDEF12',{fetchImpl:async()=>Response.json({...payload,app_url:'https://evil.test'})}),/verify/);
  await assert.rejects(loadInvite('ABCDEF12',{fetchImpl:async()=>new Response('',{status:503})}),/load/);
});
