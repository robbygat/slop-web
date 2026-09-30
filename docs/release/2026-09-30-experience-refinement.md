# Slop experience refinement — September 30, 2026

This pass continues the campaign rebrand without changing account, purchase,
publication, quest reward, or game-sandbox authority.

## What changed

- Explore is now Home; the central Play navigation item uses the company Slop
  mark. Light, dark, and device appearance are available in the header, with a
  compact control on the mobile feed. The favicon uses the same brand artwork.
- Home removes the pale overlay and scene fog that obscured the hero cast, and
  recalculates character space when the copy resizes. App Store and Android
  download links remain in the hero. The moving footer mark remains intact.
- Featured previews retain their actual portrait or landscape format, with
  explicit platform labels. Current video dimensions take precedence over old
  preview metadata; Kickflip Coast remains a mobile portrait card. The game
  mosaic keeps the three-column desktop spans, separated tiles, hover titles,
  and existing pointer ripple.
- Opening a game has a local loading boundary and recorded-video fallback,
  preserving the page beneath the theater. Feed previews no longer have the
  large central Play overlay. The actual first-place player appears with their
  equipped shell and attached crown. Failed crown reads never claim an empty
  leaderboard.
- Social has a player-card layout, Discover/Following views, direct public
  profile links, and shareable 1080 by 1920 story cards with equipped artwork and
  a real profile QR code. Users can save PNGs, use compatible device sharing,
  copy a link, or open an X share composer. Instagram remains an explicit user
  action through the share menu or a saved image and link sticker.
- Profiles default to the full articulated robot unless the player previously
  chose the head view. Public profiles also show the body. Say hi and Spin are
  separate controls; idle waves and authored joint resets prevent accumulated
  twisting during repeated still frames. Mobile identity content sits below
  the character instead of overlapping it.
- Shop uses a collection grid and an inline fitting area, with head/body
  previews beside the real collect/equip action. Quest onboarding has an
  animated crowned character and selectable campaign panels; signed-in quest
  cards use ticket layouts, real progress rings, and existing claim authority.
- Create starts with a plain-language message for the selected coding app.
  Manual configuration is available in a disclosure. Connection approval,
  owner review, upload, playtest, and publication contracts remain separate.

## Cleanup and validation

- Removed 316 obsolete selectors (24,117 source bytes) from replaced profile,
  social, shop, and quest compositions, plus stale carousel/feed rules.
- No new dependencies or backend migrations.
- `npm run check`: 237 web tests passed, 6 skipped; 60 MCP tests passed, 2
  skipped; production build passed with 388 generated public game routes.
- Added regression coverage for current video dimensions and encoded public
  profile/share URLs. Parsed all 30 application CSS files; `git diff --check`
  passed.
- Browser automation rejected both the live site and local preview because of
  a saved site permission. The user's permission grant was acknowledged and
  retried through the authorized tools, but the tool-level setting remained.
  Rendered desktop/mobile QA, story-image appearance, and authenticated
  interactions are therefore not claimed as verified by this pass.
- The existing lazy Three.js chunk still exceeds Vite's 500 kB warning. It is
  loaded for visible 3D stages; this pass does not claim to remove that runtime.

Deployment evidence belongs to the GitHub Pages workflow for the merged commit;
a successful local build alone does not establish deployment or visual QA.
