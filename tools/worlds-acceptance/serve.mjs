// Local-only synthetic acceptance host. Never imported by the production app.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {gameTemplate} from '../../mcp/game-template.mjs';
import {bundleIdentity} from '../../src/lib/bundle-contracts.js';

const qa=dirname(fileURLToPath(import.meta.url)),root=resolve(qa,'../..');
const {files}=await gameTemplate({persistent:true});
files['game.js']=await readFile(resolve(qa,'sample-game.js'),'utf8');
const identity=await bundleIdentity(files),bundle=JSON.stringify({files,identity});
const server=await createServer({
 configFile:false,root,cacheDir:resolve(root,'node_modules/.vite-worlds-qa'),
 optimizeDeps:{entries:[resolve(qa,'main.jsx')]},plugins:[{
  name:'local-worlds-acceptance-only',enforce:'pre',
  resolveId(source,importer){
   if(!importer||!source.startsWith('.'))return;
   const path=resolve(dirname(importer.split('?')[0]),source);
   if(path===resolve(root,'src/auth.jsx'))return resolve(qa,'auth.jsx');
   if(path===resolve(root,'src/lib/supabase.js'))return resolve(qa,'supabase.js');
  },
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
   const path=req.url?.split('?')[0];
   if(path==='/'){res.statusCode=302;res.setHeader('Location','/__worlds-qa/');res.end();return;}
   if(path!=='/__worlds-qa/'&&path!=='/__worlds-qa/bundle.json')return next();
   res.setHeader('Content-Type',path.endsWith('.json')?'application/json':'text/html');
   res.setHeader('Cache-Control','no-store');
   res.end(path.endsWith('.json')?bundle:await readFile(resolve(qa,'index.html')));
  });}
 }],server:{host:'127.0.0.1',port:5193,strictPort:true,fs:{allow:[root]}}
});
await server.listen();
console.log('LOCAL QA only: http://127.0.0.1:5193/__worlds-qa/');
console.log('Synthetic World; inert account/RPC adapters. No live draft or publication.');
console.log(`Fixture digest: ${identity.digest}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
