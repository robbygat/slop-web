import test from 'node:test';
import assert from 'node:assert/strict';
import {MOBILE_REEL_DURATION,MOBILE_REEL_STARTS,mobileReelIndex,mobileReelStart} from '../src/lib/mobile-reel.js';

test('the continuous mobile reel maps every authored clip without a file handoff',()=>{
 assert.deepEqual(MOBILE_REEL_STARTS,[0,5,10,16,21,26]);
 assert.equal(MOBILE_REEL_DURATION,31);
 for(const [time,index] of [[0,0],[4.99,0],[5,1],[9.99,1],[10,2],[15.99,2],[16,3],[20.99,3],[21,4],[25.99,4],[26,5],[30.99,5]])assert.equal(mobileReelIndex(time),index);
 assert.equal(mobileReelIndex(NaN),0);assert.equal(mobileReelStart(-2),0);assert.equal(mobileReelStart(99),26);
});
