import test from 'node:test';
import assert from 'node:assert/strict';
import {captureDimensions,validCaptureDimensions} from '../src/lib/capture-contracts.js';
test('preview dimensions preserve portrait, landscape and square games',()=>{
 assert.deepEqual(captureDimensions(360,640),{width:360,height:640});
 assert.deepEqual(captureDimensions(960,540),{width:640,height:360});
 assert.deepEqual(captureDimensions(800,800),{width:640,height:640});
 assert.deepEqual(captureDimensions(539,960),{width:360,height:640});
 assert.equal(validCaptureDimensions(640,360),true);assert.equal(validCaptureDimensions(1280,720),false);
});
test('invalid captured sizes cannot become publication metadata',()=>{
 for(const size of [[0,640],[640,-1],[961,540],[360.5,640],[NaN,640]])assert.throws(()=>captureDimensions(...size));
});
