import test from 'node:test';
import assert from 'node:assert/strict';
import {lockBodyScroll} from '../src/lib/scroll-lock.js';
test('nested dialogs restore scrolling only after the last dialog, in either teardown order',()=>{
 for(const order of [[0,1],[1,0]]){
  const body={style:{overflow:'auto'}};const release=[lockBodyScroll(body),lockBodyScroll(body)];
  assert.equal(body.style.overflow,'hidden');release[order[0]]();assert.equal(body.style.overflow,'hidden');
  release[order[0]]();assert.equal(body.style.overflow,'hidden');release[order[1]]();assert.equal(body.style.overflow,'auto');
  const again=lockBodyScroll(body);assert.equal(body.style.overflow,'hidden');again();assert.equal(body.style.overflow,'auto');
 }
});
