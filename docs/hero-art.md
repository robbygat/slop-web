# Home direction and art provenance

The user explicitly rejected the mascot with two phones. That composition has been removed from the homepage, together with its device-frame CSS. Do not reintroduce it as a variation.

The current homepage is one frameless game stage. Desktop cycles through the original June **Run Infinite**, **SlopKart**, **Sloppy Zombies**, **Dungeon Panic**, **Slopcraft**, and **Umbral Red**; phones rotate **Flight Horizon**, **Night Drift X**, **Dead Signal**, **Surfy Sub**, **Flappy Duck**, and **Stax** recordings. The preview uses recorded gameplay and the Play action opens the real sandboxed game in the same stage. Gameplay keeps its original proportions. Preview footage fills the stage with a centered crop to remove pillarboxing; actual gameplay keeps the complete authored view. No generated games, device renders, or approximated Slop characters are in the hero.

The mobile heading uses one compact line to expose more gameplay. A centered rounded prompt bar overlays the lower stage. It uses the exact native U-nav outline as a lightweight SVG and hands a typed or browser-dictated idea to Build without automatically starting generation. The idea stays in bounded tab storage through sign-in; it is never placed in the URL. Its full “Make your own game” prompt remains visible at the 320px layout. The stage uses Gabarito from the Flutter app. Motion comes from gameplay; one short CSS entrance animates the heading. Reduced Motion starts with the video paused, an accessible pause control remains available, and leaving the viewport pauses both video and the active game. Mobile plays one continuous fast-start H.264 reel, eliminating the six cross-file autoplay handoffs that stalled in iOS browsers. Small selectors seek to exact segment boundaries; the title and Play button follow the current segment. Desktop retains its two-slot preview loader. The interactive player is loaded only after Play.

- Run Infinite: `public/assets/games/run-infinite-desktop.mp4` and `.jpg`; recovered June game source provenance is documented with the desktop restoration tool. Actual 1600×1200 rendering at 30 FPS, 5 seconds. Authored Hard/Skater settings with real steering, repeated jumps and visible collapsing gaps. The take reached 603m; the selected segment remains alive throughout. No footage was upscaled.
- SlopKart: `public/assets/games/slopkart-desktop.mp4` and `.jpg`; actual 1920×1200 rendering at 30 FPS, 5 seconds of a race with native throttle, steering and item controls.
- Sloppy Zombies: `public/assets/games/sloppy-zombies-desktop.mp4` and `.jpg`; real gameplay capture, final dimensions and encoding recorded in the release audit.
- Dungeon Panic: `public/assets/games/dungeon-panic-desktop.mp4`; 1600×1200, 30 FPS, 5 seconds of actual room-clearing gameplay.
- Slopcraft: `public/assets/games/slopcraft-desktop.mp4`; 1920×1080, 30 FPS, 5 seconds of movement, mining and block placement; exact native mechanics and real mouse input.
- Umbral Red: `public/assets/games/umbral-red-desktop.mp4`; 1600×1200, 30 FPS, 5 seconds of exploration, a wild battle and return to the world.
- Flappy Duck and Stax: `public/assets/gameplay/flappy-duck.mp4` and `stax.mp4`; actual 1080×2340 rendering at 30 FPS, 5 seconds each. Real taps; no game-over overlays. Source hashes and capture-only resolution adjustments are recorded in `sources.json`.
- Surfy Sub: `public/assets/gameplay/surfy-sub.mp4`; real 1080×2340 lane-running gameplay, 30 FPS, 5 seconds, ordinary lane swipes and obstacle avoidance.
- Flight Horizon: `public/assets/gameplay/flight-horizon.mp4` and `.jpg`; 5 seconds of actual iPhone 17 Pro / iOS 26.5 Simulator flying through rings and banking over islands, cropped at native 1206×2188.
- Night Drift X replaces the old 360×640 Night Drift preview. The recording comes from the iPhone Simulator's native 1206×2622 framebuffer; the 5-second high-speed traffic cut is cropped to remove the app controls and guest sign-in banner.
- Dead Signal: actual iPhone Simulator combat footage, with aiming, enemy defeats and advancement to wave two. The 6-second cut is cropped at native 1206×2188.

These three new clips use the released mobile app and unchanged published game
bundles credited to `@slop.game`. Only ordinary touch controls were used. Raw
Simulator H.264 recordings are trimmed and cropped, then encoded at 30 fps with
fast-start metadata. No upscaling, frame interpolation or game-state changes are
used. Capture sources, exact segments, crop bounds and output hashes are in
`public/assets/gameplay/sources.json`. Menus, game-over screens and sign-in UI
are excluded from the selected footage.
- Build/loading: `public/assets/mobile/motion/slop-morph-showcase.webm`, exported from the exact native SlopMorphShowcase/SlopShowcasePainter at 60 FPS. The native motion README records the export and alpha/seam checks.

## Supporting scene

`public/assets/illustrations/desert-horizon.webp` was generated with built-in Image Gen on September 16, 2026 and encoded as WebP. Source image: `/Users/rob/.codex/generated_images/01a0a952-5202-7af0-a2b3-e28a8f3d0427/exec-7b68fd12-2929-41d9-b5f9-d467776fb74f.png`.

Direction: a minimal clay desert at dusk, muted lavender salt flats, two broad softly sculpted dunes, a small peach sun near the left horizon, one low boulder at right, and ample quiet foreground. Preserve the native desktop-daydream palette and handmade material. No castle, characters, phones, laptop, floating coin, text, or UI. This is a supporting scene, not the homepage hero composition.

The accepted Social page keeps its native portraits and existing dusk art. Equippable character/background art remains sourced from the mobile app.

Every current hero clip is 5 seconds at its original export dimensions, except Dead Signal at 6 seconds. The twelve videos total 23,005,028 bytes. `src/lib/hero-media-versions.json` versions each video and poster by its content hash so existing browsers load the short cuts.

`public/assets/gameplay/mobile-hero-reel.mp4` is a 5,089,643-byte, 720×1360,
30fps fast-start delivery copy of the six unchanged mobile cuts. It is not new
gameplay. The source order, exact boundaries, input hashes and output hash are
recorded in `mobile-hero-reel.source.json`. Only that single file is requested
by the mobile hero, so individual source clips remain available for provenance
without causing network handoffs during playback.
