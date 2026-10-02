# Slop Worlds web candidate — local handoff

This is an implementation/test checkpoint, not a public deployment or native
acceptance claim. Owner checkout is unchanged. Worktree:
`/private/tmp/slop-web-persistent-20261002.I8zHz1/worktree`, branch
`codex/persistent-web-host-20261002`, based on main `717b666c`.

## Implemented

- Account/owner-epoch + game-lineage scoped IndexedDB saves, separate run/profile,
  atomic checkpoints, five recovery snapshots, corruption fallback, local-first
  ACK, serialized flush before in-app exits, offline sync queue, and explicit
  device/cloud conflict choice. Local SDK counters never outrank cloud base
  revisions. Rejected competing-tab branches are archived, not silently lost.
- Durable New run clears only run. Session generation prevents queued old-run
  snapshots from resurrecting progress after clear. Finished checkpoints retain
  profile. Saves remain game-authored data, not reward or score authority.
- Actual GamePlayer Continue/New run, feed Continue badge, guarded restart and
  source-checked typed messages. Private draft playtests have their own local
  preview namespace; they never call cloud save/claim RPCs.
- Hash-checked immutable-release binary asset bridge (four active requests,
  65,536-byte chunks), decoded limits, separate content cache/metadata with
  content deduplication and 500 MB release LRU. Cached boot HTML/JS/CSS/images and
  static module graphs are reconstructed without unauthenticated fallback reads.
- Exact composed `persistent-v1` runtime and local platform Three r128 are used
  only for admitted Worlds. Arcade `creator-v1` remains byte-identical. Existing
  opaque iframe sandbox and CSP are unchanged.
- MCP 0.6.0 candidate template, checker, server parser/upload path, web publication
  preflight and strict binary descriptors share decoded-byte admission. Limits:
  50,000,000 total / 8,000,000 file / 400 files / 5,000,000 boot. Actual persistence
  call, await-before-ready, checkpoint/commit and declared dependency closure
  are required. A spec-only persistence flag is dropped before hashing. The
  protected database/game-bundle mirror belongs to the separate authority rollout.

## Exact pins

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| persistent-v1.js | 452194 | dc6d666cc482ea568e9d752f9bcfd3eda02486ffca100724ac883d197a03c2f6 |
| creator-v1.js | 9612 | cf80d35f8be857d6e092460b362aaf0bd7238f34085d20c15ae376e994922d2f |
| Host Three r128 | 603445 | 9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2 |
| Shared admission rules | — | 009da2747502dd69811a28a818b3f1b1d85f25c74e5e599162a7f54daaf361ec |
| Shared runtime policy | — | cf34ec6e4b840b18568d2bdfce216d805bbd4a82c006aca6c4b1b358251b2ca9 |

The new `public/downloads/slop-game-mcp-0.6.0.tgz` is a **local candidate**;
no package/public URL was published by this task.
Its SHA-256 is
`3d9ec7ecb83258434f5f85065f572bdfef6ea15b6fecf86c4b172fa641971b83`
(175,049 bytes). The archive contains all eleven expected files, including the
shared runtime policy; its extracted runtime/rules/policy hashes match the source.
Package build log: `/private/tmp/slop-worlds-package-checkpoint-final-20261002.log`.
The package is not a substitute for deploying its compatible authority paths.

## Evidence and remaining gates

- Final full Node web suite: 384 passed,
  6 pre-existing browser/video checks skipped,
  including the clean and dirty local-counter/cloud-base regression cases.
- Final MCP suite: 98 passed, 2 skipped. Template has real persistence gating; packaged
  SDK→typed host→IndexedDB tests prove awaited durable reset/flush/recreation and
  actual pinned r128 GLTF-loader availability, not a native codec/UI claim.
- Deterministic 300 close/reopen cycles preserve exact run/profile/history. This
  uses fake-indexeddb; it is not a hours-long browser or OS force-kill test.
- Production Vite build passed with 388 public catalog routes. Existing large
  chunk warning remains; World-only Three is a separate dynamic platform chunk.
  `/private/tmp/slop-worlds-build-checkpoint-final-20261002.log` records the successful
  read-only public catalog fetch. The first sandboxed route fetch failed and was
  not treated as a successful build. This final build includes the browser close,
  explicit-ready, cached-CSS and checkpoint-barrier corrections below.
- Final test logs: `/private/tmp/slop-worlds-web-checkpoint-final-20261002.log`,
  `/private/tmp/slop-worlds-mcp-checkpoint-final-20261002.log` and
  `/private/tmp/slop-worlds-edge-checkpoint-final-20261002.log` (Deno check passed).
- The final runtime advances from `621bd084…` (450,831 bytes) to `dc6d666c…`
  (452,194 bytes). A genuine held checkpoint ACK reproduced two stale ordinary
  writes with the old runtime. The unchanged actual SDK→typed host→IndexedDB
  regression now retains newer run/profile edits until that durable ACK has
  updated both revisions, then saves them exactly once. A missing checkpoint
  ACK rejects after 30 seconds and fences automatic retries; it does not imply
  the checkpoint failed durably. Explicit later operations remain possible.
  All 39 host/SDK integration checks pass with inert services. RED/GREEN and
  integration logs are copied into the evidence directory under
  `slop-worlds-sdk-checkpoint-{barrier-red,barrier-green,integration-final}-20261002.log`.
- Final narrow correction: unloaded JS no longer grants capability; quoted and
  unquoted HTML dependencies, inline styles and posters count toward boot;
  unsupported srcset is rejected. Worlds reserve `covers/` and `previews/` for
  captured media, leaving Arcade admission unchanged. Host New run restart
  carries the durable run/profile revision map before authored reset callbacks.
  Both original admission gaps reproduced RED. A later independent nested-template
  fixture also reproduced a false capability grant; balanced inert-template
  exclusion now covers executable and first-load scanning, without confusing
  quoted tags or script string literals. All 13 admission cases pass.
  The real SDK-host restart-map test reproduced stale revision 1 versus durable
  revision 2, then passed with the new runtime and exact host revision map.
- Synchronous World SDK load-order policy is mirrored byte-for-byte in the
  packaged checker and server; browser publication delegates to the same policy
  while retaining existing stricter metadata checks. Async/defer/module/nomodule,
  duplicate SDK and game-before-SDK cases are rejected only on the persistent
  path. Arcade deferred SDK behavior is unchanged. Eight failures were preserved
  before the fix; all 26 runtime/admission checks then passed.
- Safe stale-revision error recovery is limited to this exact document/account
  generation's recorded host-correlated flush. The offered scope revision,
  resulting two-scope revision map and exact content must still match both live
  state and an atomic no-change IndexedDB read; cloud/device conflicts never
  receive `revision_resync`. New run, owner ABA and late verification retire the
  proof. The real composed SDK→host→IndexedDB test reproduced blind retries
  (four writes instead of two), then passed with the frozen recovery SDK: reject
  the stale writes, adopt only verified counters, and wait for an explicit later
  save. The 34 host/SDK integration checks passed with no live RPCs.
- Final logs: `/private/tmp/slop-persistent-web-runtime-final-20261002.log`,
  `/private/tmp/slop-persistent-mcp-runtime-final-20261002.log`,
  `/private/tmp/slop-persistent-mcp-runtime-package-20261002.log`,
  `/private/tmp/slop-persistent-runtime-order-red-20261002.log`,
  `/private/tmp/slop-persistent-runtime-order-green-20261002.log`, and
  `/private/tmp/slop-persistent-sdk-host-resync-{red,green}-20261002.log`.
- Logs: `/private/tmp/slop-persistent-web-template-final-20261002.log`,
  `slop-persistent-mcp-template-final-20261002.log`,
  `slop-persistent-host-restart-map-green-20261002.log`,
  `slop-persistent-cloud-base-counter-20261002.log`, and
  `slop-persistent-web-template-build-20261002.log` under `/private/tmp`.
- Cross-tab hydration now changes the local SDK counter whenever cloud content
  replaces a clean device snapshot, even if local counter 100 exceeds cloud
  revision 3. The atomic write also compares the exact captured row and preserves
  a newer tab's data when a delayed cloud read returns. Metadata-only refreshes
  leave clean, identical content untouched. Three behavior regressions reproduced
  the failures before correction; 37 host/actual-SDK checks then passed. Logs:
  `/private/tmp/slop-persistent-cloud-hydration-{red,green}-20261002.log`.
- Root's actual Browser check found `Illegal invocation` on close: raw browser
  timer functions had been stored as session methods, changing their receiver.
  Global-receiver wrappers fix this without changing save timing; a brand-checking
  regression reproduced RED, then all 38 host/SDK checks passed. Root subsequently
  observed close completing with durable run/profile 3/3 and zero backend calls.
  Logs: `/private/tmp/slop-worlds-browser-timer-{red,green}-20261002.log`.
- Worlds now ignore the legacy relay document-loaded readiness signal and await
  their explicit SDK ready after first draw. Arcade keeps its fallback. The exact
  relay regression reproduced RED; all 45 relay/host/SDK checks then passed. Logs:
  `/private/tmp/slop-worlds-explicit-ready-{red,green}-20261002.log`.
- Local browser fixture: `http://127.0.0.1:5192/__worlds-qa/`, sources at
  `/private/tmp/slop-worlds-browser-acceptance-20261002.1C8Wqc`. It uses the actual
  opaque GamePlayer, SDK, IndexedDB and asset cache with synthetic local bytes,
  inert account/RPC adapters and a visible QA watermark. This is not a signed
  live private-preview token or a cloud/account acceptance result.
- The repeatable equivalent is preserved under `tools/worlds-acceptance/`:
  `npm run qa:worlds` starts the loopback-only host on port 5193. Generated module
  baseline readback confirmed the inert auth/RPC aliases and the then-current
  450,831-byte SDK;
  fixture digest `82a68ae76de4691fe33fea9cd5e60ed48c3aa5578f5ef8b9cf3e863a0b23d824`.
  Its separate port has separate browser storage. The previously observed values
  below belong to the original 5192 fixture, not an unobserved new-port run.
- Parent-observed Browser acceptance on that fixture: close completed; reopening
  and Continue restored run steps 3 / profile visits 3. With fixture asset reads
  disabled, cached reopening reached ready with zero asset requests and zero
  forbidden backend calls. New run reset run to `{}` while preserving profile 3;
  a host page reload still showed run `{}` / profile 3 at revision 7. The offline
  toggle is a session-local fixture control, not a full browser-network outage.
  This Browser observation used the previous `621bd084…` runtime. The later
  checkpoint fix has actual SDK/host/IndexedDB test evidence above, not a fresh
  Browser/native acceptance claim. Restart the local QA host to generate a
  fixture with the current runtime before repeating Browser acceptance.
- Cached boot follow-up preserves `<link media>` and valid unquoted stylesheet
  imports while rejecting unsupported srcset rather than leaving a network
  dependency. Both failure cases reproduced RED, then all nine boot/cache tests
  passed: `/private/tmp/slop-worlds-css-boot-{red,green}-20261002.log`.
- The exact 50,000,000-byte, eleven-file binary-heavy draft now traverses the
  actual handler and streamed outgoing adapter using inert services: HTTP 200,
  exact byte receipt, zero network/production writes. Local Deno sampled
  isolate-accounted memory (used heap + external + malloc) was 156,115,688 bytes
  / 482.800 ms CPU with native base64 and 197,110,485 bytes / 538.616 ms CPU with
  the indexed fallback. Process RSS peaks were 298,008,576 / 337,952,768 bytes;
  RSS is not silently presented as the smaller isolate metric. These are local
  benchmarks, not observed deployed Edge acceptance. No forced GC was used.
  They used the previous `621bd084…` runtime; transport/reader source is unchanged,
  but these measurements are not relabeled as a fresh final-runtime benchmark.
  The prior failure is preserved in
  `/private/tmp/slop-worlds-handler-memory-baseline-red.json` (its mixed-process
  baseline limitation is recorded there); final measurements are
  `/private/tmp/slop-worlds-50mb-handler-{native,fallback}-green.json`.
- Active-token, nominal 69 MB invalid binary/Unicode scalars cancel before a
  full token join or send_draft: sampled 26.22 / 16.45 MB and 35.933 / 35.379 ms
  CPU. Strict UTF-8, split escapes/surrogates, canonical base64, prototype keys,
  original wire-byte ceiling and source hashes remain covered. The retained
  70,000,000-byte raw JSON ceiling can reject pathological heavily escaped
  50 MB text; the decoded allowance is not a promise for every wire encoding.
  The large authenticated `claim_draft` upstream response also uses the bounded
  reader; its adapter regression deliberately rejects `Response.json()` on that
  path and still confirms the preview. Small RPC response handling is unchanged.
- Still open: deployed Edge acceptance, live compatible MCP/game-bundle rollout,
  tab hard-kill/full-network-offline/cross-device acceptance,
  and a cold offline visit to the entire website. This site has no app-shell
  service worker or persisted route/catalog bootstrap; cached player assets do
  not establish cold-site offline launch. Browser termination cannot await a
  flush; only already durable checkpoints are guaranteed by this local design.
  No live draft was submitted by these tests. Root owns the guarded live setup;
  this web branch does not apply SQL or deploy either Edge function.

## Exact deployment boundary

The recursively resolved `slop-mcp/index.ts` closure has eight local siblings:
`index.ts`, `handler.mjs`, `contract.mjs`, `publisher.mjs`, `bundle-rules.mjs`,
`runtime-policy.mjs`, `json-body.mjs` and `json-reader.mjs`. There are no external
imports in that closure. Exact hashes and local evidence are retained in
`docs/evidence/2026-10-02-worlds-web/manifest.json`. Earlier six-/seven-file
lists predate the bounded JSON helpers and must not be used for deployment.
The exact runtime artifact is distributed in the package; the Edge policy pins
its digest rather than importing its bytes. The paired guarded SQL/game-bundle
authority rollout is separate and must be verified before public World creation.
Authored-source whitespace checks pass. The byte-pinned generated SDK retains
upstream GLTFLoader whitespace, and copied build logs retain their original
trailing spaces; these are intentionally not reformatted or rehashed.

No game content, publication, live follows/accounts, paid media, ads configuration,
or mobile save storage changed in this web worktree.

The only additional download change is the explicitly approved shared Android
2075 metadata, documented in `docs/release/2026-10-02-android-2075.md`. Root
independently downloaded the public release and confirmed its exact hash,
package/version and matching signature. Older artifacts remain untouched.
