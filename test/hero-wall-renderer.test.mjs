import test from 'node:test';
import assert from 'node:assert/strict';
import {createWallRenderer} from '../src/components/HeroWallGL.js';
import {HERO_WALL} from '../src/lib/hero-wall.js';

function fakeGL(){
 const log=[];
 const gl={log,contextLost:false,calls:name=>log.filter(call=>call.name===name)};
 for(const [index,name] of [
  'VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER',
  'STATIC_DRAW','FLOAT','TEXTURE_2D','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER',
  'TEXTURE_WRAP_S','TEXTURE_WRAP_T','LINEAR','CLAMP_TO_EDGE','RGB','UNSIGNED_BYTE','TRIANGLE_STRIP',
 ].entries())gl[name]=index+1;
 for(const name of [
  'shaderSource','compileShader','attachShader','linkProgram','useProgram',
  'bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer',
  'uniform2f','uniform1f','uniform4f','bindTexture','texParameteri','texImage2D',
  'viewport','drawArrays','deleteTexture','deleteBuffer','deleteProgram','deleteShader',
 ])gl[name]=(...args)=>log.push({name,args});
 let handle=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=(...args)=>{
  const value={kind:name,id:++handle};log.push({name,args,value});return value;
 };
 gl.isContextLost=()=>gl.contextLost;
 gl.getShaderParameter=()=>true;
 gl.getProgramParameter=()=>true;
 gl.getAttribLocation=()=>0;
 gl.getUniformLocation=(_program,name)=>name;
 return gl;
}

class FakeCanvas extends EventTarget{
 constructor(gl){super();this.gl=gl;this.width=0;this.height=0;this.listeners=new Map();}
 getContext(type){assert.equal(type,'webgl');return this.gl;}
 addEventListener(type,callback,options){
  if(!this.listeners.has(type))this.listeners.set(type,new Set());
  this.listeners.get(type).add(callback);super.addEventListener(type,callback,options);
 }
 removeEventListener(type,callback,options){
  this.listeners.get(type)?.delete(callback);super.removeEventListener(type,callback,options);
 }
 listenerCount(type){return this.listeners.get(type)?.size||0;}
}

class FakeVideo{
 constructor(options={}){
  Object.assign(this,{readyState:4,videoWidth:1600,videoHeight:874,paused:false},options);
  this.callbacks=new Map();this.requests=[];this.cancellations=[];this.nextHandle=1;
 }
 requestVideoFrameCallback(callback){
  const handle=this.nextHandle++;this.callbacks.set(handle,callback);this.requests.push(handle);return handle;
 }
 cancelVideoFrameCallback(handle){this.cancellations.push(handle);this.callbacks.delete(handle);}
 presentFrame(){
  const frame=this.callbacks.entries().next().value;if(!frame)return false;
  const [handle,callback]=frame;this.callbacks.delete(handle);
  callback(1000,{mediaTime:1,expectedDisplayTime:1000});return true;
 }
}

function fixture(callbacks={},videoOptions={}){
 const gl=fakeGL(),canvas=new FakeCanvas(gl),video=new FakeVideo(videoOptions);
 const renderer=createWallRenderer(canvas,video,HERO_WALL,callbacks);
 assert.ok(renderer);return {gl,canvas,video,renderer};
}

const videoUploads=({gl,video})=>gl.calls('texImage2D').filter(call=>call.args.at(-1)===video);
const scrollTimes=gl=>gl.calls('uniform1f').filter(call=>call.args[0]==='time').map(call=>call.args[1]);

test('the wall waits for decoded pixels, then uploads and draws its first frame',t=>{
 const f=fixture({}, {readyState:1});t.after(()=>f.renderer.dispose());
 assert.equal(f.renderer.ready,false);
 assert.equal(f.renderer.draw(1,.1),false);
 assert.equal(videoUploads(f).length,0);
 assert.equal(f.gl.calls('drawArrays').length,0);

 f.video.readyState=2;assert.equal(f.video.presentFrame(),true);
 assert.equal(f.renderer.draw(1.25,.25),true);
 assert.equal(f.renderer.ready,true);
 assert.equal(videoUploads(f).length,1);
 assert.equal(f.gl.calls('drawArrays').length,1);
 assert.deepEqual(scrollTimes(f.gl),[1.25]);
 assert.equal(f.canvas.width,f.video.videoWidth);
 assert.ok(f.canvas.height>0&&f.canvas.height<=f.video.videoHeight);
 assert.deepEqual(f.gl.calls('viewport').at(-1).args,[0,0,f.canvas.width,f.canvas.height]);
 assert.equal(f.video.callbacks.size,1,'a presented frame leaves one decoder callback pending');
});

test('a paused decoder still allows the cached texture to scroll without redundant uploads',t=>{
 const f=fixture();t.after(()=>f.renderer.dispose());
 f.video.presentFrame();assert.equal(f.renderer.draw(2,2),true);
 f.video.paused=true;f.video.readyState=2;
 assert.equal(f.renderer.draw(2.016,2.016),true);
 assert.equal(f.renderer.draw(2.033,2.033),true);
 assert.equal(f.renderer.ready,true);
 assert.equal(videoUploads(f).length,1);
 assert.equal(f.gl.calls('drawArrays').length,3);
 assert.deepEqual(scrollTimes(f.gl),[2,2.016,2.033]);

 f.video.paused=false;f.video.readyState=4;f.video.presentFrame();
 assert.equal(f.renderer.draw(2.05,2.05),true);
 assert.equal(videoUploads(f).length,2,'only the newly presented frame triggers another upload');
});

test('context loss hides readiness and blocks GPU work while restoration requests a rebuild',t=>{
 let lost=0,restored=0;
 const f=fixture({onContextLost:()=>lost++,onContextRestored:()=>restored++});
 t.after(()=>f.renderer.dispose());
 assert.equal(f.renderer.draw(0,0),true);
 f.gl.contextLost=true;
 const event=new Event('webglcontextlost',{cancelable:true});f.canvas.dispatchEvent(event);
 assert.equal(event.defaultPrevented,true,'restoration is permitted by preventing the loss event default');
 assert.equal(lost,1);
 assert.equal(f.renderer.ready,false);
 const before=f.gl.log.length;
 f.video.presentFrame();
 assert.equal(f.renderer.draw(.1,.1),false);
 assert.equal(f.gl.log.length,before,'a newly decoded frame is not uploaded into a lost context');

 f.gl.contextLost=false;f.canvas.dispatchEvent(new Event('webglcontextrestored'));
 assert.equal(restored,1);
 assert.equal(f.gl.log.length,before,'the event delegates resource rebuilding to the owner');
 assert.equal(f.renderer.draw(.2,.2),false,'the old renderer cannot reuse invalid textures after restoration');
});

test('the restoration callback can replace the lost renderer with a working renderer',t=>{
 let replacement=null;
 const f=fixture({onContextRestored:()=>{
  f.renderer.dispose();replacement=createWallRenderer(f.canvas,f.video,HERO_WALL);
 }});
 t.after(()=>{if(replacement)replacement.dispose();else f.renderer.dispose();});
 f.renderer.draw(0,0);
 f.gl.contextLost=true;f.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
 f.gl.contextLost=false;f.canvas.dispatchEvent(new Event('webglcontextrestored'));
 assert.ok(replacement);
 assert.equal(f.video.callbacks.size,1,'the replacement owns the only decoder callback');
 assert.equal(f.canvas.listenerCount('webglcontextlost'),1);
 assert.equal(f.canvas.listenerCount('webglcontextrestored'),1);
 assert.equal(f.renderer.draw(1,1),false);
 assert.equal(replacement.draw(1,1),true);
 assert.equal(replacement.ready,true);
 assert.equal(videoUploads(f).length,2,'the replacement uploads pixels into its new texture');
});

test('dispose cancels the current frame request, removes both listeners, and ignores stale callbacks',()=>{
 let lost=0,restored=0;
 const f=fixture({onContextLost:()=>lost++,onContextRestored:()=>restored++});
 f.video.presentFrame();f.renderer.draw(0,0);
 const [pendingHandle,staleCallback]=f.video.callbacks.entries().next().value;
 assert.equal(f.canvas.listenerCount('webglcontextlost'),1);
 assert.equal(f.canvas.listenerCount('webglcontextrestored'),1);
 f.renderer.dispose();
 assert.deepEqual(f.video.cancellations,[pendingHandle]);
 assert.equal(f.video.callbacks.size,0);
 assert.equal(f.canvas.listenerCount('webglcontextlost'),0);
 assert.equal(f.canvas.listenerCount('webglcontextrestored'),0);
 for(const name of ['deleteTexture','deleteBuffer','deleteProgram'])assert.equal(f.gl.calls(name).length,1,name);
 assert.equal(f.gl.calls('deleteShader').length,2);

 const gpuCalls=f.gl.log.length,frameRequests=f.video.requests.length;
 staleCallback(1100,{mediaTime:1.1,expectedDisplayTime:1100});
 const event=new Event('webglcontextlost',{cancelable:true});f.canvas.dispatchEvent(event);
 f.canvas.dispatchEvent(new Event('webglcontextrestored'));
 assert.equal(event.defaultPrevented,false,'the disposed renderer no longer handles canvas events');
 assert.equal(lost,0);assert.equal(restored,0);
 assert.equal(f.renderer.draw(.1,.1),false);
 assert.equal(f.gl.log.length,gpuCalls);
 assert.equal(f.video.requests.length,frameRequests,'an already queued callback cannot restart the decoder loop');
 assert.equal(f.video.callbacks.size,0);
});

test('unavailable or already lost WebGL contexts do not register lifecycle work',()=>{
 for(const gl of [null,Object.assign(fakeGL(),{contextLost:true})]){
  const canvas=new FakeCanvas(gl),video=new FakeVideo();
  assert.equal(createWallRenderer(canvas,video,HERO_WALL),null);
  assert.equal(video.requests.length,0);
  assert.equal(canvas.listenerCount('webglcontextlost'),0);
  assert.equal(canvas.listenerCount('webglcontextrestored'),0);
 }
});
