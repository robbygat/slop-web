// Incremental JSON reader for the large draft route. Containers are assembled
// as tokens arrive; only an individual scalar is handed to JSON.parse. Never
// join the complete 70 MB request into a second full-size source string.
export class JsonReader{
 constructor({maxDepth=128,maxNodes=50_000,maxToken=70_000_000}={}){
  this.maxDepth=maxDepth;this.maxNodes=maxNodes;this.maxToken=maxToken;
  this.stack=[];this.mode='';this.parts=[];this.tokenLength=0;this.escape=false;this.nodes=0;this.hasRoot=false;
 }
 invalid(){throw new SyntaxError('invalid_json');}
 path(){const frame=this.stack.at(-1);return !frame?[]:[...frame.path,frame.array?frame.value.length:frame.key];}
 stringStart(){
  const frame=this.stack.at(-1),key=frame&&!frame.array&&['key','keyOrEnd'].includes(frame.state),path=this.path();
  this.stringUnits=0;this.stringBytes=0;this.pendingHigh=false;this.stringEscape=false;this.unicodeLeft=0;this.unicodeValue=0;
  // Bounds apply to decoded values, not raw JSON escape spelling. An 8 MB
  // string written entirely as \uXXXX remains valid up to the wire ceiling.
  this.stringUnitLimit=key?160:path.at(-1)==='name'?80:path.at(-1)==='description'?240:['project_id','request_id'].includes(path.at(-1))?36:Infinity;
  this.stringByteLimit=path.at(-1)==='data'?10_666_668:8_000_000;
 }
 unit(code){
  if(++this.stringUnits>this.stringUnitLimit)this.invalid();
  if(this.pendingHigh){this.pendingHigh=false;if(code>=0xdc00&&code<=0xdfff){this.stringBytes+=4;this.checkStringSize();return;}this.stringBytes+=3;}
  if(code>=0xd800&&code<=0xdbff)this.pendingHigh=true;
  else this.stringBytes+=code<=0x7f?1:code<=0x7ff?2:3;
  this.checkStringSize();
 }
 checkStringSize(){if(this.stringBytes>this.stringByteLimit)this.invalid();}
 stringPart(text,closed=false){
  const end=text.length-(closed?1:0);
  if(!this.unicodeLeft&&!this.stringEscape&&!this.pendingHigh&&!/[^\x20-\x5b\x5d-\x7f]/.test(text.slice(0,end))){
   this.stringUnits+=end;this.stringBytes+=end;if(this.stringUnits>this.stringUnitLimit)this.invalid();this.checkStringSize();this.append(text);return;
  }
  for(let i=0;i<end;i++){
   const code=text.charCodeAt(i);
   if(this.unicodeLeft){
    const lower=code|32,hex=code>=48&&code<=57?code-48:lower>=97&&lower<=102?lower-87:-1;if(hex<0)this.invalid();
    this.unicodeValue=this.unicodeValue*16+hex;if(--this.unicodeLeft===0)this.unit(this.unicodeValue);continue;
   }
   if(this.stringEscape){
    this.stringEscape=false;if(code===117){this.unicodeLeft=4;this.unicodeValue=0;continue;}
    const escape={'"':34,'\\':92,'/':47,b:8,f:12,n:10,r:13,t:9}[text[i]];if(escape===undefined)this.invalid();this.unit(escape);continue;
   }
   if(code===92){this.stringEscape=true;continue;}
   if(code<32)this.invalid();this.unit(code);
  }
  if(closed){if(this.stringEscape||this.unicodeLeft)this.invalid();if(this.pendingHigh){this.pendingHigh=false;this.stringBytes+=3;}this.checkStringSize();}
  this.append(text);
 }
 append(text){this.tokenLength+=text.length;if(this.tokenLength>this.maxToken||this.mode==='atom'&&this.tokenLength>1024)this.invalid();this.parts.push(text);}
 scalar(){const source=this.parts.length===1?this.parts[0]:this.parts.join('');this.parts=[];this.tokenLength=0;this.mode='';return JSON.parse(source);}
 value(value){
  if(++this.nodes>this.maxNodes)this.invalid();
  const frame=this.stack.at(-1);
  if(!frame){if(this.hasRoot)this.invalid();this.root=value;this.hasRoot=true;return;}
  if(frame.array){if(!['value','valueOrEnd'].includes(frame.state))this.invalid();frame.value.push(value);frame.state='commaOrEnd';}
  else{if(frame.state!=='value')this.invalid();Object.defineProperty(frame.value,frame.key,{value,writable:true,enumerable:true,configurable:true});frame.state='commaOrEnd';}
 }
 token(value){
  const frame=this.stack.at(-1);
  if(frame&&!frame.array&&['key','keyOrEnd'].includes(frame.state)){
   if(typeof value!=='string')this.invalid();frame.key=value;frame.state='colon';
  }else this.value(value);
 }
 punctuation(char){
  const frame=this.stack.at(-1);
  if(char==='{'||char==='['){
   if(this.stack.length>=this.maxDepth)this.invalid();
   const path=this.path(),array=char==='[',value=array?[]:Object.create(null);this.value(value);
   this.stack.push({array,value,path,state:array?'valueOrEnd':'keyOrEnd'});return;
  }
  if(!frame)this.invalid();
  if(char===':'){if(frame.array||frame.state!=='colon')this.invalid();frame.state='value';return;}
  if(char===','){if(frame.state!=='commaOrEnd')this.invalid();frame.state=frame.array?'value':'key';return;}
  if((char===']')!==frame.array||!['commaOrEnd',frame.array?'valueOrEnd':'keyOrEnd'].includes(frame.state))this.invalid();
  this.stack.pop();
 }
 write(text){
  let cursor=0;
  while(cursor<text.length){
   if(this.mode==='string'){
    const start=cursor;
    if(this.escape){cursor++;this.escape=false;}
    const special=/["\\]/g;special.lastIndex=cursor;let match,closed=false;
    while((match=special.exec(text))){
     if(match[0]==='\\'){
      if(match.index+1===text.length){this.escape=true;cursor=text.length;break;}
      special.lastIndex=match.index+2;
     }else{cursor=match.index+1;this.stringPart(text.slice(start,cursor),true);this.token(this.scalar());closed=true;break;}
    }
    if(!closed){this.stringPart(text.slice(start));cursor=text.length;}
    continue;
   }
   if(this.mode==='atom'){
    const boundary=/[\x20\t\r\n{}\[\],:"]/g;boundary.lastIndex=cursor;const match=boundary.exec(text);
    if(!match){this.append(text.slice(cursor));return;}
    this.append(text.slice(cursor,match.index));cursor=match.index;this.token(this.scalar());continue;
   }
   const nonspace=/[^\x20\t\r\n]/g;nonspace.lastIndex=cursor;const match=nonspace.exec(text);if(!match)return;cursor=match.index;
   const char=text[cursor++];
   if('{}[],:'.includes(char)){this.punctuation(char);continue;}
   if(char==='"'){this.stringStart();this.mode='string';this.parts=['"'];this.tokenLength=1;this.escape=false;continue;}
   this.mode='atom';this.parts=[char];this.tokenLength=1;
  }
 }
 finish(){if(this.mode==='atom')this.token(this.scalar());if(this.mode||this.stack.length||!this.hasRoot)this.invalid();return this.root;}
}
// Large server RPC responses have the same JSON/Unicode allocation risk as
// draft requests. Count the original UTF-8 wire bytes and feed bounded slices;
// errors cancel the unread body instead of leaving a large fetch buffering.
export async function readJsonStream(stream,{maxBytes=70_000_000,...limits}={}){
 const reader=stream?.getReader();if(!reader)throw new SyntaxError('invalid_json');
 const decoder=new TextDecoder('utf-8',{fatal:true}),parser=new JsonReader({...limits,maxToken:Math.min(limits.maxToken??maxBytes,maxBytes)});let total=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)throw new RangeError('request_too_large');for(let offset=0;offset<value.length;offset+=65_536)parser.write(decoder.decode(value.subarray(offset,offset+65_536),{stream:true}));}
  const tail=decoder.decode();if(tail)parser.write(tail);return parser.finish();
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}
