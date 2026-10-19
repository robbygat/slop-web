# Publisher preview quality

`recordVideo({files})` captures real gameplay with trusted pointer, touch and
keyboard input, then checks its frames before encoding. The normal 24×40
whole-frame motion test is unchanged. At least half the frames must be nonblank,
and at least 15% of all captured frames must show motion.

An explicitly typed multiplayer source bundle can use a local-motion fallback
when the whole-frame test misses small balls or board pieces. Eligibility
requires `game_type: "multiplayer"`, a valid `turns-v1` contract, source admission,
and the exact canonical `multiplayer-v1` runtime and boot order. A title,
catalog field, caller option or HTML marker alone cannot select this policy.
Untyped historical bundles, ordinary games, Worlds, and remote `baseUrl` repair
jobs retain their existing policy. MCP finish/admission and media validators
are unchanged; first publication supplies the full stored source to this recorder.

The fallback analyzes at most 1,800 frames at 144×256 (portrait) or 256×144
(landscape). Inside the centered 80%, an overlapping 8×8 tile must contain at
least six pixels differing by 12 gray levels and a mean difference of at least
3. The same 15% frame requirement applies. Blank clips never reach this path.
Longer captures retain the original whole-frame policy. Diagnostics preserve
the original `moving` and `lit` counts and separately report `localizedMoving`
and `motionPolicy: "turns-local-v1"` when the fallback is evaluated.

This visual test cannot prove that every animation is gameplay. Static, noisy
and real idle scenes are regression negatives; independent gameplay review and
two-client tests remain necessary. The recorder does not read authored game
state, fabricate peers, inject scores, or introduce automatic game play modes.

Run the portable fixture and admission tests:

```sh
node --test test/turns-preview-motion.test.mjs test/video-recorder.test.mjs test/world-recorder.test.mjs test/game-recorder-input.test.mjs
```

To run the existing real browser and encoder tests, set `CHROME_PATH` to a
Chromium-family executable, `FFMPEG_PATH` to FFmpeg, and
`SLOP_RECORDER_BROWSER_TEST=1` / `SLOP_RECORDER_ENCODER_TEST=1`. Optional
`SLOP_VIDEO_KEEP=1` retains captured frames and `SLOP_VIDEO_DEBUG=1` records
diagnostics for manual review. Never publish diagnostic-only idle captures.

Lossless real gameplay and idle fixtures, hashes and measured results are in
`test/fixtures/turns-motion/`.
