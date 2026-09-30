import test from 'node:test';
import assert from 'node:assert/strict';
import {profileShareUrl,profileShareText,profileXIntent} from '../src/lib/profile-sharing.js';
const player={id:'11111111-2222-4333-8444-555555555555',username:'rob'};
test('profile cards link to the public player route, independent of display names',()=>{
 assert.equal(profileShareUrl(player),'https://slop.game/#/social?player=11111111-2222-4333-8444-555555555555');
 assert.equal(profileShareUrl({...player,username:'a/b?#'}),profileShareUrl(player));
 for(const id of ['',null,'javascript:alert(1)','https://other.example/','../settings'])assert.equal(profileShareUrl({...player,id}),null);
});
test('X sharing encodes the text and keeps the profile URL in one parameter',()=>{
 const profile={...player,username:'hello &next=bad\nworld'};
 const intent=new URL(profileXIntent(profile));
 assert.equal(intent.origin,'https://x.com');assert.equal(intent.pathname,'/intent/post');
 assert.deepEqual([...intent.searchParams.keys()],['text','url']);
 assert.equal(intent.searchParams.get('url'),profileShareUrl(profile));
 assert.equal(intent.searchParams.get('text'),profileShareText(profile));assert.doesNotMatch(profileShareText(profile),/[\r\n]/);
 assert.equal(profileXIntent({id:'invalid'}),null);
});
