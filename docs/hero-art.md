# Home direction and art provenance

The user explicitly rejected the mascot with two phones. That composition has been removed from the homepage, together with its device-frame CSS. Do not reintroduce it as a variation.

The current homepage is one frameless game stage. Desktop cycles through the original June **Run Infinite**, **SlopKart**, and **Sloppy Zombies**; phones feature the actual portrait **Night Drift**. The preview uses recorded gameplay and the Play action opens the real sandboxed game in the same stage. Gameplay keeps its original proportions. Desktop preview footage fills the stage with a centered crop to remove pillarboxing; actual gameplay keeps the complete authored view. No generated games, device renders, or approximated Slop characters are in the hero.

The stage uses Gabarito from the Flutter app. Motion comes from gameplay; one short CSS entrance animates the heading. Reduced Motion starts with the video paused, an accessible pause control remains available, and leaving the viewport pauses both video and the active game. Only one clip plays at once. The next clip starts buffering during the final four seconds, and the previous frame stays visible until the next recording can render. Small selectors let visitors choose a game; the title and Play button follow the visible recording. The interactive player is loaded only after Play.

- Run Infinite: `public/assets/games/run-infinite-desktop.mp4` and `.jpg`; recovered June game source provenance is documented with the desktop restoration tool. Actual 1600×1200 rendering at 30 FPS, 16.5 seconds. Authored Hard/Skater settings with real steering, repeated jumps and visible collapsing gaps. The take reached 603m; the selected segment remains alive throughout. No footage was upscaled.
- SlopKart: `public/assets/games/slopkart-desktop.mp4` and `.jpg`; actual 1920×1200 rendering at 30 FPS, 16.467 seconds of a race with native throttle, steering and item controls.
- Sloppy Zombies: `public/assets/games/sloppy-zombies-desktop.mp4` and `.jpg`; real gameplay capture, final dimensions and encoding recorded in the release audit.
- Night Drift: `public/assets/gameplay/night-drift.mp4` and `.jpg`; actual mobile game capture, origin recorded in `public/assets/gameplay/sources.json`.
- Build/loading: `public/assets/mobile/motion/slop-morph-showcase.webm`, exported from the exact native SlopMorphShowcase/SlopShowcasePainter at 60 FPS. The native motion README records the export and alpha/seam checks.

## Supporting scene

`public/assets/illustrations/desert-horizon.webp` was generated with built-in Image Gen on September 16, 2026 and encoded as WebP. Source image: `/Users/rob/.codex/generated_images/01a0a952-5202-7af0-a2b3-e28a8f3d0427/exec-7b68fd12-2929-41d9-b5f9-d467776fb74f.png`.

Direction: a minimal clay desert at dusk, muted lavender salt flats, two broad softly sculpted dunes, a small peach sun near the left horizon, one low boulder at right, and ample quiet foreground. Preserve the native desktop-daydream palette and handmade material. No castle, characters, phones, laptop, floating coin, text, or UI. This is a supporting scene, not the homepage hero composition.

The accepted Social page keeps its native portraits and existing dusk art. Equippable character/background art remains sourced from the mobile app.
