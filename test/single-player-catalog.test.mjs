import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSinglePlayer,singlePlayerGame} from '../src/lib/single-player-catalog.js';

test('single-player feeds require both database multiplayer fields to be null before paging',()=>{
 const calls=[],query={is(column,value){calls.push([column,value]);return this;}};
 assert.equal(filterSinglePlayer(query),query);
 assert.deepEqual(calls,[['multiplayer_mode',null],['multiplayer_protocol',null]]);
 assert.equal(singlePlayerGame({multiplayer_mode:null,multiplayer_protocol:null}),true);
 for(const game of [{},{multiplayer_mode:'match',multiplayer_protocol:'turns-v1'},{multiplayer_mode:'match',multiplayer_protocol:null},{multiplayer_mode:'world',multiplayer_protocol:null},{multiplayer_mode:null,multiplayer_protocol:'future-v1'},null])assert.equal(singlePlayerGame(game),false);
});
