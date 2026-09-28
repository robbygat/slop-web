// Deterministic feed-video recorder. Plays one game in headless Chrome under
// the player's CSP and sandbox, but on a virtual clock (clock.js): after boot
// the game only advances when the recorder steps it 1/30 s, and every step is
// screenshotted. A scene that renders at 2 fps under software GL therefore
// still yields a smooth, true-speed 30 fps clip. Frames are encoded by ffmpeg
// into an H.264 (High, yuv420p, +faststart) loop with a crossfaded seam, plus
// a poster JPEG of the loop's first frame.
//
// Sources: `{ files }` (an MCP bundle held in memory) or `{ baseUrl }` (a
// published release, proxied through the local server so the page itself can
// still reach only 127.0.0.1 and the one allowed three.js build).
// Nothing here logs game source, names or media.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchChrome } from "./cdp.mjs";
import { installGameStorage } from "../../src/lib/player-storage.js";
import { installLegacyKeyboard, legacyControlSpec } from "../../src/lib/player-input.js";
import { installRecorderClock } from "./clock.js";
import { installRecorderInput, mobileInputFrame } from "./input.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const THREE = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const RELEASE_ORIGIN = "https://api.slop.game/storage/v1/object/public/games/";
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", txt: "text/plain; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp3: "audio/mpeg",
  ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  glb: "model/gltf-binary", gltf: "model/gltf+json", wasm: "application/wasm", bin: "application/octet-stream" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const FPS = 30;
export const VIDEO_SIZES = Object.freeze({ portrait: [720, 1280], landscape: [1280, 720] });

export class VideoFailure extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

// Small deterministic PRNG so the same game gets the same synthetic play.
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function ffmpegPath() { return process.env.FFMPEG_PATH ?? "ffmpeg"; }
function runFfmpeg(args, { timeoutMs = 240_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { if (stderr.length < 4000) stderr += d; });
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.slice(0, 400)}`)); });
  });
}

// Encodes numbered JPEG frames into a looping H.264 clip. The first `seam`
// frames are cut from the start and crossfaded over the end, so the last frame
// flows back into the first with no visible jump.
export async function encodeLoop(dir, count, { width, height, seam = 12, crf = 25, out = join(dir, "preview.mp4") } = {}) {
  const k = Math.min(seam, Math.floor(count / 4));
  const bodyFrames = count - k;
  const scale = `scale=${width}:${height}:flags=lanczos:out_range=tv:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  const filter = k >= 2
    ? `[0:v]${scale},split[a][b];[a]trim=end_frame=${k},setpts=PTS-STARTPTS[head];` +
      `[b]trim=start_frame=${k},setpts=PTS-STARTPTS[body];` +
      `[body][head]xfade=transition=fade:duration=${(k / FPS).toFixed(4)}:offset=${((bodyFrames - k) / FPS).toFixed(4)},format=yuv420p[v]`
    : `[0:v]${scale},format=yuv420p[v]`;
  const encode = (quality) => runFfmpeg([
    "-y", "-framerate", String(FPS), "-i", join(dir, "f%05d.jpg"),
    "-filter_complex", filter, "-map", "[v]", "-an",
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.0", "-preset", "slow", "-tune", "animation",
    "-crf", String(quality), "-maxrate", "2400k", "-bufsize", "4800k", "-g", String(FPS * 2), "-keyint_min", String(FPS),
    "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", String(FPS), "-movflags", "+faststart", "-metadata", "title=", out,
  ]);
  let quality = crf, bytes;
  for (;;) {
    await encode(quality);
    bytes = await readFile(out);
    // Hard ceiling for a feed loop; a noisy particle scene steps down quality.
    if (bytes.length <= 2_600_000 || quality >= 33) break;
    quality += 3;
  }
  const poster = join(dir, "poster.jpg");
  await runFfmpeg(["-y", "-i", out, "-frames:v", "1", "-q:v", "3", "-pix_fmt", "yuvj420p", poster]);
  return { video: bytes, poster: await readFile(poster), crf: quality, frames: bodyFrames };
}

// Mean absolute luma difference between consecutive tiny thumbnails, from
// ffmpeg, to reject clips that never move or never light up.
async function motionStats(dir, count) {
  const raw = join(dir, "thumbs.gray");
  await runFfmpeg(["-y", "-framerate", String(FPS), "-i", join(dir, "f%05d.jpg"), "-vf", "scale=24:40,format=gray", "-f", "rawvideo", raw]);
  const data = await readFile(raw), size = 24 * 40;
  let moving = 0, lit = 0;
  for (let i = 0; i < count; i++) {
    const frame = data.subarray(i * size, (i + 1) * size);
    let min = 255, max = 0;
    for (const v of frame) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min > 12) lit++;
    if (i) {
      const prev = data.subarray((i - 1) * size, i * size);
      let diff = 0;
      for (let p = 0; p < size; p++) diff += Math.abs(frame[p] - prev[p]);
      if (diff / size > 0.35) moving++;
    }
  }
  return { moving, lit };
}

function contentType(path) { return MIME[path.split(".").pop()?.toLowerCase()] ?? "application/octet-stream"; }
function safeRelative(path) {
  return typeof path === "string" && path.length <= 240 && !path.includes("..") && !path.includes("\\") &&
    /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(path);
}

/**
 * Records one feed video.
 * @param {{files?: Record<string,string>, baseUrl?: string}} source
 * @param {{target?: 'mobile'|'desktop'|'cross-platform', seconds?: number, diagnostics?: object, seed?: number}} options
 */
export async function recordVideo(source, { target = "mobile", seconds = 7, diagnostics = {}, seed = 1 } = {}) {
  const desktop = target === "desktop";
  const [W, H] = desktop ? [1280, 720] : [360, 640];
  const [OW, OH] = desktop ? VIDEO_SIZES.landscape : VIDEO_SIZES.portrait;
  const fromFiles = !!source?.files;
  if (fromFiles && typeof source.files["index.html"] !== "string") throw new VideoFailure("runtime_invalid");
  if (!fromFiles && !(typeof source?.baseUrl === "string" && source.baseUrl.startsWith(RELEASE_ORIGIN) && source.baseUrl.endsWith("/"))) {
    throw new VideoFailure("runtime_invalid");
  }
  const bootstrap = await readFile(join(root, "src/lib/player-bootstrap.js"), "utf8");
  const legacy = fromFiles ? null : legacyControlSpec(`${source.baseUrl}index.html`);

  // Remote release files are fetched once and kept for this recording only.
  const remote = new Map();
  let remoteBytes = 0;
  async function fetchRemote(rel) {
    if (remote.has(rel)) return remote.get(rel);
    const pending = (async () => {
      const response = await fetch(source.baseUrl + rel, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return null;
      const body = Buffer.from(await response.arrayBuffer());
      remoteBytes += body.length;
      if (remoteBytes > 80 * 1024 * 1024) throw new VideoFailure("bundle_too_large");
      return body;
    })();
    remote.set(rel, pending);
    return pending;
  }

  let port = 0;
  const base = () => `http://127.0.0.1:${port}/game/`;
  const policy = () => ["sandbox allow-scripts allow-pointer-lock", "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${base()} ${THREE}`,
    `style-src 'unsafe-inline' ${base()}`, `img-src ${base()} data: blob:`, `media-src ${base()} data: blob:`,
    `font-src ${base()} data:`, `connect-src ${base()} data: blob:`, `worker-src ${base()} blob:`,
    "object-src 'none'", "frame-src 'none'", "form-action 'none'", `base-uri ${base()}`].join("; ");
  let softGL = false;
  const noMsaa = "try{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,a){if(typeof t==='string'&&/webgl/i.test(t))a={...(a&&typeof a==='object'?a:{}),antialias:false};return g.call(this,t,a);};}catch{}";
  const inject = () => `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>(${installRecorderClock.toString()})();\n(${installRecorderInput.toString()})();\n${softGL ? noMsaa + "\n" : ""}window.__slopPreviewCapture=true;\n(${installGameStorage.toString()})();\n${legacy ? `(${installLegacyKeyboard.toString()})(${JSON.stringify(legacy)});\n` : ""}${bootstrap}</script>`;
  const host = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;overflow:hidden}iframe{border:0;width:${W}px;height:${H}px;display:block}</style></head>
<body><iframe id="game" sandbox="allow-scripts allow-pointer-lock" allow="autoplay; gamepad" referrerpolicy="no-referrer"></iframe>
<script>(()=>{const f=document.getElementById('game');window.__events=[];window.__errors=[];window.__controls=[];window.__acks=new Map();
addEventListener('message',e=>{if(e.source!==f.contentWindow||typeof e.data!=='string'||e.data.length>750000)return;let m;try{m=JSON.parse(e.data)}catch{return}if(!m||typeof m.type!=='string')return;
 if(m.type==='webGameError'&&window.__errors.length<12)window.__errors.push(String(m.message||'').slice(0,800));
 if(m.type==='slopRecorderControlsResult'){window.__controls=m.points;return;}
 if(m.type==='slopClockAck'){const r=window.__acks.get(m.seq);if(r){window.__acks.delete(m.seq);r();}return;}
 if(m.type==='webCaptureResult'||m.type==='webCaptureError')return;window.__events.push({type:m.type,at:performance.now()});});
let seq=0;window.__clock=(op,dt)=>new Promise(resolve=>{const s=++seq;const t=setTimeout(()=>{window.__acks.delete(s);resolve(false)},20000);window.__acks.set(s,()=>{clearTimeout(t);resolve(true)});f.contentWindow.postMessage(JSON.stringify({type:'slopClock',op,dt,seq:s}),'*');});
window.__send=m=>f.contentWindow.postMessage(JSON.stringify(m),'*');
void f.getBoundingClientRect().width;f.src='/game/index.html';})();</script></body></html>`;

  const server = http.createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path === "/host.html") { res.writeHead(200, { "content-type": MIME.html, "cache-control": "no-store" }); return res.end(host); }
      const rel = path.startsWith("/game/") ? path.slice(6) : null;
      if (!rel || !safeRelative(rel) || req.method !== "GET") { res.writeHead(404); return res.end(); }
      let body;
      if (fromFiles) body = Object.hasOwn(source.files, rel) ? Buffer.from(source.files[rel], "utf8") : null;
      else body = await fetchRemote(rel);
      if (!body) { res.writeHead(404); return res.end(); }
      // Sandboxed game frames have an opaque origin; local ES module imports
      // require CORS even though every asset comes from this one proxy.
      const headers = { "content-type": contentType(rel), "cache-control": "no-store", "access-control-allow-origin": "*" };
      if (rel === "index.html") {
        let html = body.toString("utf8");
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject()) : inject() + html;
        body = Buffer.from(html, "utf8");
        headers["content-security-policy"] = policy();
      }
      res.writeHead(200, headers); res.end(body);
    } catch {
      res.writeHead(500); res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}/`;
  const dir = await mkdtemp(join(tmpdir(), "slop-video-"));
  const chrome = await launchChrome();
  const s = chrome.session;
  softGL = chrome.software;
  const evaluate = async (expression) => {
    const r = await s.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new VideoFailure("recorder_error", true);
    return r.result.value;
  };
  try {
    await s.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    s.on("Fetch.requestPaused", (p) => {
      const allowed = p.request.url.startsWith(origin) || p.request.url === THREE;
      s.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        allowed ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    });
    await Promise.all(["Page.enable", "Runtime.enable"].map((m) => s.send(m)));
    // Portrait games render at DPR 2 so the 360x640 layout fills a true
    // 720x1280 frame. Speed no longer matters: the clock waits for each frame.
    const dpr = desktop ? 1 : 2;
    await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: !desktop });
    if (!desktop) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await s.send("Page.navigate", { url: `${origin}host.html` });
    for (let i = 0; !(await evaluate("typeof window.__clock==='function'").catch(() => false)); i++) {
      if (i > 100) throw new VideoFailure("recorder_error", true);
      await sleep(100);
    }
    // Boot in real time: wait for the SDK's ready (it also auto-announces).
    const start = Date.now();
    let events = [];
    while (Date.now() - start < 25000) {
      events = await evaluate("window.__events.map(e=>e.type)");
      if (events.includes("ready") || events.includes("loadError")) break;
      await sleep(200);
    }
    if (events.includes("loadError")) throw new VideoFailure("boot_error");
    diagnostics.ready = events.includes("ready");
    if (process.env.SLOP_VIDEO_DEBUG) console.error(`video: booted ${Date.now() - start} ms, ready ${diagnostics.ready}`);
    // Let first textures/shaders settle in real time, then take the clock.
    await sleep(softGL ? 2500 : 1200);
    if (!(await evaluate("window.__clock('freeze')"))) throw new VideoFailure("clock_unavailable", true);

    const rand = prng(seed);
    const r = (a, b) => a + rand() * (b - a);
    let touching = false;
    const touch = (type, x, y) => s.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
    const click = async (x, y) => {
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    };
    const keys = [["ArrowLeft", 37], ["ArrowRight", 39], ["ArrowUp", 38], ["Space", 32]];
    let held = null;
    const key = (type, [code, vk]) => s.send("Input.dispatchKeyEvent", { type, code, key: code === "Space" ? " " : code, windowsVirtualKeyCode: vk });
    // Play using ordinary trusted inputs on the virtual clock. Mobile uses a
    // bounded repertoire covering bottom trays, paired board taps, digging,
    // steering and fast upward flicks; desktop retains its keyboard controls.
    const input = async (frame) => {
      const f = frame % FPS;
      if (!desktop) {
        for (const event of mobileInputFrame(frame, { width: W, height: H, fps: FPS })) {
          await touch(event.type, event.x, event.y);
          touching = event.type !== "touchEnd";
        }
      } else {
        if (f === 0) { if (held) await key("keyUp", held); held = keys[Math.floor(rand() * 3)]; await key("keyDown", held); }
        if (f === 12 && held) { await key("keyUp", held); held = null; }
        if (f === 16) { await key("keyDown", keys[3]); await key("keyUp", keys[3]); }
        if (f === 22) await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r(120, W - 120), y: r(120, H - 120) });
        if (f === 24 && frame % (FPS * 2) === 24) await click(W / 2 + r(-100, 100), H * 0.6);
      }
    };
    let controlClicks = 0;
    const activateStart = async () => {
      if (controlClicks >= 4) return;
      await evaluate("window.__controls=null;window.__send({type:'slopRecorderControls'})");
      for (let tries = 0; tries < 20; tries++) {
        const points = await evaluate("window.__controls");
        if (Array.isArray(points)) {
          const point = points[0];
          if (Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= 0 && point.x < W && point.y >= 0 && point.y < H) {
            await click(point.x, point.y); controlClicks++;
          }
          return;
        }
        await sleep(10);
      }
    };
    // A short game may already have ended while textures/shaders settled.
    // Restart through the normal host lifecycle before collecting its clip.
    await evaluate("window.__send({type:'restart',request:'video-start'})");
    await activateStart();
    if (desktop && !controlClicks) await click(W / 2, H * 0.6);

    // Settle a few virtual frames (games often spawn on their first update),
    // then record. A game over restarts the game (as the feed card would).
    const settle = 6, total = Math.round(seconds * FPS) + 12;
    let seen = await evaluate("window.__events.length");
    let restarts = 0, frames = 0, stepMs = 0;
    for (let i = 0; i < settle + total; i++) {
      if (i && i % FPS === 0) await activateStart();
      await input(i);
      const t0 = Date.now();
      if (!(await evaluate(`window.__clock('step',${1000 / FPS})`))) throw new VideoFailure("clock_unavailable", true);
      stepMs += Date.now() - t0;
      const fresh = await evaluate(`window.__events.slice(${seen}).map(e=>e.type)`);
      seen += fresh.length;
      if (fresh.includes("loadError")) throw new VideoFailure("boot_error");
      if (fresh.some((t) => t === "finished" || t === "gameOver" || t === "over") && restarts < 4) {
        restarts++;
        await evaluate(`window.__send({type:'restart',request:'video-${restarts}'})`);
      }
      if (i < settle) continue;
      const { data } = await s.send("Page.captureScreenshot", { format: "jpeg", quality: 94, captureBeyondViewport: false, optimizeForSpeed: true });
      // Mobile DPR-2 screenshots can leave Chrome's input transform at 2x
      // even while layout metrics report scale 1. Restore CSS-coordinate
      // input after capture so the next trusted touch reaches its target.
      // This preserves DPR and the full-resolution frame already captured.
      if (!desktop) {
        await s.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
        // The input transform commits asynchronously. Wait for the host's
        // native compositor frames; the game's virtual clock stays frozen.
        await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
      }
      await writeFile(join(dir, `f${String(frames).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
      frames++;
      if (process.env.SLOP_VIDEO_DEBUG && frames % 30 === 0) console.error(`video: ${frames} frames, step ${Math.round(stepMs / (i + 1))} ms`);
    }
    if (touching) await touch("touchEnd").catch(() => {});
    diagnostics.frames = frames;
    diagnostics.restarts = restarts;
    diagnostics.controlClicks = controlClicks;
    diagnostics.stepMs = Math.round(stepMs / Math.max(1, settle + total));
    diagnostics.errors = await evaluate("window.__events.filter(e=>e.type==='webGameError').length");
    const stats = await motionStats(dir, frames);
    diagnostics.moving = stats.moving; diagnostics.lit = stats.lit;
    if (stats.lit < frames * 0.5) throw new VideoFailure("blank_canvas");
    if (stats.moving < frames * 0.15) throw new VideoFailure("no_motion");
    const encoded = await encodeLoop(dir, frames, { width: OW, height: OH });
    diagnostics.crf = encoded.crf;
    return {
      target, video: encoded.video, poster: encoded.poster, width: OW, height: OH,
      durationMs: Math.round((encoded.frames / FPS) * 1000), fps: FPS,
    };
  } finally {
    if (process.env.SLOP_VIDEO_DEBUG) diagnostics.gameErrors = await evaluate("window.__errors || []").catch(() => []);
    await chrome.close();
    server.close();
    if (!process.env.SLOP_VIDEO_KEEP) await rm(dir, { recursive: true, force: true }).catch(() => {});
    else diagnostics.dir = dir;
  }
}

// Reads the MP4 facts the server also checks, for local runs and tests.
export async function listFrames(dir) { return (await readdir(dir)).filter((n) => /^f\d{5}\.jpg$/.test(n)).length; }
