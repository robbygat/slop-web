# Hero + Social redesign — handoff for Codex

Branch: `claude/hero-redesign` (worktree `~/Documents/slop-web-hero`, based on `origin/main` @ 7e2c97c). Not pushed yet.

## 1. Home hero — 132-game wall
- `src/components/Hero.jsx` + new `src/components/hero-v2.css`.
- Background is a **single tiled clip of 132 real game recordings**:
  `public/assets/brand/game-wall.mp4` (2244×1158, 3.5s loop, 2.7 MB) + `game-wall-poster.jpg`.
  Built with ffmpeg `xstack` from the marketing tiles in
  `~/Documents/slop-mobile/output/slop-update-film/media/recent-wall/tiles/000–131.mp4` (22 cols × 6 rows, 96×187 tiles).
- Two copies of the clip are stacked in a 3D-tilted plane and scrolled endlessly with CSS (`game-wall-scroll`, 60s).
  Plays only while on screen; paused for reduced motion / when `suspended`.
- Left-aligned headline "Just one / more **game.**", copy, Let's play + Explore games.
- The crowned Slop (`HeroPerch`) still sits on the hero's bottom edge.
- No longer used by Hero: `HeroScene`/`LiteHeroScene` (moved to Social), `hero-arcade-world*.webp`.

## 2. Social — cast on top, newest phone-shaped games
- `src/pages/Social.jsx` + new `src/pages/social-v2.css`.
- New dark cover `.social-stage`: "Better with a rival." on the left, the **moving 3D robot cast** on the right
  (`SocialCast` → `HeroScene`, falls back to `LiteHeroScene` for reduced motion / slow connections).
  Reuses the `.hero-stage` orbit rules from `home-hero.css` (imported by Social).
- Crown board now loads `loadDiscoveryPage({order:'new', platform:'mobile', limit:16})` instead of popular
  (popular surfaced the oldest games), shows up to 10.
- Rival cards are now **9:16 phone cards**: full-bleed preview, name/holder/score/CTA overlaid at the bottom.
  Auto-fill grid on desktop, horizontal snap scroller on mobile.

## Verified
Desktop 1440 + 375px mobile in the browser for both pages. `npm test`: 314 pass / 0 fail. `npm run build` OK.

## Follow-ups for Codex
1. Crowned-first ordering still applies inside the 16 newest; decide if pure newest is preferred.
2. Consider regenerating `game-wall.mp4` as the catalog changes (script idea: same xstack, newest 132 previews from `game_preview_videos`). Optionally add a WebM/AV1 version.
3. Old `.social-club-cover` rules in `social-club.css` and old `.home-hero`/`.hero-intro` rules in `home-hero.css` are now dead — clean up.
4. `.brand-home .featured-heading{padding-right}` still reserves room for the perch — keep (perch is still there).
5. Check light theme, 700–1100px widths, and the 3D scene's GPU cost on low-end Android in Social; then open the PR to `main`.

## Round 3 (user feedback)
- No small "eyebrow" text above headlines anywhere (removed from Home hero, Social cover, crown board). User wants minimal, non-redundant copy — keep it that way.
- Home hero no longer says "Hundreds of games · play instantly" or "There's always a score to beat".
- Social headline is now "Stay connected with friends."
- Create (`Connect.jsx`) header: replaced the coin-op robot + overlapping Slop badge with the single `core` robot.

## Round 4 — wall quality, performance, lifting phones
- Wall is now ONE video with the scrolling baked in (each of 22 columns scrolls, alternating up/down, seamless 14s loop).
  No CSS scroll animation and no second decoder → much smoother.
  - `game-wall-hd.mp4` 2948×1536 (~15 MB) for ≥1000px screens on fast connections; `game-wall.mp4` 1600w (~7.5 MB) otherwise. Poster: `game-wall-poster.jpg`.
  - Tiles rendered at 128×250 (near native 164×320) with lanczos — much sharper.
  - Rebuild: ffmpeg xstack/vstack+crop per column from `slop-mobile/output/slop-update-film/media/recent-wall/tiles`.
- Lifting games (revised per user): NO phone frame and NOT shown front-on. Every ~6s one game tile lifts a little off the
  tilted wall at the wall's own angle (translateZ inside `.game-wall-plane`), rides upward with its column (even columns
  scroll up), glows lime, plays its clip, then settles back. Clips in `public/assets/brand/lift/*.mp4|.jpg` (480w):
  Kickflip Coast, Run Infinite, Aqua Slide, Cube Surfer, Stumble Run, Draw Climber. Positions: `SPOTS` in Hero.jsx
  (column index + start row %, separate sets for wide/narrow) — measured so they stay on-screen beside the copy.
  Off for reduced motion; pauses offscreen/hidden tab.
- Follow-ups: consider moving the big MP4s to a CDN/Supabase storage instead of git; add AV1/WebM variants; make lifted phones clickable to open that game (need slugs).

## Round 5 — lift comes out of a real slot
- `slotAt()` in Hero.jsx reads the wall video's `currentTime` and the baked column math (22 cols, 134×256 cells,
  1536px wall, 14s loop, column offset `(c*137)%H`, even columns move up) to find the exact tile on screen.
  The lift is placed on that tile and rides upward at the column's speed (`--rise`), so it never drifts off its slot.
- While lifted, the slot shows a dark opening with a lime glowing rim; a ripple pulses on lift-off and on landing,
  a light sheen crosses the game as it rises, and it drops back into the same opening and cross-fades into the wall.
- **If game-wall*.mp4 is ever re-rendered with different geometry, update `WALL` and the offset formula in Hero.jsx.**
- Wall source and lift spots update when the viewport crosses 900px / 1000px.

## Round 6 — glitch fixes
- Wall re-rendered: every source tile is now a seamless 3.0s crossfaded loop and each tile starts at a random phase,
  so the wall no longer "blinks" every 3.5s when all 132 clips restarted together. Loop is 15s (WALL.loop=15).
  Loop-point similarity now equals normal frame-to-frame (verified with SSIM).
- Lift ride is frame-locked: `requestVideoFrameCallback` (rAF fallback) positions the lifted game from the wall's
  media time, so stalls, throttling and the loop seam can't pull it off its slot. Verified the slot math against real
  decoded frames (gap rows land where the code expects).
- Lifts only use whole tiles that stay fully on the wall for the entire ride (fixed half-cut slots on phones).
- Lift clips pre-cropped to the exact slot shape (512×1000 = 128:250) → no black margins; each clip is buffered
  (`canplaythrough`) before a lift starts, with its poster as the tile background.
- iOS Safari hardening on the 3D video layers. Mobile: wall sits lower, lift height 70px so it never hides behind the header.
- Removed the redundant "Explore games" button — only "Let's play" remains.

## Round 7 — waving crowned Slop
- Generated in Higgsfield (Kling 3.0 pro, 5s, start frame = end frame = the existing `ledge-slop.webp` pose on magenta,
  so it loops seamlessly): the robot turns its head, waves, swings its legs, and returns to the pose.
- Keyed to transparency with ffmpeg (magenta key, so the lime S on its screen is untouched), 420×630:
  `public/assets/robots/ledge-slop-wave.webm` (VP9 alpha, 280 KB — Chrome/Android/Firefox) and
  `ledge-slop-wave.mov` (HEVC alpha, 750 KB — Safari/iOS). `HeroPerch.jsx` picks one via `canPlayType`
  (don't use <source> fallbacks: React reports the skipped source as an error). Still image stays as poster,
  reduced-motion and no-alpha fallback. Plays only while visible.


## Codex release fixes — October 1
- Lifts now copy the actual decoded wall frame into a small canvas, with crop and position driven by the same media time. The game stays identical before lift, during motion, and after landing; the independent lift clips are no longer decoded by Hero.
- The six selected previews are normalized to full bleed and baked into lift columns 2 and 4: Kickflip Coast, Run Infinite, Aqua Slide, Cube Surfer, Stumble Run, and Draw Climber. Hole Rush is excluded from the hero. Crop and placement reproduce the native 24fps/even-pixel wall geometry, including the first decoded frame and loop seam. Canvas rendering accounts for screen density up to 2×; fast phones receive the full-resolution wall.
- Wall and Social cast follow live reduced-motion changes. Offscreen/covered playback remains paused, and resizing/source changes restart lift scheduling safely.
- The perch chooses HEVC alpha for Apple WebKit and VP9 alpha elsewhere; Social crown-card controls use 44px touch targets.
- The hero uses its own `hero-game-wall` CSS class, keeping the Home catalogue grid in normal flow. Copy says “your Slop.” Shared Quests icons match the mobile app’s crossed-swords painter.
- Play titles rotate through four short entrances on each actual game change, settling at a stable readable pose. Reduced-motion preferences disable the entrances; game identity and input handlers are unchanged.

### Hero motion follow-up
The first combined release is live on main `12e5a19702dc45628d21c4dc3d259247e9054b60` (PR52, successful Pages run36815520833). The user still observed lift stutter. Code inspection found that the raised card itself advanced in the baked video's24fps/even-pixel steps while its depth animation ran at display rate. Keep the canvas crop frame-exact, separate raised travel from that crop, and keep exact alignment at launch and landing. Large animated shadow and background-position effects have also been replaced with static shadow and transformed sheen layers.
