import test from 'node:test';
import assert from 'node:assert/strict';
import {availableMultiplayerGame,readMultiplayerPage} from '../src/lib/multiplayer-catalog.js';

const game=(slug,patch={})=>({id:slug,slug,status:'published',media_delete_authorized:false,multiplayer_protocol:'turns-v1',multiplayer_mode:'match',created_at:'2026-10-19T01:00:00.123456Z',...patch});
function fixture(rows){
 const calls=[],query={};
 for(const method of ['select','eq','or','order','limit'])query[method]=(...args)=>{calls.push([method,...args]);return query;};
 return {calls,client:{from:table=>{assert.equal(table,'games');return query;}},read:async value=>{assert.equal(value,query);return rows;},names:async rows=>rows.map(row=>({...row,public_name:`public-${row.slug}`}))};
}

test('the multiplayer directory admits only published supported two-player matches',()=>{
 assert.equal(availableMultiplayerGame(game('tankfall')),true);
 for(const patch of [{status:'draft'},{status:'removed'},{media_delete_authorized:true},{media_delete_authorized:undefined},{multiplayer_protocol:null},{multiplayer_protocol:'realtime-v1'},{multiplayer_protocol:'turns-v2'},{multiplayer_mode:null},{multiplayer_mode:'party'}])assert.equal(availableMultiplayerGame(game('excluded',patch)),false);
 assert.equal(availableMultiplayerGame(null),false);
});

test('server filtering happens before pagination and keeps immutable match metadata',async()=>{
 const f=fixture([game('tankfall'),game('second'),game('third')]);
 const result=await readMultiplayerPage({...f,limit:2});
 assert.deepEqual(f.calls.filter(([method])=>method==='eq'),[['eq','status','published'],['eq','media_delete_authorized',false],['eq','multiplayer_protocol','turns-v1'],['eq','multiplayer_mode','match']]);
 assert.ok(f.calls.find(([method,columns])=>method==='select'&&columns.includes('multiplayer_contract')&&columns.includes('published_bundle_path')));
 assert.deepEqual(result.games.map(row=>row.public_name),['public-tankfall','public-second']);
 assert.deepEqual(result.next,{slug:'second',created_at:'2026-10-19T01:00:00.123456Z'});
 assert.deepEqual(f.calls.slice(-3),[['order','created_at',{ascending:false}],['order','slug',{ascending:false}],['limit',3]]);
});

test('legacy Air Hockey and single-player rows fail closed even in an unexpected response',async()=>{
 const f=fixture([game('air-hockey',{multiplayer_protocol:null}),game('solo',{multiplayer_mode:null,multiplayer_protocol:null}),game('tankfall')]);
 const result=await readMultiplayerPage(f);
 assert.deepEqual(result.games.map(row=>row.slug),['tankfall']);
 assert.equal(result.next,null);
});

test('continuation preserves timestamp precision and schema failures stay retryable errors',async()=>{
 const cursor={slug:'tankfall',created_at:'2026-10-19T01:00:00.123456Z'},f=fixture([]);
 await readMultiplayerPage({...f,cursor});
 assert.ok(f.calls.find(([method,value])=>method==='or'&&value.includes(cursor.created_at)&&value.includes('slug.lt.tankfall')));
 const error=Object.assign(new Error('Unavailable'),{code:'42703'});
 await assert.rejects(readMultiplayerPage({...f,read:async()=>{throw error;}}),error);
 assert.equal(f.calls.filter(([method])=>method==='eq').every(([,column])=>column!=='html'),true);
});
