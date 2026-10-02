import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {inspectBundle,fileBytes} from './bundle-rules.mjs';
import {mcpRuntimeProblem} from './runtime-policy.mjs';

// Local pre-flight for a draft bundle. It mirrors rules the server, the
// website publisher and the sandboxed players enforce, so an agent learns
// about a game that can never be published (or that crashes on its first
// frame) before the owner is asked to review it. Pure: no network, no files
// written. Hard `problems` are things Slop will reject or that break the game;
// `warnings` are likely mistakes.
const PATH = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:html|js|css|json|svg|txt)$/;
const runtimeDigests=new Map();

async function canonicalRuntimeDigest(persistent) {
  const name=persistent?'persistent-v1':'creator-v1';
  if(!runtimeDigests.has(name))runtimeDigests.set(name,createHash('sha256').update(await readFile(new URL(`./runtime/${name}.js`,import.meta.url))).digest('hex'));
  return runtimeDigests.get(name);
}

function metaContents(html, name) {
  const found = [];
  const source = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  for (const tag of source.matchAll(/<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const attributes = new Map();
    for (const attr of tag[1].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const key = attr[1].toLowerCase();
      if (!attributes.has(key)) attributes.set(key, attr[2] ?? attr[3] ?? attr[4]);
    }
    if (attributes.get("name")?.toLowerCase() === name) found.push(attributes.get("content"));
  }
  return found;
}

export async function checkBundle(files, { target_platform } = {}) {
  const problems = [], warnings = [];
  let checked;try{checked=inspectBundle(files);}catch(error){problems.push(error.message);}
  const persistent=!!checked?.persistent;
  if(checked)files=checked.files;
  const entries = Object.entries(files ?? {});
  let total = 0;
  for (const [path, text] of entries) {
    let bytes;try{bytes=fileBytes(path,text).length;}catch{bytes=0;}
    total += bytes;
    if (!persistent && path!=='slop.spec.json' && !PATH.test(path)) {
      problems.push(`"${path}": file names may only use letters, digits, "_" and "-" with ONE extension from html, js, css, json, svg, txt (so "game.v2.js" and "three.min.js" are rejected).`);
    }
    if (bytes > (persistent?8_000_000:512_000)) problems.push(`"${path}" exceeds its ${persistent?'8 MB':'512 KB'} file limit.`);
    if (bytes === 0) problems.push(`"${path}" is empty; Slop rejects empty files.`);
    if (path.length > 160) problems.push(`"${path}" is longer than 160 characters.`);
    if (/slop.*(?:asset|entitlement)|(?:asset|entitlement).*manifest/i.test(path)) {
      problems.push(`"${path}" looks like a reserved Store asset manifest name; rename it.`);
    }
  }
  if (entries.length > (persistent?400:64)) problems.push(`${entries.length} files; the limit is ${persistent?400:64} including metadata.`);
  if (total > (persistent?50_000_000:2_000_000)) problems.push(`The bundle is ${total} bytes; the limit is ${persistent?'50':'2'} MB.`);

  const html = typeof files?.["index.html"] === "string" ? files["index.html"] : null;
  if (!html) problems.push("index.html is required.");
  if (typeof files?.["slop.js"] !== "string") {
    problems.push("slop.js is missing. Copy it unchanged from slop_game_template.");
  } else if (createHash("sha256").update(files["slop.js"]).digest("hex") !== await canonicalRuntimeDigest(persistent)) {
    problems.push("slop.js was changed. The website refuses to publish unless it is the exact slop.js from slop_game_template.");
  }
  if (html) {
    const marker=persistent?'persistent-v1':'creator-v1';
    if (metaContents(html, "slop-runtime").length!==1||metaContents(html, "slop-runtime")[0]!==marker) {
      problems.push(`index.html needs exactly one <meta name="slop-runtime" content="${marker}">.`);
    }
    const targets = metaContents(html, "slop-target");
    if (targets.length > 1 || (targets[0] && !["mobile", "desktop", "cross-platform"].includes(targets[0]))) {
      problems.push('index.html needs exactly one <meta name="slop-target" content="mobile|desktop|cross-platform">.');
    } else if (targets[0] && target_platform && targets[0] !== target_platform) {
      problems.push(`index.html says slop-target "${targets[0]}" but target_platform is "${target_platform}"; publishing rejects conflicting targets.`);
    }
    if(persistent){
      const runtime=typeof files['slop.js']==='string'?files['slop.js']:'';
      const problem=mcpRuntimeProblem([{path:'1.0.0/slop.js',bytes:Buffer.byteLength(runtime),sha256:createHash('sha256').update(runtime).digest('hex')}],html,true);
      if(problem)problems.push(problem);
    }else{
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1] ?? null);
    const runtimeAt = scripts.findIndex((src) => src === "slop.js" || src === "./slop.js");
    if (runtimeAt < 0) problems.push('index.html must load <script src="slop.js"></script>.');
    else if (scripts.slice(0, runtimeAt).some((src) => src !== null)) {
      problems.push("Load slop.js before every other script file.");
    }
    for (const src of scripts) {
      if (src && !/^https?:/i.test(src) && !Object.hasOwn(files, src.replace(/^\.\//, ""))) {
        problems.push(`index.html loads "${src}", which is not in the bundle.`);
      }
      if (src && /^https?:/i.test(src)) {
        problems.push(`index.html loads "${src}". The player blocks external scripts; use Slop.three() for three.js r128.`);
      }
    }
    }
  }

  const code = entries
    .filter(([path]) => /\.(?:js|html)$/.test(path) && path !== "slop.js")
    .map(([, text]) => String(text)).join("\n");
  const rule = (pattern, message, hard = true) => {
    if (pattern.test(code)) (hard ? problems : warnings).push(message);
  };
  rule(/\b(?:localStorage|sessionStorage|indexedDB)\b/, persistent?"Slop Worlds must use Slop.persist, never browser storage.":"Games run in an opaque-origin sandbox where localStorage, sessionStorage and indexedDB throw SecurityError. Keep state in memory.");
  rule(/\bfetch\s*\(|\bXMLHttpRequest\b|new\s+WebSocket\b|\bEventSource\b/, "Network requests are blocked by the player's content security policy. Ship everything in the bundle.");
  rule(/\b(?:alert|confirm|prompt)\s*\(/, "alert, confirm and prompt are blocked in the sandbox.");
  rule(/\bnew\s+THREE\.Geometry\b|\bTHREE\.Face3\b/, "THREE.Geometry and Face3 do not exist in three.js r128. Use BufferGeometry.");
  rule(persistent?/examples\/jsm|\bOrbitControls\b|\bEffectComposer\b|\bUnrealBloomPass\b/:/examples\/jsm|\bOrbitControls\b|\bEffectComposer\b|\bGLTFLoader\b|\bUnrealBloomPass\b/, persistent?"Use the platform Slop.loadGLTF helper; arbitrary Three add-on imports are unavailable.":"Only core three.js r128 is available (no examples/jsm add-ons).");
  if (/\bWebGLRenderer\s*\(|getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["']/.test(code) && !/preserveDrawingBuffer\s*:\s*true/.test(code)) {
    problems.push("WebGL without preserveDrawingBuffer: true. The cover and gameplay preview capture come back black, so the game cannot be published.");
  }
  rule(/\brequestAnimationFrame\s*\(/, "Use Slop.loop for animation. A separate requestAnimationFrame loop keeps running when Slop pauses the game.", false);
  rule(/addEventListener\(\s*["']mouse(?:down|up)["']/, "slop.js calls preventDefault on pointerdown, so mousedown and mouseup never fire. Use pointerdown and pointerup.", false);
  rule(/<link[^>]+href\s*=\s*["']https?:|fonts\.googleapis|fonts\.gstatic/i, "External stylesheets and web fonts are blocked. Use system fonts.", false);
  for (const [call, why] of [
    ["Slop.ready", "announce the first real frame"],
    ["Slop.score", "report score during play"],
    ["Slop.finished", "end a run so Slop can show results"],
    ["Slop.onRestart", "reset completely when the player restarts"],
    ["Slop.loop", "run animation that pauses with the app"],
  ]) {
    if (!code.includes(call + "(")) warnings.push(`${call}() is never called (${why}).`);
  }
  if (/\bSlop\.three\s*\(/.test(code) && !/renderer\s*:\s*["']3d["']/.test(code)) {
    warnings.push("For 3D, create the surface with Slop.create({renderer:'3d'}) and render into surface.canvas; the website captures the largest canvas.");
  }
  if (target_platform === "desktop" && !/\b(?:key|Key)/.test(code)) warnings.push("Desktop target without keyboard handling.");
  return { ok: problems.length === 0, problems, warnings };
}
