import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation,speechRecognitionFor} from '../src/lib/dictation.js';
function fixture(options={}){
 const events=[],instances=[];
 class Recognition{constructor(){instances.push(this);}start(){this.onstart?.();}stop(){events.push('stop');this.onend?.();}abort(){events.push('abort');}}
 return {events,instances,controller:createDictation({Recognition,onText:text=>events.push(['text',text]),onListening:value=>events.push(['listening',value]),onError:error=>events.push(['error',error]),...options})};
}
test('dictation requests no microphone before explicit start',()=>{
 const f=fixture();assert.equal(f.instances.length,0);assert.deepEqual(f.events,[]);
 assert.equal(f.controller.start('A game about'),true);assert.equal(f.instances.length,1);
 assert.equal(f.instances[0].continuous,true);assert.equal(f.instances[0].interimResults,true);
});
test('interim updates replace previous recognition results instead of duplicating them',()=>{
 const f=fixture();f.controller.start('A game about');const r=f.instances[0];
 r.onresult({results:[[{transcript:'space'}]]});r.onresult({results:[[{transcript:'space frogs'}]]});r.onresult({results:[[{transcript:'space frogs'}],[{transcript:'jumping'}]]});
 assert.deepEqual(f.events.filter(e=>Array.isArray(e)&&e[0]==='text').map(e=>e[1]),['A game about space','A game about space frogs','A game about space frogs jumping']);
});
test('reaching the input bound stops capture and preserves bounded text',()=>{
 const f=fixture({maxLength:8});f.controller.start('A');f.instances[0].onresult({results:[[{transcript:'long game idea'}]]});
 assert.ok(f.events.some(e=>Array.isArray(e)&&e[0]==='text'&&e[1]==='A long g'));assert.ok(f.events.includes('stop'));
});
test('permission failure is actionable and a second start does not create two microphones',()=>{
 const f=fixture();f.controller.start();assert.equal(f.controller.start(),false);assert.equal(f.instances.length,1);
 f.instances[0].onerror({error:'not-allowed'});assert.match(f.events.find(e=>Array.isArray(e)&&e[0]==='error')[1],/denied/);
 f.instances[0].onend();assert.equal(f.controller.start(),true);
});
test('leaving the component aborts and ignores late recognition callbacks',()=>{
 const f=fixture();f.controller.start();const r=f.instances[0],late=r.onresult;f.controller.dispose();const before=f.events.length;
 late({results:[[{transcript:'late private words'}]]});assert.equal(f.events.length,before);assert.equal(r.onresult,null);assert.ok(f.events.includes('abort'));assert.equal(f.controller.start(),false);
});
test('unsupported browsers expose no fake recognition control',()=>{
 assert.equal(speechRecognitionFor({}),null);const Constructor=class{};assert.equal(speechRecognitionFor({webkitSpeechRecognition:Constructor}),Constructor);
 const f=fixture({Recognition:null});assert.equal(f.controller.start('text'),false);assert.equal(f.instances.length,0);
});
