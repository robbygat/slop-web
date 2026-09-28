// Local check: node scripts/mcp-publisher/local-video.mjs <gameDir|releaseBaseUrl> [outDir] [mobile|desktop]
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { recordVideo } from "./video.mjs";
const [src, out, target = "mobile"] = process.argv.slice(2);
let source;
if (/^https:/.test(src)) source = { baseUrl: src };
else {
  const files = {};
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|js|css|json|svg|txt)$/.test(n)) files[relative(src, p)] = readFileSync(p, "utf8"); } };
  walk(src); source = { files };
}
const diagnostics = {}, started = Date.now();
try {
  const r = await recordVideo(source, { target, diagnostics });
  console.log(JSON.stringify({ ok: true, width: r.width, height: r.height, ms: r.durationMs, video: r.video.length, poster: r.poster.length, secs: Math.round((Date.now() - started) / 1000), diagnostics }));
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, "preview.mp4"), r.video); writeFileSync(join(out, "poster.jpg"), r.poster); }
} catch (e) { console.log(JSON.stringify({ ok: false, code: e.code ?? e.message, diagnostics })); process.exitCode = 1; }
