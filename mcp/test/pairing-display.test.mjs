import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { pairingResult } from "../pairing-display.mjs";

test("computer pairing output includes a real QR decodable to the exact phone challenge", async () => {
  const uri =
    "https://slop.game/mcp/pair#id=11111111-1111-4111-8111-111111111111&code=abcdefabcdefabcdefabcdefabcdefab";
  const result = await pairingResult({
    status: "pending",
    confirmation_uri: uri,
  });
  const image = result.content.find((item) => item.type === "image");
  assert.equal(image.mimeType, "image/png");
  const png = PNG.sync.read(Buffer.from(image.data, "base64"));
  assert.equal(png.width, 640);
  assert.equal(png.height, 640);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, uri);
  const instructions=result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
  assert.match(instructions, /Scan QR/);
  assert.match(instructions, /does not grant access/);
  assert.match(instructions, /https:\/\/api\.slop\.game\/functions\/v1\/slop-mcp\/authorize#id=/);
});
test("QR generation rejects unrelated hosts and malformed or duplicated challenge fields", async () => {
  const uri =
    "https://slop.game/mcp/pair#id=11111111-1111-4111-8111-111111111111&code=abcdefabcdefabcdefabcdefabcdefab";
  for (
    const bad of [
      uri.replace("slop.game", "evil.example"),
      uri + "&code=abc",
      uri.replace("/mcp/pair", "/play/test"),
      uri.replace("code=abcdef", "code=%20abcdef"),
    ]
  ) {
    await assert.rejects(
      () => pairingResult({ confirmation_uri: bad }),
      /invalid pairing link/,
    );
  }
  assert.equal((await pairingResult({ status: "active" })).content.length, 1);
});

test("authorization instructions reject a substituted destination",async()=>{await assert.rejects(()=>pairingResult({confirmation_uri:"https://slop.game/mcp/pair#id=11111111-1111-4111-8111-111111111111&code=abcdefabcdefabcdefabcdefabcdefab",authorization_uri:"https://evil.example"}),/invalid authorization link/);});
