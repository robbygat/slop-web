# Release verification

This record covers the shared backend and web account boundaries checked during
the September 16 overhaul. Visual revisions and final publication remain separate.

## Accounts and redirects

Production uses `https://slop.game` as the Supabase Auth Site URL. Google and Apple
are enabled. The extra redirect list retains `io.slop.game://login-callback/`.
The live GoTrue version is `v2.197.0`; its [redirect validator](https://github.com/supabase/auth/blob/v2.197.0/internal/utilities/request.go#L89-L107)
accepts the same scheme, host and port, so both the website OAuth callback and
`https://slop.game/#/settings?reset=1` are accepted. Localhost and `www.slop.game`
are not configured sign-in return destinations. No auth settings were changed.

Password updates now send the JWT captured when the owner submits the form,
verify the returned owner, and reject a changed account epoch. Tests cover a
switch to another account, a switch away and back, a forged owner response, and
an ordinary refresh of the same account token. No live password was changed.

## Shared comments and feed

Production lacked the native `game_comment_page` and `post_game_comment` RPCs,
their target resolver and insert authority. `supabase/social/restore-comments.sql`
restores only those dependencies and bounded social counts from mobile main
`e2538ff`. It excludes media pending deletion and protects direct table reads with
the same published/native target rule. The actual backend definitions, policies,
constraints and grants were backed up to `/tmp/slop-web-social/live-authority-before.json`
before changes. An exact transaction dry-run passed before applying the repair.

All 56 historical comments were retained. Of these, 51 belong to visible
published games, three to unpublished/deleting games and two to missing targets;
the latter five remain stored but are not returned publicly. No comments,
notifications, likes or analytics were created for testing. Native posting still
requires the captured nonanonymous account, canonical published/native game,
server-authored identity and timestamp, valid same-game parent, bounded text and
the existing durable rate limiter. Removing a parent preserves another person's
reply using a nullable parent reference. Client UPDATE and TRUNCATE are revoked.

Four local PostgreSQL tests exercise the actual repair SQL: alias resolution,
microsecond cursor ties, root/reply pages, public visibility, captured owner,
anonymous denial, identity forgery, invalid targets/body/GIF/parent, rate limits,
and deletion isolation. Run `node --test supabase/social/test/comments.test.mjs`.
The public production RPC now returns the expected complete page contract.

The actual public discovery API returned first and second eight-row pages with
zero duplicates for both popular and newest order. Combining each pair matched
a single sixteen-row query. Cursor construction preserves the original six-digit
Postgres timestamp and rejects filter grammar injection, with three focused tests.

## Platform association routes

The built public tree retains both Apple association paths and Android
`.well-known/assetlinks.json`, including the current APK fingerprint. The checked-in
Cloudflare worker includes `/mcp/pair`. However, the live Apple association route
currently responds as `application/octet-stream`; its JSON-serving worker route
still needs deployment/configuration before claiming verified iOS universal links.
No DNS or provider settings were changed. The ordinary web pairing page and the
new mobile in-app scanner have their own fallback paths.

## Paid billing

See [billing.md](billing.md) for the deployed fail-closed billing functions,
authority tests and external configuration still required before new purchases.
Paid activation is not a completed release capability.

## Player, fullscreen and public game names

The player keeps an opaque sandbox and per-frame bounded storage. This fixes
legacy games that threw a SecurityError on localStorage without exposing browser
session storage. Twelve public games were visually inspected, and fifteen real
bundles and referenced scripts returned HTTP 200. Flappy Duck was played through
a result and replay with mouse, then in a fresh round with keyboard. The shared
result panel always loads the native leaderboard; a game-run result is accepted
once and bound to the invoking owner, game and immutable request. Community
scores are not relabeled verified. Unattended For You autoplay does not submit a
score until interaction. There were no production score writes in these checks.

Legacy keyboard adapters are limited to seven exact audited bundle URLs. They
respect existing keyboard handlers, editable elements and coarse-pointer phones;
they do not infer controls for unknown games. New creator games must author
mouse, keyboard and touch controls through the shared generation contract.

The For You feed starts the most visible game automatically and mounts one live
game iframe. A geometry comparison over all cards avoids threshold-only observer
races. Portrait games use an iPhone-proportioned playfield, while explicit
landscape metadata retains its own ratio. In-app-browser QA at 390×844 verified
the top-layer fullscreen player at 390×796, with the same iframe and no native
fullscreen scaling error. Expanded players now hold a reference-counted body
scroll lock, including nested dialogs, and release it on exit/unmount. The feed
inserts one skippable app-download card after each ten real games; the card does
not mount a game, interrupt with a modal or change catalog pagination.

The applied `supabase/game-links/claims.sql` reserves immutable unique names with
owner checks and deletion tombstones. Public resolution only exposes published,
non-deleting, non-retired games. Namespace triggers prevent later raw-slug
creation from taking an existing alias. Five PostgreSQL tests cover reservations,
publication visibility, account isolation, tombstones and creator successors.
Live `prepare_creator_game_publication` and `finalize_creator_game_publication`
were inspected: `creator-release-*` is a private review candidate, and approval
updates the canonical target at `project.game_slug`. A new pending head does not
move the claimed URL. The resolver intentionally never follows arbitrary
client-supplied `draft_of` lineage. No test names were claimed in production.

## Formats and profiles

The targeted `supabase/game-platforms/platforms.sql` migration adds an explicit
`mobile`, `desktop` or `mobile+desktop` contract, independent of cover geometry.
Its checked owner RPC changes only the owner's game metadata with native rate
limits. Direct client writes to the column remain denied. The exact migration
was rollback-tested against all 398 existing games before applying; no existing
game was inferred cross-play. The separately restored original desktop games
are classified by their reviewed supported inputs.

You uses the six exact native profile background IDs and artwork. The three
starter backgrounds and Maker Path rewards are displayed together; availability
comes from `my_profile_banners`, and changes use `equip_profile_banner` with an
exact equipment/ownership receipt. Unknown future equipped IDs are retained,
not silently reset. Native profile follow counts, published-game counts and the
owner's liked-game shelf use the real backend. Password and account-switch
protection remain intact. Background contract tests check inventory and receipt
validation. Final authenticated visual/equip QA is recorded by the release owner.

The native Flutter For You promotion retains its existing non-game entry after
every ten real games. Its final design uses two full-bleed illustrated halves
from the native Build artwork, with the same authored desktop-monitor geometry,
the native morphing Slop, and actual June Run Infinite Hard/Skater gameplay.
The bundled 400×300 preview preserves the recording's speed: 171 frames over
17.1 seconds, with an exact source-poster fallback. It stops offscreen, in the
background, and for reduced motion. The native release agent subsequently
reported 69 passing focused tests covering Play, promo/layout/themes, native
mobile-platform filtering and catalog behavior, with clean analysis of four
production files. Version 3.7.3 build 2050 was installed and visible on the
dedicated Slop iPhone 17 Pro / iOS 26.5 simulator, and the lowercase Play text was
observed. An earlier full-bleed promo was observed; the latest generic desktop
promo revision is source-tested but still awaits direct observation after the
final reinstall. The final iOS rebuild and APK 4050 were still pending when this
status was recorded. Signing configuration exists; this is not yet an APK result.

## HD desktop gameplay captures

The hero recordings use the recovered June originals from commit `0c7aef1`.
Capture copies are isolated under `/tmp/slop-hero-hd`; the reviewed publication
bundles under `/tmp/slop-web-redesign/restored-desktop` were not changed.
Run Infinite keeps its original logical 800×600 geometry while rendering both
Canvas2D buffers at 1600×1200. SlopKart keeps the original 960×600 camera and
layout while its WebGL renderer draws at 1920×1200. These are fresh native
resolution renders, without an upscale or interpolated frames.

The QA drivers dispatch ordinary keyboard controls. Run Infinite uses the
authored Hard difficulty and Skater selection, with repeated jumps and steering;
the unmodified simulation reached 603 metres. The selected continuous segment
ends before the run dies. SlopKart uses acceleration, steering and item controls
through a real race. Neither capture changes physics, seeds, world state, scores
or unlocks. Canvas recording omits SlopKart's separate DOM HUD; the visible racing
scene itself comes directly from its original renderer.

| Web asset | Native dimensions | Duration | Encoding | Bytes |
| --- | --- | --- | --- | --- |
| `assets/games/run-infinite-desktop.mp4` | 1600×1200 | 16.500 s | H.264, 30 fps | 21,166,581 |
| `assets/games/slopkart-desktop.mp4` | 1920×1200 | 16.467 s | H.264, 30 fps | 5,725,564 |

Both exports use CRF 21, a bounded bitrate, limited-range YUV420P and fast-start
metadata. Their JPG posters are actual frames at the same native dimensions.
Selected first, middle and final gameplay frames were inspected, and browser
playback advanced with the expected native dimensions and no media error. Source
patches, raw recordings, segment ranges, hashes and encoding receipts are in
`/tmp/slop-hero-hd/final-capture-report.json` and
`/tmp/slop-hero-hd/kart-final-capture-report.json`. The mobile app's optimized
400×300 animation and bundled still were left unchanged.

## Final backend workflow checks

The remaining source-only checks from `.github/workflows/pages.yml` were rerun
after the visual work: billing PostgreSQL authority **8/8**, shared comments
**4/4**, public-name authority **5/5**, and platform authority **1/1** passed.
Deno's billing client and handler suite passed **9/9**, and all four billing
Edge Functions passed `deno check`. `actionlint` and `git diff --check` passed.
These checks use local fixtures and do not activate payments, deploy functions,
publish a game or mutate production records.
