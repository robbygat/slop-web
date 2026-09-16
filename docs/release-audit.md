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
every ten real games. Its design uses two full-bleed illustrated halves
from the native Build artwork, with the same authored desktop-monitor geometry
and native morphing Slop. The first motion revision used an optimized
400×300 Run Infinite Hard/Skater recording. The final source replaces that
preview with the verified 15-second, 1280×800 three-game desktop video reel
described below. Playback stops offscreen, in the background, and for reduced
motion. The native release agent subsequently
reported 69 passing focused tests covering Play, promo/layout/themes, native
mobile-platform filtering and catalog behavior, with clean analysis of four
production files. Version 3.7.3 build 2050 was installed and visible on the
dedicated Slop iPhone 17 Pro / iOS 26.5 simulator, and the lowercase Play text was
observed. An earlier full-bleed promo was observed; the latest generic desktop
promo revision is source-tested but still awaits direct observation after the
final reinstall. The native release agent later verified APK 4050 from source
`66313b2d4b17bc1ad80e1f458dffb7d964cbe26c`: the strict release build passed, the
signing certificate stayed the same, and Android 36 upgraded in place from 4049
to 4050, then replaced the earlier 4050 artifact with the final reel revision.
Bytes pulled from the installed app matched the final 71,244,205-byte download
at `public/downloads/slop-game-3.7.3-4050-arm64.apk`, SHA-256
`bcabba16ba5f171d9bf1445394ce06799723f61bd522e642b56c88870b1088d6`.
Cold launch produced no fatal or unhandled Flutter error. The latest promo had
24 focused checks and analysis, with 11 release/link checks; these overlap earlier
suites and are not an additional combined test count. The exact 15-second
1280×800, 30 fps desktop reel was verified inside both the APK and installed iOS
2050 app. Final promo observation
remains separate from verified installation and build success.

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
| `assets/games/run-infinite-desktop.mp4` | 1600×1200 | 5.000 s | H.264, 30 fps | 6,984,943 |
| `assets/games/slopkart-desktop.mp4` | 1920×1200 | 5.000 s | H.264, 30 fps | 1,850,881 |

Both exports use CRF 21, a bounded bitrate, limited-range YUV420P and fast-start
metadata. Their JPG posters are actual frames at the same native dimensions.
Selected first, middle and final gameplay frames were inspected, and browser
playback advanced with the expected native dimensions and no media error. Original full-capture source
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


## Additional originals: publication and complete stage fit

The release owner published Dungeon Panic, Slopcraft and Umbral Red through the
existing authorized finalizers under `@slop.game`. These join Run Infinite,
SlopKart and Sloppy Zombies, making six recovered June originals. The three
additional releases use the final reviewed manifests and eight immutable public
objects each; their source/runtime hashes, roots and receipts are recorded in
`desktop-release-receipts.json`. The added games are explicitly desktop games.
No existing player's game name, ownership or source was replaced.

The additional restoration checker passed 24 focused checks; the original
three-game checker retained its 27 passing checks. All use the canonical
Slop.js runtime in an opaque sandbox. Dungeon Panic retains its single-player
rooms/combat and reports its original score at game over. Slopcraft and Umbral
Red retain their open-ended play without an invented ranked ending. Unsupported
legacy multiplayer entry points were removed. Slopcraft's pointer-lock rejection
fallback uses real drag-to-look plus its original movement, mining and placement
handlers; actual play verified movement, jumping, mining and a placed glowstone
block.

All three additional games were measured inside opaque iframes at both desktop
sizes. These are rendered stage bounds, with original logical world dimensions
preserved:

| Game | 1280×800 host | 900×500 host |
| --- | --- | --- |
| Dungeon Panic | 1066.664×799.992, centered | 666.664×499.992, centered |
| Umbral Red | 1066.664×799.992, centered | 666.664×499.992, centered |
| Slopcraft | 1280×720, centered | 888.883×499.992, centered |

None overflowed or cropped. Removing the standalone decorative Slopcraft stage
border preserved the exact 16:9 canvas fit. Dungeon and Umbral keep their
original 800×600 canvas. Publication covers are 1280×720 and previews are
640×360 with 30 frames, letterboxed where needed. Additional cover/GIF byte
receipts respectively are Dungeon 51,531/938,512; Slopcraft 62,456/333,765;
Umbral 43,265/360,430. These pass the finalizer's image limits.

## Complete gameplay media receipts

At the user's final request, all twelve active hero videos now last exactly five
seconds, except Dead Signal at six seconds. Each starts during actual play.
All are H.264, 30 fps, YUV420P and fast-start; the five-second files have exactly
150 decoded frames and Dead Signal has 180. The final cuts preserve their prior
native dimensions, crop and speed, with no resize or motion interpolation.

| Game | Actual rendered pixels | Duration | MP4 bytes |
| --- | --- | --- | --- |
| Run Infinite | 1600×1200 | 5.000 s | 6,984,943 |
| SlopKart | 1920×1200 | 5.000 s | 1,850,881 |
| Sloppy Zombies | 1600×1200 | 5.000 s | 319,508 |
| Dungeon Panic | 1600×1200 | 5.000 s | 459,827 |
| Slopcraft | 1920×1080 | 5.000 s | 662,395 |
| Umbral Red | 1600×1200 | 5.000 s | 270,405 |
| Flight Horizon | 1206×2188 | 5.000 s | 2,030,998 |
| Night Drift X | 1206×1974 | 5.000 s | 3,745,318 |
| Dead Signal | 1206×2188 | 6.000 s | 1,750,062 |
| Surfy Sub | 1080×2340 | 5.000 s | 2,170,993 |
| Flappy Duck | 1080×2340 | 5.000 s | 800,720 |
| Stax | 1080×2340 | 5.000 s | 1,958,978 |

Combined video bytes fall from 78,344,866 to 23,005,028, a 70.64% reduction.
Original complete clips, posters and metadata remain under
`/tmp/slop-hero-shortcuts-20260916/originals`; final receipts preserve each
original full clip's hash, bytes and duration beside the chosen edit offset.
Desktop receipts are in `desktop-hero-media-receipts.json`, and mobile capture
provenance remains in `public/assets/gameplay/sources.json`. The small
`src/lib/hero-media-versions.json` supplies content hashes for cache-busting the
12 video/poster pairs. Slopcraft uses its refreshed custom WebP poster; the other
11 use actual-frame JPGs at unchanged pixel dimensions.

All final cuts were decoded and checked for frame count, duration, dimensions,
fast-start metadata and SHA-256. First, middle and final frames were visually
inspected for all twelve cuts. Run Infinite shows jumps and collapsing gaps;
Kart shows active racing; Zombies and Dungeon show combat; Slopcraft shows a
placed glowstone block; Umbral shows attack, victory and return to its world.
Original game geometry and mechanics stay intact. Slopcraft and Kart canvas
footage omit their separate DOM HUDs. These web edits leave the immutable
published game bundles and mobile app's bundled reel unchanged.

Flappy Duck, Stax and Surfy Sub use their exact published mobile bundles, rendered
at 1080×2340 while keeping a logical 432×936 viewport. Ordinary pointer inputs
are selected through read-only telemetry; no world or score state is written.
The complete source takes reached Flappy score 13, Stax 17 layers/score 680 and
Surfy score 279. Their final short cuts show consecutive pipe crossings, glass
stacking and lane changes/coins respectively, without game-over screens. Stax
composites its authored CSS gradient behind its transparent WebGL canvas at the
same resolution; its DOM score is omitted. Surfy's separate DOM score and
instructions are also omitted.

Flappy Duck's authored body is 40×32 logical pixels in the 432×936 recording
viewport (about 9.3% of the width and 3.4% of the height). Its small bird is native
composition, separate from the hero's phone-fill cropping.

## Composer mark motion

The composer preserves its original classic Slop outline byte-for-byte and
morphs through six resting forms using Flutter's `slopFormOutlineFor` geometry:
classic, cloud, ghost, wide, star and droplet. All share the native 128 angular
samples and midpoint quadratic construction. The face, position and stroke stay
fixed. Each 2.4-second hold schedules one timer; the 1.5-second smooth transition
updates only the SVG outline, capped at 30 fps. No React frame rerenders or
whole-icon motion is used. Offscreen, hidden and reduced-motion states cancel
pending animation; reduced motion shows the original classic mark.

Geometry checks verified the exact original resting path, full-stroke bounds and
continuous loop seams. Browser sampling confirmed settled holds, changing
outlines and fixed 32×32 position/face; an offscreen mark remained unchanged for
4.2 seconds. Lifecycle fixtures verified timer/RAF cancellation, preference
changes, resume and unmount cleanup. The 86 web tests and initial full build
passed; the release owner will run the final build after the concurrent native
renderer export completes.

## Final stationary profile and composer release

The hero composer stays white in both themes; its full placeholder fits at
320- and 390-pixel browser widths. Empty mobile composers omit the disabled send
control, restoring it when there is an idea to submit. The exact native profile
renderer now holds a neutral, undeformed pose until horizontal drag or keyboard
rotation. It holds the released angle without idle movement or inertia. Native
geometry, equipped materials and manual continuous rotation are preserved.

Compiled browser captures before interaction and after release were separately
byte-identical while idle. Drag, arrow keys, Home reset and mint glass Sunbeam
appearance were observed. Three Flutter regression tests passed. The fallback
atlas renderer also stops idle motion. The content-bound renderer version
`5cf9da7007b8855c0810` updates the iframe, bootstrap and Dart loader URLs together.
The release owner's final `npm run check` passed all 87 website tests, 27 MCP
tests and the production build after the native renderer export.

## Actual iPhone Simulator hero footage

Night Drift X, Flight Horizon and Dead Signal use recordings of the released
games inside the native app, captured with `simctl recordVideo` on iPhone 17 Pro /
iOS 26.5. The installed app was build 2050 from source
`66313b2d4b17bc1ad80e1f458dffb7d964cbe26c`. The three published games belong to
`@slop.game`; exact immutable bundle URLs and source hashes are recorded alongside
the media in `public/assets/gameplay/sources.json`. Sky supplied ordinary touch
actions. No browser recreation, gameplay changes or score/state injection was
used, and the guest runs were not submitted to leaderboards.

| Game | Cropped native pixels | Duration | MP4 bytes | JPG bytes |
| --- | --- | --- | --- | --- |
| Flight Horizon | 1206×2188 | 5.000 s | 2,030,998 | 118,377 |
| Dead Signal | 1206×2188 | 6.000 s | 1,750,062 | 100,437 |
| Night Drift X | 1206×1974 | 5.000 s | 3,745,318 | 168,784 |

All raw recordings are 1206×2622. Final Flight selects take1's island bank and
ring passage at approximately 5.5–10.5 seconds. Its take2, which left the game
for Shop, is entirely excluded. Dead Signal selects close combat, aiming and
repeated shots at approximately 192.5–198.5 seconds of clean2. Its selected cut
stays in Wave 1; the later Wave 2 transition belongs to the preserved complete
take. Night Drift X selects a continuous drift beside traffic at approximately
41–46 seconds of clean final4. These source ranges map the final short cuts back
to their original recordings; complete earlier montage receipts remain nested
as `source_full_clip` in public provenance.

The crop removes phone status, Dynamic Island and native close/speaker controls.
Night Drift X also ends above its guest sign-in banner. Each crop preserves the
full plane or car and original game graphics/HUD. Exports are H.264 at 30 fps
with fast-start metadata, using captured frames without upscaling, interpolation
or a speed change. Game-over screens, non-game navigation and idle footage are
excluded. Detailed original capture receipts and reviewed frames remain under
`/tmp/slop-simulator-hero/exports`; final short-cut receipts and decoded review
frames are under `/tmp/slop-hero-shortcuts-20260916`. Final hero framing is
verified separately by the release owner.

## Compact Shop and current coin — 16 September follow-up

- The oversized Shop introduction is replaced by one compact title/balance row. Sunbeam and Daily drop sit beside each other on phones, followed directly by filters and the native cosmetic artwork.
- The balance opens an accessible dialog with the same `my_coins` snapshot and replay-safe `claim_daily_coins` service used by mobile. Claims require an explicit tap. Absolute receipt balances are validated; conflicting/invalid receipts are rejected, and pending reads cannot overwrite the dialog's newer claim receipt. Account changes unmount owner-specific shop state.
- The coin is exported directly from the unchanged mobile `SlopCoinPainter` at 384px and losslessly encoded to a28,530-byte WebP. It is used in the balance, claim control and cosmetic prices. `public/assets/mobile/slop-coin-current.source.json` records source/output SHA256; `tools/native-character/test/export_coin.dart` reproduces the source PNG.
- Stripe payments remain coming soon. No Shop purchase or paid generation was made during these checks.
- Two coin-contract tests cover duplicate claims using an absolute balance and malformed/contradictory response rejection. A temporary account's real daily reward was claimed once, read back at200coins, and replayed without another credit.
- Browser QA passed at390×844 and320×720 in both light/dark themes: equal18px page gutters, no horizontal overflow, first two look cards fully visible by580px/561px. Clicking the current coin opened a200-coin balance dialog with the server's already-claimed state; the320px dialog was292px wide. Evidence: `/tmp/slop-final-shop-qa`.

## Final calm-profile and control corrections

- The exact user-reported bouncing You page was signed out and still loaded the old ghost idle video. It now uses the exact stationary native eye portrait, with no whole-body video and no extra Flutter engine.
- Social discovery now includes the equipped banner before opening a profile.75samples across the first1.5seconds of opening the verified Neon Arcade profile contained only its equipped image; no desert fallback was shown. Native portrait animation pauses beneath an opened game.
- Slopcraft's control update is published at a new immutable root under its existing official game ID. All10public files were read back and hashed; the canonical SDK is unchanged. See `slopcraft-controls-release-receipt.json`.
- The320px Night Drift composition now places the car fully above the title and Play controls; its video ends at449px and the feature starts at452.5px. No media bytes were recropped or regenerated for this layout correction.
- The ten-point shipping review, fixed findings and remaining limitations are recorded in `release/ship-readiness-2026-09-16.md`.
