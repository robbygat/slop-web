// Headless playtest + capture for one MCP bundle, using the website's own
// player bootstrap, clip ring and GIF/cover encoder (src/lib). The game runs
// in an opaque sandboxed iframe under the player's CSP; the encoder runs in
// the parent page the game cannot reach. Only 127.0.0.1 and the one three.js
// build the real player allows may load. Nothing here logs source or media.
import http from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchChrome } from "./cdp.mjs";
import { installGameStorage } from "../../src/lib/player-storage.js";
import { mcpRuntimeProblem } from "../../src/lib/mcp-runtime.js";
import { mcpTargetFromFiles } from "../../src/lib/mcp-platform.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const THREE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8", svg: "image/svg+xml", txt: "text/plain; charset=utf-8" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RecorderFailure extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

let captureBundle;
async function bundle() {
  if (captureBundle) return captureBundle;
  const { build } = await import("vite");
  const result = await build({
    root, logLevel: "silent", configFile: false,
    build: { write: false, minify: false, lib: { entry: join(here, "host-entry.js"), formats: ["iife"], name: "SlopRecorderBundle", fileName: () => "recorder.js" } },
  });
  const output = (Array.isArray(result) ? result[0] : result).output.find((o) => o.type === "chunk");
  captureBundle = output.code;
  return captureBundle;
}

function manifestOf(files) {
  return Object.keys(files).sort().map((path) => {
    const bytes = Buffer.from(files[path], "utf8");
    return { path: `1.0.0/${path}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

export async function recordGame(files, { seconds = 9, diagnostics = {} } = {}) {
  if (!files?.["index.html"]) throw new RecorderFailure("runtime_invalid");
  if (mcpRuntimeProblem(manifestOf(files), files["index.html"])) throw new RecorderFailure("runtime_invalid");
  let target;
  try { target = mcpTargetFromFiles(files); } catch { throw new RecorderFailure("runtime_invalid"); }
  const desktop = target === "desktop";
  const [W, H] = desktop ? [1280, 720] : [360, 640];
  const bootstrap = await readFile(join(root, "src/lib/player-bootstrap.js"), "utf8");
  const recorder = await bundle();

  let port = 0;
  const base = () => `http://127.0.0.1:${port}/game/`;
  const policy = () => ["sandbox allow-scripts allow-pointer-lock", "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${base()} ${THREE}`,
    `style-src 'unsafe-inline' ${base()}`, `img-src ${base()} data: blob:`, `media-src ${base()} data: blob:`,
    `font-src ${base()} data:`, `connect-src ${base()} blob:`, `worker-src ${base()} blob:`,
    "object-src 'none'", "frame-src 'none'", "form-action 'none'", `base-uri ${base()}`].join("; ");
  const inject = `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>window.__slopPreviewCapture=true;\n(${installGameStorage.toString()})();\n${bootstrap}</script>`;
  const host = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#101215;overflow:hidden}iframe{border:0;width:${W}px;height:${H}px;display:block}</style>
<script>${recorder}</script></head><body><iframe id="game" sandbox="allow-scripts allow-pointer-lock" allow="autoplay; gamepad" referrerpolicy="no-referrer" src="/game/index.html"></iframe></body></html>`;
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/host.html") { res.writeHead(200, { "content-type": MIME.html, "cache-control": "no-store" }); return res.end(host); }
    const rel = path.startsWith("/game/") ? path.slice(6) : null;
    if (!rel || !Object.hasOwn(files, rel)) { res.writeHead(404); return res.end(); }
    let body = files[rel];
    const headers = { "content-type": MIME[rel.split(".").pop()] ?? "application/octet-stream", "cache-control": "no-store" };
    if (rel === "index.html") {
      body = /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (m) => m + inject) : inject + body;
      headers["content-security-policy"] = policy();
    }
    res.writeHead(200, headers); res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}/`;
  const chrome = await launchChrome();
  const s = chrome.session;
  const evaluate = async (expression) => {
    const r = await s.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new RecorderFailure("recorder_error", true);
    return r.result.value;
  };
  try {
    // Block everything that is not this local server or the one allowed CDN build.
    await s.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    s.on("Fetch.requestPaused", (p) => {
      const allowed = p.request.url.startsWith(origin) || p.request.url === THREE;
      s.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        allowed ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    });
    await Promise.all(["Page.enable", "Runtime.enable"].map((m) => s.send(m)));
    await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: desktop ? 1 : 2, mobile: !desktop });
    if (!desktop) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s.send("Page.navigate", { url: `${origin}host.html` });
    await sleep(500);
    await evaluate(`(()=>{const f=document.getElementById('game');window.__events=[];addEventListener('message',e=>{if(e.source!==f.contentWindow||typeof e.data!=='string'||e.data.length>750000)return;let m;try{m=JSON.parse(e.data)}catch{return}if(m&&typeof m.type==='string'){if(m.type==='webCaptureResult'||m.type==='webCaptureError'){(window.__pending?.[m.request])?.(m);return;}window.__events.push({type:m.type,at:performance.now()});}});
      window.__capture=()=>new Promise((resolve)=>{const request='r'+Math.random().toString(36).slice(2);const t=setTimeout(()=>{delete window.__pending[request];resolve(null)},6000);window.__pending=window.__pending||{};window.__pending[request]=m=>{clearTimeout(t);delete window.__pending[request];resolve(m.type==='webCaptureResult'?m:null)};f.contentWindow.postMessage(JSON.stringify({type:'webCapture',request}),'*');});
      window.__ring=SlopRecorder.createClipRing();return true;})()`);

    // Boot: wait for the SDK's ready (the SDK also auto-announces it).
    const start = Date.now();
    let events = [];
    while (Date.now() - start < 20000) {
      events = await evaluate("window.__events.map(e=>e.type)");
      if (events.includes("ready") || events.includes("loadError")) break;
      await sleep(200);
    }
    if (events.includes("loadError")) throw new RecorderFailure("boot_error");
    // Like the website's publish playtest, a game that never announces ready
    // is still recorded; it fails only if nothing usable is captured below.
    const announced = events.includes("ready");
    await sleep(600);

    // Play while the ring captures every ~80 ms, exactly like the web publish flow.
    const cx = W / 2, cy = H * 0.6;
    const r = (a, b) => a + Math.random() * (b - a);
    const input = async (i) => {
      if (!desktop) {
        if (i % 3 === 0) {
          const x = r(60, W - 60), y = r(H * 0.3, H * 0.85);
          await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
          await s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + r(-80, 80), y: y + r(-60, 60), id: 1 }] });
          await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
      } else {
        const keys = [["ArrowLeft", 37], ["ArrowRight", 39], ["ArrowUp", 38], ["Space", 32]];
        const [code, vk] = keys[i % keys.length];
        await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r(100, W - 100), y: r(100, H - 100) });
        if (i % 4 === 0) {
          await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1, buttons: 1 });
          await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
        }
        await s.send("Input.dispatchKeyEvent", { type: "keyDown", code, key: code === "Space" ? " " : code, windowsVirtualKeyCode: vk });
        await s.send("Input.dispatchKeyEvent", { type: "keyUp", code, key: code === "Space" ? " " : code, windowsVirtualKeyCode: vk });
      }
    };
    // First click focuses the frame for keyboard games; touch starts touch games.
    if (desktop) await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1, buttons: 1 })
      .then(() => s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 }));
    let lit = 0, captured = 0;
    const end = Date.now() + seconds * 1000;
    for (let i = 0; Date.now() < end; i++) {
      await input(i);
      const frame = await evaluate(`(async()=>{const at=performance.now();const m=await window.__capture();if(!m)return null;window.__ring.push(m.data,m.background,at);window.__rafs=m.frames;
        const img=await createImageBitmap(await (await fetch(m.data)).blob());const c=document.createElement('canvas');c.width=48;c.height=48;const x=c.getContext('2d');x.drawImage(img,0,0,48,48);const d=x.getImageData(0,0,48,48).data;let min=765,max=0;for(let k=0;k<d.length;k+=4){const v=d[k]+d[k+1]+d[k+2];if(v<min)min=v;if(v>max)max=v;}return {range:max-min};})()`);
      if (frame) { captured++; if (frame.range > 24) lit++; }
      await sleep(80);
    }
    if (process.env.SLOP_RECORDER_DEBUG) {
      const { data } = await s.send("Page.captureScreenshot", { format: "png" });
      (await import("node:fs")).writeFileSync(process.env.SLOP_RECORDER_DEBUG, Buffer.from(data, "base64"));
      console.error(JSON.stringify({ captured, lit, events: await evaluate("window.__events.map(e=>e.type).slice(0,40)") }));
    }
    // Safe diagnostics only: platform event names/counts, never game text.
    diagnostics.ready = announced;
    diagnostics.captured = captured;
    diagnostics.lit = lit;
    diagnostics.rafs = await evaluate("window.__rafs??null");
    diagnostics.errors = (await evaluate("window.__events.filter(e=>e.type==='webGameError').length"));
    if (!captured) throw new RecorderFailure(announced ? "blank_canvas" : diagnostics.errors ? "boot_error" : "not_ready", !diagnostics.errors);
    if (!lit) throw new RecorderFailure("blank_canvas");
    const result = await evaluate(`(async()=>{const picked=SlopRecorder.clipWindow(window.__ring.frames());if(!picked)return{error:'no_motion'};
      let rec;try{rec=await SlopRecorder.encodeCapture(picked.frames,${JSON.stringify(target)},{background:picked.background});}catch(e){return{error:/too large/i.test(e.message)?'capture_too_large':/move/i.test(e.message)?'no_motion':'recorder_error'}}
      const info=SlopRecorder.animatedGifInfo(rec.gif);const b64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)};
      return{gif:b64(rec.gif),cover:b64(rec.cover),frameCount:rec.frameCount,frames:info.frames,width:rec.width,height:rec.height};})()`);
    if (result?.error) throw new RecorderFailure(result.error, result.error !== "capture_too_large");
    const gif = Buffer.from(result.gif, "base64"), cover = Buffer.from(result.cover, "base64");
    return { target, gif, cover, frameCount: result.frameCount, width: result.width, height: result.height };
  } finally {
    await chrome.close();
    server.close();
  }
}
