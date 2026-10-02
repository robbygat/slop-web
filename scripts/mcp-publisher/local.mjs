// Local check: node scripts/mcp-publisher/local.mjs <gameDir> [outDir]
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { recordGame } from "./record.mjs";
const dir = process.argv[2], out = process.argv[3];
const files = {};
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|js|css|json|svg|txt)$/.test(n)) files[relative(dir, p)] = readFileSync(p, "utf8"); else if(/\.(glb|bin|jpg|webp|ktx2|ogg)$/.test(n))files[relative(dir,p)]={encoding:'base64',data:readFileSync(p).toString('base64')}; } };
walk(dir);
try {
  const diagnostics={},r = await recordGame(files,{diagnostics});
  console.log(JSON.stringify({ ok: true, target: r.target, width: r.width, height: r.height, frames: r.frameCount, gif: r.gif.length, cover: r.cover.length, diagnostics }));
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, "preview.gif"), r.gif); writeFileSync(join(out, "cover.jpg"), r.cover); }
} catch (e) { console.log(JSON.stringify({ ok: false, code: e.code ?? e.message })); process.exitCode = 1; }
