# Codex: hero wall — how it works and what NOT to change

PR: robbygat/slop-web#54 (branch `claude/hero-wall-fix`). Please review, merge, and deploy it as-is.

## Architecture (each piece fixes a real bug; keep it)
1. **The wall video has no motion.** `public/assets/brand/game-wall*.mp4` is the 21×6 grid standing still: a 3s loop.
   Each tile is cut at its own most natural 3s loop point (`best_loop_start`) with only a 3-frame blend.
   Every game appears exactly once (126 games). Don't re-bake scrolling into the video. 24fps baked scrolling is
   what caused the judder, and it made files about 3× bigger.
2. **Scrolling runs on the GPU.** `src/components/HeroWallGL.js` is a WebGL shader. It samples the one video texture
   and scrolls each column (even columns up, odd columns down, offset `col*137`, one wall height per 15s) at display
   refresh rate (120fps measured). It only uploads the texture when a new video frame arrives.
3. **One clock drives everything.** In `Hero.jsx` (`GameWall`), a single rAF loop advances the wall clock, draws the
   shader, moves the lifted game, and fires the landing shockwave in the same frame. Don't move the lift onto
   CSS/WAAPI timing or the video's media clock: they drift apart.
4. **No visible `<video>` elements.** A visibly playing `<video>` makes Chrome cap the page at 30fps (measured).
   Both videos (`.game-wall-source`) are hidden frame sources. The lifted clip is painted into a 512×1000 `<canvas>`
   on each new frame. Never copy from the big wall video into a canvas (that's main-thread readback; it stutters).
5. **Lifts.** Only the 6 featured games lift: Kickflip Coast, Run Infinite, Aqua Slide, Cube Surfer, Join Clash 3D
   and Draw Climber. They're in columns 2, 4 and 6, which on both desktop and phones are the left, center and right of
   the wall. Their rows are chosen so they reach the lift line evenly. One lift at a time, about every 5–6s, rotating
   left → center → right (`pickLift`).
   - **Lifted copies never loop.** Each one is a continuous take that starts on the tile's exact frame and plays
     through the landing. A looped copy of a game with a score or a growing stack snaps back mid-lift, which was the
     Cube Surfer glitch.
   - **Runway is planned, not hoped for.** The scroll clock is softly locked to the video clock, and the build sets
     each featured tile's loop phase so it always reaches the lift line early in its take. Every featured game is
     always eligible to lift.
   - **Seek-gated.** The take is seeked to the wall's frame (`liftClipTime`) and held until the wall catches up
     (measured within 2–7ms). If the seek can't land in time, that lift is skipped, so it never shows frame 0 or black.
6. **Landing.** The game slams down at 86% of the lift (CSS keyframes in `hero-v2.css`) and the shader sends a
   shockwave that physically bends the surrounding games. Lift tiles are square, matching the wall (no border-radius).
7. **Codec selection.** Each video has `-av1.mp4`, `-hevc.mp4` and `.mp4` (H.264) cuts. `pickSource` uses
   `navigator.mediaCapabilities` to choose the smallest codec the device decodes smoothly and power-efficiently.
   Phones and slow connections get the 1600px wall (~3 MB). Desktop gets 2814px (~6–8 MB).
8. **Fallbacks.** No WebGL → static poster. Reduced motion → nothing animates. Offscreen or hidden tab → paused, zero cost.

## Rebuilding assets
```
python3 tools/build-hero-wall.py --clips <slop-mobile>/output/slop-update-film/media/recent-wall \
  --selected <slop-mobile>/output/slop-update-film/source/recent-wall-selected.json \
  --out public/assets/brand --extra 'Surfy Sub=public/assets/gameplay/surfy-sub.mp4'
```
It writes the videos, posters, lift clips and `src/lib/hero-wall-layout.json` (grid, featured cells, phases). To remove
a game, add it to `EXCLUDE`. The game count must stay a multiple of 6. Landscape captures don't work as tiles.
To change the featured games, edit `FEATURED` (same length) and rebuild. Phases and runway are recomputed automatically.

## Tests / verification
- `npm test` (`test/hero-wall.test.mjs`): each game once, excluded games absent, featured placement, the lift
  stays whole for its ride, lifts rotate sides and games, phase lock.
- Verified in Chrome at 1254px and 375px: 120fps with zero frames over 20ms, including during lifts.
- **Still needs a real iPhone (Safari) and a mid-range Android check.** If WebGL or HEVC/AV1 misbehaves there,
  fix it in `pickSource`/`HeroWallGL.js` without going back to baked scrolling or visible `<video>`.
