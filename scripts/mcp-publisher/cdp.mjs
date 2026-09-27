// Zero-dependency Chrome DevTools Protocol driver (Node >= 22 has WebSocket).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : "/usr/bin/google-chrome");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The recorder runs on GitHub-hosted Ubuntu without a GPU: SwiftShader gives
// real WebGL there. macOS development may use Metal.
export async function launchChrome({ gpu = process.platform === "darwin" && process.env.SLOP_GPU !== "0" } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "slop-cdp-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--mute-audio",
    "--disable-extensions",
    "--disable-sync",
    "--disable-component-update",
    "--disable-default-apps",
    "--metrics-recording-only",
    "--no-pings",
    // Network allowlist for untrusted games, enforced in Chrome's network
    // service for every frame: only the local bundle server and the one CDN
    // host whose single three.js build the player CSP permits.
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE cdnjs.cloudflare.com",
    // Sandboxed games are cross-origin frames; never throttle their frames.
    "--disable-features=ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes,IntensiveWakeUpThrottling,PaintHolding",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    ...(gpu ? ["--use-angle=metal"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(50);
  if (!existsSync(portFile)) {
    proc.kill("SIGKILL");
    throw new Error("Chrome did not start: " + stderr.slice(0, 500));
  }
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  let targets = [];
  for (let i = 0; i < 50; i++) {
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
    if (targets.some((t) => t.type === "page")) break;
    await sleep(100);
  }
  let page = targets.find((t) => t.type === "page");
  if (!page) {
    page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  }
  const session = await connect(page.webSocketDebuggerUrl);
  return {
    session,
    // SwiftShader renders WebGL on the CPU; the recorder sizes the scene for it.
    software: !gpu,
    async close() {
      try { session.close(); } catch {}
      proc.kill("SIGKILL");
      await sleep(150);
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  return {
    send(method, params = {}) {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method, params }));
      return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    close() { ws.close(); },
  };
}
