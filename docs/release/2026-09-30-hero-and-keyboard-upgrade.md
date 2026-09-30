# Website hero and keyboard follow-up

This follows the account, Activity, Social, Create, Quests, and immersive Play
upgrade in draft PR #47. Work stays in the isolated `slop-brand-world` checkout
on `codex/hero-ledge-previews`.

## Visible changes

- Home has a new generated floating arcade background, pale green light mode,
  deep teal dark mode, simpler copy/entry controls, and a framed character scene.
  The extra orbit backdrop and gray scenery are removed. The lines connecting
  characters remain. No hero pause control or visible tap-to-swap instruction.
- Normal phones use the same seven genuine 3D shells as desktop. A static poster
  paints before deferred renderer loading. Constrained connections retain the
  lightweight fallback; reduced motion stops animation.
- The website scene skips allocation of the hidden sky, mountains, platform,
  pedestal geometry, petals, and orbit path. Phone animation is capped at 24 FPS,
  <=1.25 DPR, and smaller face textures/particle counts. Hidden, offscreen, or
  covered scenes stop. These are implementation budgets, not measured physical
  phone frame rates or performance scores.
- The seated mascot keeps a stable body while its masked head and attached crown
  move subtly. It uses one decoded image, CSS, and no second WebGL context.
- Desktop navigation becomes a simple text row. Phones get a 64px top header and
  bottom navigation. Sign-in, appearance, and Activity remain easy to reach.
  Immersive Play keeps its own back/control UI without the site chrome.
- The footer becomes a compact brand/download/link row with working theme
  controls. Crown art appears as a compact invitation after Featured; character
  art appears after the catalog. The two promotions are no longer adjacent.

## Keyboard behavior

The host had captured only arrows/Space globally, dropped WASD/Shift, and sent
synthetic input only to the window. It also stole focus on hover and failed to
release native held keys on overlays. The revised bridge preserves physical
`code`, actual `key`, modifiers, and legacy key codes; scopes first-key handling
to the current player; explicitly hands focus through the outer relay into the
inner game playfield; and delivers one bubbling event through the game target,
document, and window. Native game controls then stay native.

The bootstrap releases held controls on pause, restart, blur, hidden pages, and
editable/menu focus. Site text inputs and keyboard activation of controls remain
usable. The explicit nested-frame focus handoff also catches genuine releases
that arrive during the intermediate relay task. No new arbitrary WASD-to-pointer
mapping is introduced; exact audited legacy compatibility remains separate.

## Validation

- `npm run check` passes: 289 web tests, 60 MCP tests, eight existing environment
  skips, production build, and 388 generated HTTP-200 game routes. Log:
  `/private/tmp/slop-web-hero-check.log`.
- Production browser at a 390px phone viewport: seven controls and real ready
  3D canvas, no Lite scene or extra orbit backdrop, loaded phone-specific art,
  no horizontal overflow, 64px header, and active head-only animation. Light
  and dark modes have readable copy, controls, and Featured heading.
- Real Chrome keyboard fixture through the actual opaque relay: first host W
  reaches canvas/document/window once, keyup once, and leaves no held key.
  Subsequent native A, D, four arrows, and Space work without clicking the canvas
  again: all three listener counts 8, keyup 8, native 7, bridged 1, and zero site
  navigation events. Pause-after-W releases controls; site input accepts WASD
  without changing game counters. Fixture: `tools/keyboard-input-fixture.html`.
- Chrome 320px and 1280px light/dark checks: real 3D ready, seven cast members,
  Neko and Blocky swaps, loaded art, readable sign-in, and no horizontal overflow.
  Narrow phone header 64px / hero 576px; desktop header 72px / hero 611px.
- Signed-out public Slopcraft in the stable production build opens and starts.
  WASD and Space are exercised; Escape opens its authored pause/start overlay
  while keeping the Slopcraft dialog open; Back to Home returns correctly.
  Opening the game also pauses the background mascot.
- Signed-out public Run Infinite Desktop accepts Start Round, arrows and Space,
  shows a guest result at 152, restarts with iframe generation 1, and completes
  another guest run at 210. Both results retain the sign-in-to-save gate; Back
  to Home works. Public-game checks verify visible play, result, restart, pause,
  and exit states; per-key displacement is not measured. The fixture above is
  the exact delivery/counter proof.
- Screenshots: `/private/tmp/slop-hero-production-mobile.png`,
  `/private/tmp/slop-hero-production-mobile-dark.png`,
  `/private/tmp/slop-keyboard-fixture-final.png`.

Generated artwork and the exact final prompt are recorded in
[hero-world-artwork](2026-09-30-hero-world-artwork.md). Phone art is approximately
19 KB; desktop art approximately 44 KB.

This is a tested local build and draft review branch. Physical-phone performance,
authenticated account/inbox/reward flows, merge, and live deployment are separate
acceptance gates.
