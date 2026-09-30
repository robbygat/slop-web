# Mobile Home, profiles, and game player rebuild

This refinement replaces the layouts documented in the earlier experience
refinement where they conflict, particularly full bodies on profiles.

## Behavior

- Home separates its headline and character stage. Tablet widths stack the
  composition; phones put the character scene between the headline and the
  Play/download controls. App Store and Android APK links remain directly in
  the hero. Navigation occupies normal header flow, and Play measures the real
  header height instead of guessing an offset for a floating bottom dock.
- Phones, coarse pointers, data-saving connections, and slower connections use
  an interactive portrait orbit without starting either hero WebGL renderer.
  It retains the app's face painter, swappable heads, expressive faces, and
  connected composition. Desktop retains the live 3D orbit.
- The headless body sits at the bottom right of the hero, with fixed joint
  lengths, bent knees, and hands resting toward its thighs. It is a separately
  exported GLB derived from the existing Core rig. The 640 px WebP is the
  immediate fallback and mobile presentation; desktop may load the live mesh.
  The original standing model is unchanged. The rendered seated asset was
  inspected separately from the website.
- Own and public profiles use a character identity card beside the game
  collection. Profiles show heads only. Equipped worlds, customization,
  sharing, account changes, follows, and game shelves retain their existing
  data authority. Portraits share a bounded decode queue and compose the shell
  and face into one canvas frame, avoiding separately loaded face layers.
- Home initially requests 24 games on compact screens or 48 on larger screens.
  Further pages arrive near the end of the grid, without a fixed catalog cap.
  Existing tile order is retained when another page arrives; Kickflip Coast is
  explicitly fetched and featured near the beginning without duplication.
  Phone preview concurrency is two rather than four.
- The relay's protected document-loaded event now releases the game loading
  state even if a legacy title does not emit SDK ready. A game cannot forge this
  relay control string. Opaque sandboxes, source checks, CSP, restart authority,
  and score submission guards remain intact.
- Game launch uses its existing poster while game assets load, a small
  nonblocking progress status, and local retry UI on errors. Comments and likes
  are fetched when their panel opens; a duplicate autoplay preview no longer
  competes with the actual game download. The pre-play restart action lives in
  the controls, not over the game.
- The player fits the actual stage container, including fullscreen and an open
  comments panel. Previous/next game controls work from Home and Play. A narrow
  desktop browser with mouse/keyboard is no longer treated as a phone merely
  because its window is below 700 px.
- Play has a separate compact filter bar, a bounded preview area, native scroll
  snapping, and a small crown-holder portrait (64 px desktop, 44 px compact).
  It no longer starts a large character renderer for each champion. The Home
  tab uses a simple house glyph.
- Retired floating navigation, profile body layouts, large loading overlays,
  duplicate feed theme controls, and conflicting hero CSS were removed. No new
  package dependencies or backend migrations.

## Verification

- `npm run check`: 247 web tests passed, 6 skipped; 60 MCP tests passed,
  2 skipped. Production build succeeded with 388 generated public game routes.
- Added checks for portrait request sharing/retry/asset coverage, hero bounds,
  seated mesh joints, mobile rendering policy, stable catalog append behavior,
  shrinking the decoder budget, and legacy document readiness with an
  unforgeable relay signal.
- All 33 application CSS files parsed; `git diff --check` passed.
- The production initial static JavaScript dependency graph contains no WebGL
  renderer, hero scene, seated mesh loader, or environment-map chunk. This is
  a bundle inspection, not a measured real-device speed claim.
- Browser automation still rejected local visual inspection through its saved
  site permission. No browser workaround was used. Rendered mobile/desktop
  layouts, real gameplay input, fullscreen, and authenticated profile behavior
  remain unverified by browser in this pass. Unit checks and a successful build
  do not establish those interactive results.
- The lazy Three.js shared chunk still triggers Vite's existing 500 kB warning;
  it is not in the initial static dependency graph.

Publication is verified separately by the Pages workflow for the exact merged
commit. This note does not equate a local build with live deployment.
