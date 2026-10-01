// Renders the hero game wall on the GPU. The wall video is the grid standing
// still; this shader scrolls each column (even up, odd down) at display refresh
// rate from one decoded video, and bends the wall with a shockwave when a lifted
// game lands. Returns null when WebGL is unavailable.
const VERTEX=`attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
const FRAGMENT=`precision highp float;
varying vec2 v;
uniform sampler2D tex;
uniform vec2 size;      // wall size in wall pixels
uniform float cellW,speed,colOffset,time;
uniform vec4 ripple;    // x, y (wall px), seconds since landing, strength
void main(){
 vec2 px=v*size;
 // Shockwave: a damped ring travelling out from the landing point pushes tiles
 // outward and back. Displacing before the column lookup bends whole tiles.
 float glow=0.;
 if(ripple.z>=0.&&ripple.z<1.6){
  vec2 d=px-ripple.xy;float r=length(d)+1e-3;
  float front=ripple.z*900.;
  float wave=sin((r-front)*.045)*exp(-abs(r-front)*.012)*exp(-ripple.z*2.4)*ripple.w;
  px+=d/r*wave*18.;
  glow=max(wave,0.)*.22;
 }
 float col=floor(px.x/cellW);
 float dir=mod(col,2.)<.5?1.:-1.;
 float y=mod(px.y+dir*mod(time*speed+col*colOffset,size.y),size.y);
 vec3 c=texture2D(tex,vec2(px.x/size.x,y/size.y)).rgb;
 gl_FragColor=vec4(c+vec3(.77,.96,.39)*glow,1.);
}`;

export function createWallRenderer(canvas,video,wall){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,premultipliedAlpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
 if(!gl||gl.isContextLost())return null;
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null;};
 const vs=shader(gl.VERTEX_SHADER,VERTEX),fs=shader(gl.FRAGMENT_SHADER,FRAGMENT);if(!vs||!fs)return null;
 const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
 gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 const at=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
 const u=name=>gl.getUniformLocation(program,name);
 const uTime=u('time'),uRipple=u('ripple');
 gl.uniform2f(u('size'),wall.w,wall.h);gl.uniform1f(u('cellW'),wall.cellW);
 gl.uniform1f(u('speed'),wall.h/wall.loop);gl.uniform1f(u('colOffset'),wall.colOffset);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
 for(const [k,val] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,val);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([11,17,14]));
 let fresh=false,hasFrame=false,frameHandle=0,lost=false;
 // Upload only when the decoder presents a new frame (24/s), draw every display frame.
 const rvfc=typeof video.requestVideoFrameCallback==='function';
 const onFrame=()=>{fresh=true;frameHandle=video.requestVideoFrameCallback(onFrame);};
 if(rvfc)frameHandle=video.requestVideoFrameCallback(onFrame);
 const onLost=e=>{e.preventDefault();lost=true;};canvas.addEventListener('webglcontextlost',onLost);
 const size=()=>{
  // Never render more pixels than the video has; CSS scales the canvas.
  const w=Math.min(video.videoWidth||wall.w,wall.w),h=Math.round(w*wall.h/wall.w);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
 };
 let ripple=[0,0,-1,0];
 return {
  get ready(){return hasFrame&&!lost;},
  ripple(x,y,strength=1,startedAt){ripple=[x,y,startedAt,strength];},
  draw(time,now){
   if(lost)return false;
   if(video.readyState>=2&&(fresh||!rvfc||!hasFrame)){
    size();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video);fresh=false;hasFrame=true;
   }
   if(!hasFrame)return false;
   gl.uniform1f(uTime,time);
   gl.uniform4f(uRipple,ripple[0],ripple[1],ripple[2]<0?-1:now-ripple[2],ripple[3]);
   gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   return true;
  },
  dispose(){if(rvfc&&frameHandle)video.cancelVideoFrameCallback(frameHandle);canvas.removeEventListener('webglcontextlost',onLost);gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);},
 };
}
