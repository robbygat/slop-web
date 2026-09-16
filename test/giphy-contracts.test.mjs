import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGifResults,safeGifUrl} from '../src/lib/giphy-contracts.js';

const url=token=>`https://api.slop.game/functions/v1/gif-proxy/media/${token.repeat(64)}`;
test('GIF comments accept only first-party bounded playback receipts',()=>{
 assert.equal(safeGifUrl(url('a')),url('a'));
 assert.equal(safeGifUrl('https://media.giphy.com/media/a/200w.gif'),null);
 assert.deepEqual(parseGifResults({gifs:[{id:'one',url:url('b'),preview_url:url('c'),width:200,height:160}]}),[{id:'one',url:url('b'),preview:url('c'),width:200,height:160}]);
 assert.deepEqual(parseGifResults({gifs:[{id:'bad',url:url('d'),preview_url:url('e'),width:900,height:10}]}),[]);
});
