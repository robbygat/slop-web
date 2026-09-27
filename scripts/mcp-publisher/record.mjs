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

// Capture timing. Recording lasts at least `seconds`; a slow scene (heavy
// three.js under CPU-rendered WebGL) keeps playing up to `maxSeconds` until the
// ring holds enough distinct frames for a clip. A game that never changes still
// yields no moving window and is rejected as no_motion.
// SwiftShader compiles each shader/pipeline variant lazily on the CPU, so a
// heavy scene runs at a fraction of a frame per second for its first seconds
// and speeds up as variants are cached. Warm-up waits for a steady rate.
const WARMUP_FRAMES = 8, WARMUP_FPS = 1.5, WARMUP_MS = 20000, ENOUGH_FRAMES = 24;

export async function recordGame(files, { seconds = 9, maxSeconds = 45, slowSeconds = 70, diagnostics = {} } = {}) {
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
  // Under software GL, multisampling multiplies SwiftShader's per-pixel cost
  // for no visible gain in a 360x640 clip, so the recorder asks for none.
  let softGL = false;
  const noMsaa = "try{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,a){if(typeof t==='string'&&/webgl/i.test(t))a={...(a&&typeof a==='object'?a:{}),antialias:false};return g.call(this,t,a);};}catch{}";
  const inject = () => `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>${softGL ? noMsaa + "\n" : ""}window.__slopPreviewCapture=true;\n(${installGameStorage.toString()})();\n${bootstrap}</script>`;
  // The viewport meta matters: under mobile emulation a page without one lays
  // out 980px wide and is zoomed out, so the 360px game frame would shrink to
  // a corner and nearly every synthetic touch would land outside it.
  const host = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#101215;overflow:hidden}iframe{border:0;width:${W}px;height:${H}px;display:block}</style>
<script>${recorder}</script></head><body><iframe id="game" sandbox="allow-scripts allow-pointer-lock" allow="autoplay; gamepad" referrerpolicy="no-referrer"></iframe>
<script>(()=>{const f=document.getElementById('game');window.__events=[];addEventListener('message',e=>{if(e.source!==f.contentWindow||typeof e.data!=='string'||e.data.length>750000)return;let m;try{m=JSON.parse(e.data)}catch{return}if(m&&typeof m.type==='string'){if(m.type==='webCaptureResult'||m.type==='webCaptureError'){(window.__pending?.[m.request])?.(m);return;}window.__events.push({type:m.type,at:performance.now()});}});
      window.__capture=()=>new Promise((resolve)=>{const request='r'+Math.random().toString(36).slice(2);const t=setTimeout(()=>{delete window.__pending[request];resolve(null)},15000);window.__pending=window.__pending||{};window.__pending[request]=m=>{clearTimeout(t);delete window.__pending[request];resolve(m.type==='webCaptureResult'?m:null)};f.contentWindow.postMessage(JSON.stringify({type:'webCapture',request}),'*');});
      window.__ring=SlopRecorder.createClipRing();
      // Lay the frame out before the game loads: a game whose first script runs
      // in a not-yet-sized frame reads innerWidth 0 and can keep a 1x1 canvas.
      void f.getBoundingClientRect().width;f.src='/game/index.html';})();</script></body></html>`;
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/host.html") { res.writeHead(200, { "content-type": MIME.html, "cache-control": "no-store" }); return res.end(host); }
    const rel = path.startsWith("/game/") ? path.slice(6) : null;
    if (!rel || !Object.hasOwn(files, rel)) { res.writeHead(404); return res.end(); }
    let body = files[rel];
    const headers = { "content-type": MIME[rel.split(".").pop()] ?? "application/octet-stream", "cache-control": "no-store" };
    if (rel === "index.html") {
      body = /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (m) => m + inject()) : inject() + body;
      headers["content-security-policy"] = policy();
    }
    res.writeHead(200, headers); res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}/`;
  const chrome = await launchChrome();
  const s = chrome.session;
  softGL = chrome.software;
  const evaluate = async (expression) => {
    const r = await s.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new RecorderFailure("recorder_error", true);
    return r.result.value;
  };
  // The input driver must stop on every exit path: a live driver's timers
  // would keep the publisher process (and the workflow) running forever.
  let playing = false;
  try {
    // Block everything that is not this local server or the one allowed CDN build.
    await s.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    s.on("Fetch.requestPaused", (p) => {
      const allowed = p.request.url.startsWith(origin) || p.request.url === THREE;
      s.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        allowed ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    });
    await Promise.all(["Page.enable", "Runtime.enable"].map((m) => s.send(m)));
    // Software GL (SwiftShader on the CI runner) renders every pixel on the
    // CPU: at DPR 2 heavy three.js scenes manage ~1-2 frames a second and the
    // clip never fills. DPR 1 is 4x fewer pixels; the encoder's output contract
    // (360x640 GIF, 720x1280 cover) is fixed regardless of the source size.
    const dpr = desktop || softGL ? 1 : 2;
    await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: !desktop });
    if (!desktop) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s.send("Page.navigate", { url: `${origin}host.html` });
    await sleep(500);
    // The host page installs its listener before the iframe loads, so an
    // early ready (a light game or the SDK's auto-ready) is never missed.
    for (let i = 0; !(await evaluate("typeof window.__capture==='function'&&!!window.__ring")); i++) {
      if (i > 50) throw new RecorderFailure("recorder_error", true);
      await sleep(100);
    }

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
    // Heavy scenes announce ready before shaders compile and the first real
    // frames land. Wait until the player's rAF counter has advanced a few
    // frames at a steady rate, so the clip starts on gameplay rather than on
    // stalled loading frames.
    const probe = () => evaluate("window.__capture().then(m=>m&&{frames:m.frames,width:m.width,height:m.height})");
    const warmStart = Date.now();
    let nudges = 0;
    const samples = [];
    for (let first = null; Date.now() - warmStart < WARMUP_MS; await sleep(150)) {
      const now = await probe();
      if (!now) continue;
      // A canvas that never saw its real size (a missed resize) captures as a
      // few pixels. A real viewport change re-sends resize to the game.
      if (now.width * now.height < 64 * 64 && nudges < 2) {
        nudges++;
        await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H + 1, deviceScaleFactor: dpr, mobile: !desktop });
        await sleep(200);
        await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: !desktop });
        await sleep(300);
        continue;
      }
      const at = Date.now();
      samples.push({ at, frames: now.frames });
      if (first === null) { first = now.frames; continue; }
      const past = samples.findLast((p) => at - p.at >= 1500);
      if (now.frames - first >= WARMUP_FRAMES && past && (now.frames - past.frames) * 1000 / (at - past.at) >= WARMUP_FPS) break;
    }
    diagnostics.nudges = nudges;
    // A scene that never reached a steady rate gets the longer budget.
    const slow = Date.now() - warmStart >= WARMUP_MS;
    diagnostics.warmupMs = Date.now() - warmStart;

    // Play while the ring captures every ~80 ms, exactly like the web publish flow.
    const cx = W / 2, cy = H * 0.6;
    const r = (a, b) => a + Math.random() * (b - a);
    // Touch play alternates quick taps with drags held across several
    // captures, so games that read the pointer once per (slow) frame still see
    // the finger down and moving, not a swipe that began and ended in between.
    let drag = null;
    const touch = (type, x, y) => s.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
    const input = async (i) => {
      if (!desktop) {
        if (drag) {
          if (drag.left-- > 0) {
            drag.x = Math.min(W - 20, Math.max(20, drag.x + drag.dx));
            drag.y = Math.min(H - 20, Math.max(H * 0.2, drag.y + r(-12, 12)));
            await touch("touchMove", drag.x, drag.y);
          } else { await touch("touchEnd"); drag = null; }
        } else if (i % 12 < 6) {
          if (i % 3 === 0) {
            const x = r(60, W - 60), y = r(H * 0.3, H * 0.85);
            await touch("touchStart", x, y);
            await touch("touchMove", x + r(-80, 80), y + r(-60, 60));
            await touch("touchEnd");
          }
        } else {
          drag = { x: r(80, W - 80), y: r(H * 0.45, H * 0.8), dx: r(-40, 40) || 20, left: 5 };
          await touch("touchStart", drag.x, drag.y);
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
    let lit = 0, captured = 0, distinct = 0;
    const began = Date.now(), end = began + seconds * 1000, hardEnd = began + Math.max(seconds, slow ? slowSeconds : maxSeconds) * 1000;
    // Input runs on its own clock: each dispatched event waits for the page to
    // handle it, which on a slow scene can take a frame, and must not hold up
    // the captures.
    playing = true;
    const driver = (async () => { for (let i = 0; playing; i++) { await input(i); await sleep(120); } })().catch(() => {});
    while (Date.now() < end || (distinct < ENOUGH_FRAMES && Date.now() < hardEnd)) {
      // Only the capture itself runs per frame. The game shares the host's main
      // thread, so on a scene that takes seconds per frame every extra task
      // here (decoding, measuring) would cost another whole frame.
      const frame = await evaluate(`(async()=>{const at=performance.now();const m=await window.__capture();if(!m)return null;window.__ring.push(m.data,m.background,at);window.__rafs=m.frames;return {distinct:window.__ring.frames().length};})()`);
      if (frame) { captured++; distinct = frame.distinct; }
      await sleep(80);
    }
    playing = false;
    await driver;
    // A frame is lit when it has visible contrast; the ring keeps each distinct frame.
    if (captured) lit = await evaluate(`(async()=>{let lit=0;for(const f of window.__ring.frames()){const img=await createImageBitmap(await (await fetch(f.data)).blob());const c=document.createElement('canvas');c.width=48;c.height=48;const x=c.getContext('2d');x.drawImage(img,0,0,48,48);const d=x.getImageData(0,0,48,48).data;let min=765,max=0;for(let k=0;k<d.length;k+=4){const v=d[k]+d[k+1]+d[k+2];if(v<min)min=v;if(v>max)max=v;}if(max-min>24)lit++;}return lit;})()`);
    if (drag) await touch("touchEnd");
    if (process.env.SLOP_RECORDER_DEBUG) {
      const { data } = await s.send("Page.captureScreenshot", { format: "png" });
      (await import("node:fs")).writeFileSync(process.env.SLOP_RECORDER_DEBUG, Buffer.from(data, "base64"));
      console.error(JSON.stringify({ captured, lit, distinct, dpr, nudges, warmupMs: diagnostics.warmupMs, seconds: Math.round((Date.now() - began) / 1000), events: await evaluate("window.__events.map(e=>e.type).slice(0,40)") }));
    }
    // Safe diagnostics only: platform event names/counts, never game text.
    diagnostics.ready = announced;
    diagnostics.captured = captured;
    diagnostics.lit = lit;
    diagnostics.distinct = distinct;
    diagnostics.dpr = dpr;
    diagnostics.seconds = Math.round((Date.now() - began) / 1000);
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
    playing = false;
    await chrome.close();
    server.close();
  }
}
