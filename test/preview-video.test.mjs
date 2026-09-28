import test from 'node:test';
import assert from 'node:assert/strict';
import {previewVideo} from '../src/lib/contracts.js';
const id='58567262-3d28-4cb0-9c81-54e4dd3ae93f',key='a'.repeat(32);
const row={video_path:`${id}/v1-${key}/preview.mp4`,poster_path:`${id}/v1-${key}/poster.jpg`,width:720,height:1280,duration_ms:7000};
test('feed preview video resolves only exact bucket paths and canonical sizes',()=>{
 const v=previewVideo({preview_video:row});
 assert.equal(v.src,`https://api.slop.game/storage/v1/object/public/game-preview-videos/${id}/v1-${key}/preview.mp4`);
 assert.match(v.poster,/poster\.jpg$/);
 assert.equal(previewVideo({preview_video:[row]}).width,720);
 assert.equal(previewVideo({preview_video:null}),null);
 assert.equal(previewVideo({}),null);
 assert.equal(previewVideo({preview_video:{...row,video_path:'../x/preview.mp4'}}),null);
 assert.equal(previewVideo({preview_video:{...row,video_path:`https://evil.test/${id}/v1-${key}/preview.mp4`}}),null);
 assert.equal(previewVideo({preview_video:{...row,width:360,height:640}}),null);
});
