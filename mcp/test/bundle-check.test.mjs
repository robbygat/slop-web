import test from "node:test";
import assert from "node:assert/strict";
import { checkBundle } from "../bundle-check.mjs";
import { gameTemplate } from "../game-template.mjs";

test("the bundled template passes its own pre-flight for every target", async () => {
  for (const target of ["mobile", "desktop", "cross-platform"]) {
    const { files } = await gameTemplate({ target_platform: target });
    const result = await checkBundle(files, { target_platform: target });
    assert.deepEqual(result.problems, [], target);
  }
});

test("pre-flight catches games that could never be published or would break in the sandbox", async () => {
  const { files } = await gameTemplate({ target_platform: "desktop" });
  const broken = {
    ...files,
    "slop.js": files["slop.js"] + "\n// tweaked",
    "game.v2.js": "x",
    "slop-assets.js": "x",
    "empty.js": "",
    "game.js": "const s=Slop.create({renderer:'3d'});Slop.three().then(T=>{new T.WebGLRenderer({canvas:s.canvas});localStorage.setItem('a','b');fetch('https://example.com');});",
  };
  const result = await checkBundle(broken, { target_platform: "mobile" });
  const text = result.problems.join("\n");
  assert.equal(result.ok, false);
  for (const expected of [/slop\.js was changed/, /game\.v2\.js/, /Store asset/, /empty/, /preserveDrawingBuffer/, /localStorage/, /Network requests/, /conflicting targets/]) {
    assert.match(text, expected);
  }
});

test("pre-flight flags a missing runtime, missing metadata and external scripts", async () => {
  const result = await checkBundle({
    "index.html": '<html><head></head><body><script src="https://cdn.example.com/lib.js"></script><script src="game.js"></script></body></html>',
    "game.js": "Slop.create();",
  });
  const text = result.problems.join("\n");
  for (const expected of [/slop\.js is missing/, /slop-runtime/, /external scripts/, /must load <script src="slop\.js">/]) {
    assert.match(text, expected);
  }
});
