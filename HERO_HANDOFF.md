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
