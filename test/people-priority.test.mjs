import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizePeople} from '../src/lib/people-order.js';

test('people discovery randomizes within groups and puts customized Slops first',()=>{
 const rows=[{id:'base',slop_look:{palette:'tangerine',body:'ghost',finish:'gummy',hat:'none'}},{id:'mint',slop_look:{palette:'mint',body:'ghost'}},{id:'star',slop_look:{palette:'tangerine',body:'star'}},{id:'base-2',slop_look:null}];
 const values=[.8,.7,.3,.1];let index=0;const result=prioritizePeople(rows,()=>values[index++]);
 assert.deepEqual(result.map(row=>row.id),['star','mint','base-2','base']);
 assert.deepEqual(rows.map(row=>row.id),['base','mint','star','base-2']);
});
