import {defineConfig} from 'vite';
export default defineConfig({
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
