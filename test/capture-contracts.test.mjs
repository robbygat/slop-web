import test from 'node:test';
import assert from 'node:assert/strict';
import {captureDimensions,captureStageAspect,validCaptureDimensions,validCaptureDimensionsForTarget} from '../src/lib/capture-contracts.js';
import {visibleFrameChange} from '../src/lib/capture.js';
test('preview dimensions preserve portrait, landscape and square games',()=>{
 assert.deepEqual(captureDimensions(360,640),{width:360,height:640});
 assert.deepEqual(captureDimensions(960,540),{width:640,height:360});
 assert.deepEqual(captureDimensions(800,800),{width:640,height:640});
 assert.deepEqual(captureDimensions(539,960),{width:360,height:640});
 assert.deepEqual(captureDimensions(960,540,'mobile'),{width:360,height:640});
 assert.deepEqual(captureDimensions(360,640,'desktop'),{width:640,height:360});
 assert.equal(validCaptureDimensions(640,360),true);assert.equal(validCaptureDimensions(1280,720),false);
 assert.equal(validCaptureDimensionsForTarget(360,640,'mobile'),true);assert.equal(validCaptureDimensionsForTarget(640,360,'mobile'),false);
 assert.equal(validCaptureDimensionsForTarget(640,360,'desktop'),true);assert.equal(validCaptureDimensionsForTarget(360,640,'desktop'),false);
});
test('moving capture requires visible canvas pixel changes',()=>{
 const still=new Uint8ClampedArray(400),moved=new Uint8ClampedArray(still);for(let i=0;i<80;i+=4){moved[i]=255;moved[i+1]=100;}
 assert.equal(visibleFrameChange(still,new Uint8ClampedArray(still)),false);
 assert.equal(visibleFrameChange(still,moved),true);
 assert.equal(visibleFrameChange(still,new Uint8ClampedArray(40)),false);
});
test('invalid captured sizes cannot become publication metadata',()=>{
 for(const size of [[0,640],[640,-1],[961,540],[360.5,640],[NaN,640]])assert.throws(()=>captureDimensions(...size));
});
test('anything that plays on phones gets the 9:16 clip the app feed expects',()=>{
 assert.deepEqual(captureDimensions(960,540,'cross-platform'),{width:360,height:640});
 assert.deepEqual(captureDimensions(800,800,'cross-platform'),{width:360,height:640});
 assert.equal(validCaptureDimensionsForTarget(360,640,'cross-platform'),true);
 assert.equal(validCaptureDimensionsForTarget(640,360,'cross-platform'),false);
 assert.equal(validCaptureDimensionsForTarget(640,640,'cross-platform'),false);
 assert.equal(captureStageAspect('mobile'),9/16);assert.equal(captureStageAspect('cross-platform'),9/16);assert.equal(captureStageAspect('desktop'),16/9);assert.equal(captureStageAspect(undefined),9/16);
});
