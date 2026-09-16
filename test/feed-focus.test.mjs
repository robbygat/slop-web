import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleFeedGame} from '../src/lib/feed-focus.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
test('feed starts its visible game and changes when scrolling brings the next full playfield into view',()=>{
 const viewport={top:80,bottom:820};assert.equal(visibleFeedGame([{id:'first',top:220,bottom:820},{id:'next',top:1000,bottom:1600}],viewport),'first');
 assert.equal(visibleFeedGame([{id:'first',top:-600,bottom:0},{id:'next',top:100,bottom:700}],{...viewport,current:'first'}),'next');
 assert.equal(visibleFeedGame([{id:'first',top:900,bottom:1500}],viewport),null);
});
test('small intersection fluctuations do not restart a game; a clear new winner does',()=>{
 const items=[{id:'first',top:-230,bottom:370},{id:'next',top:450,bottom:1050}],viewport={top:80,bottom:820,current:'first'};
 assert.equal(visibleFeedGame(items,viewport),'next');
 assert.equal(visibleFeedGame([{id:'first',top:-130,bottom:470},{id:'next',top:470,bottom:1070}],viewport),'first');
});
test('feed wheel relay accepts only bounded events from the current game frame',()=>{const frame={};assert.equal(acceptPlayerEvent(frame,frame,'{"type":"webScroll","deltaY":80,"deltaMode":0}').deltaY,80);for(const bad of [{deltaY:241,deltaMode:0},{deltaY:30,deltaMode:3},{deltaY:'30',deltaMode:0}])assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'webScroll',...bad})),null);assert.equal(acceptPlayerEvent({},frame,'{"type":"webInteraction"}'),null);});
test('a visible app card stops the offscreen game until the next real playfield is visible',()=>{
 assert.equal(visibleFeedGame([{id:'tenth',top:-700,bottom:-100},{id:null,top:100,bottom:700},{id:'eleventh',top:900,bottom:1500}],{top:80,bottom:820,current:'tenth'}),null);
 assert.equal(visibleFeedGame([{id:null,top:-650,bottom:-50},{id:'eleventh',top:100,bottom:700}],{top:80,bottom:820,current:null}),'eleventh');
});
