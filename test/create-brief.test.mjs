import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATE_SPARKS,createBuildPrompt} from '../src/lib/create-brief.js';

test('a copied create brief sends a private draft even for an auto-publish connection',()=>{
 const prompt=createBuildPrompt({idea:'A balancing game with a silly robot.'});
 assert.match(prompt,/slop_send_draft[\s\S]*publish: false/);
 assert.match(prompt,/Do not call slop_publish/);
 assert.match(prompt,/wait for me to approve the connection myself/);
 assert.ok(prompt.indexOf('slop_check_bundle')<prompt.indexOf('slop_send_draft'));
 assert.match(prompt,/Keep project_id stable[\s\S]*increase revision/);
});
test('the selected platform survives template, validation, and private delivery',()=>{
 for(const target of ['mobile','desktop','cross-platform']){
  const prompt=createBuildPrompt({idea:'My game',target});
  assert.equal(prompt.match(new RegExp(`target_platform "${target}"`,'g')).length,3);
 }
 assert.match(createBuildPrompt({idea:'My game',target:'mobile'}),/clear touch controls/);
 assert.match(createBuildPrompt({idea:'My game',target:'desktop'}),/clear keyboard and pointer controls/);
});
test('custom ideas are preserved and empty or unsupported briefs cannot be copied',()=>{
 assert.match(createBuildPrompt({idea:'  Keep my oddball twist.\nA second rule.  '}),/GAME IDEA\nKeep my oddball twist.\nA second rule./);
 for(const idea of ['', '  ', null, {}, 'x'.repeat(1201)])assert.equal(createBuildPrompt({idea}),'');
 assert.equal(createBuildPrompt({idea:'My game',target:'console'}),'');
 for(const spark of CREATE_SPARKS.filter(s=>s.idea))assert.ok(createBuildPrompt({idea:spark.idea}));
});
