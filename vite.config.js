import {defineConfig} from 'vite';
export default defineConfig({
  plugins:[{name:'isolated-character-assets',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/native-character/'))res.setHeader('Access-Control-Allow-Origin','*');next();});},configurePreviewServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/native-character/'))res.setHeader('Access-Control-Allow-Origin','*');next();});}}],
  optimizeDeps:{entries:['index.html']},
  server: {port: 5173, strictPort: true, proxy: {
    '/api/': {target: 'https://api.slop.game', changeOrigin: true,
      rewrite: path => path.replace(/^\/api\//, '/functions/v1/'),
      headers: {Origin: 'https://slop.game'},
    },
  }},
  preview: {port: 4174, strictPort: true},
  build: {target: 'es2022', sourcemap: false},
});
