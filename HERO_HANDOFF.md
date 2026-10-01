# Hero redesign — handoff for Codex

Branch: `claude/hero-redesign` (worktree at `~/Documents/slop-web-hero`, based on `origin/main` @ 7e2c97c)

## What changed
- `src/components/Hero.jsx` — rewritten. Centered, type-led hero: eyebrow pill, giant headline
  "Just one / more **game.**" (lime), one line of copy, two CTAs (Let's play → `#/feed`,
  Explore games → scrolls to `#discover`).
- The crowned Slop (`HeroPerch`, unchanged) now **sits on top of the word "game."** with its legs
  over the letters, and drops in on load. It's inside the `h1` line so it tracks the type at every size.
- `src/components/hero-v2.css` — new styles (`.slop-hero*`). Dark ink stage (#0d1411) in both themes,
  masked dot grid, soft lime glow, staggered entrance. Mobile (≤600px) stacks full-width CTAs.
  Reduced motion disables all animation.
- Removed from the hero: the world-card image, the 3D/lite robot orbit (`HeroScene`, `LiteHeroScene`).
  Those files and `home-hero.css` are **left in place, just unused by Hero** — `home-hero.css` is
  still imported because it holds the `.lite-*` and `.brand-home .featured-heading` rules.

## Verified
- Desktop + 375px mobile in the browser; `npm test` (314 pass, 0 fail); `npm run build` OK.

## Follow-ups for Codex
1. Decide whether to delete `HeroScene.jsx`, `LiteHeroScene.jsx`, `robots/hero-scene.ts`,
   `lib/hero-composition.js`, `hero-arcade-world*.webp` and the dead `.home-hero`/`.hero-*` rules
   in `home-hero.css` (check nothing else imports them first).
2. `.brand-home .featured-heading{padding-right:…}` reserved space for the old perch that hung
   below the hero — it can be removed now.
3. Tune perch position (`.slop-hero .hero-perch` `right`/`top`/`translateY(-63%)`) if the font changes.
4. Check dark/light theme toggle and 700–1100px widths; open a PR to `main`.
