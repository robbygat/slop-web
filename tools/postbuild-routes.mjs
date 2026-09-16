import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'dist');
// GitHub Pages serves this same SPA document at /claimed-game-name while
// retaining the incoming address. Asset URLs in Vite's built index are absolute.
await writeFile(resolve(out,'404.html'),await readFile(resolve(out,'index.html')));
