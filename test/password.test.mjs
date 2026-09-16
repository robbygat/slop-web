import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordUpdater} from '../src/lib/password-contracts.js';
const owner={user:{id:'owner-a',is_anonymous:false},access_token:'jwt-a',epoch:1};
test('password update pins the invoking JWT even when another account arrives during the request',async()=>{
  let session=owner;let release;let sent;
  const update=createPasswordUpdater({getSession:()=>session,publicKey:'sb_publishable_fixture',fetcher:async(_url,options)=>{
    sent=options;return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({id:'owner-a'})));});
  }});
  const operation=update('a valid test password');
  session={user:{id:'owner-b'},access_token:'jwt-b',epoch:2};release();
  await assert.rejects(operation,e=>e.code==='account_changed');
  assert.equal(sent.headers.Authorization,'Bearer jwt-a');
  assert.equal(sent.headers.apikey,'sb_publishable_fixture');
  assert.equal(sent.redirect,'error');assert.equal(sent.credentials,'omit');
});
test('password update rejects a forged user receipt and a switch away and back',async()=>{
  const invalid=createPasswordUpdater({getSession:()=>owner,publicKey:'fixture',fetcher:async()=>new Response(JSON.stringify({id:'owner-b'}))});
  await assert.rejects(()=>invalid('a valid test password'),e=>e.code==='account_changed');
  let session=owner;
  const changed=createPasswordUpdater({getSession:()=>session,publicKey:'fixture',fetcher:async()=>{session={...owner,epoch:3};return new Response(JSON.stringify({id:owner.user.id}));}});
  await assert.rejects(()=>changed('a valid test password'),e=>e.code==='account_changed');
});
test('password update accepts only its owner and permits an ordinary same-account token refresh',async()=>{
  let session=owner;
  const update=createPasswordUpdater({getSession:()=>session,publicKey:'fixture',fetcher:async()=>{session={...owner,access_token:'refreshed-a'};return new Response(JSON.stringify({id:owner.user.id}));}});
  assert.equal((await update('a valid test password')).id,owner.user.id);
});
