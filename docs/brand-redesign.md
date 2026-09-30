# Slop.game website rebrand — 30 September 2026

## Delivered experience

The website uses the mobile app's robot geometry, face painter, cosmetics, and world artwork. The hero keeps the interactive heads, electric connections, orbital swaps, a restrained cream/lime composition, and direct App Store and Android APK downloads. The header uses the complete Slop.game wordmark and an unframed equipped character. The five-item dock places Play in the center and includes Create/MCP.

Explore loads the complete public catalog without a 132-game ceiling. Fresh drops is the default. Phone and desktop sequences retain their individual ranking while the mixed wall interleaves the formats; desktop previews span three phone columns. Kickflip Coast is featured near the beginning. The featured carousel mixes recent mobile games, recent desktop games, and popular videos. Titles reveal on hover/focus; motion respects reduced-motion preferences.

Play uses native vertical scroll snapping with one active preview, all/mobile/desktop filters, and a dedicated game theater. The player requests native fullscreen with a top-layer fallback, preserves keyboard focus, and offers opt-in mouse capture. Only trusted gestures can request pointer lock. Escape and disabling capture release the cursor. Game isolation, owner checks, scores, replay acknowledgements, and publication validation remain enforced.

Social uses profile-world posters and current characters. Quests has new crown/robot artwork, a level orbit, progress, rewards, and existing server-authorized claim actions. The shop uses a fitting-room layout with ownership-aware cosmetics. Profiles retain the game gallery and add an optional articulated body display. Create is an MCP-only inbox and setup flow; legacy prompt-generation routes redirect there.

## Reference character and mesh

The approved full-body reference was generated with Higgsfield GPT Image 2.5 (job `c69e1214-098a-4dda-9cad-15591dc22e99`, 2.75 credits). The editable body mesh was then constructed from that reference using Blender/3D Jutsu, with named shoulder, elbow, wrist, hip, knee, ankle, neck, and head-mount pivots. It is an authored interpretation of a single reference view, not a claim of exact image-to-3D reconstruction.

- Higgsfield project: https://higgsfield.ai/3d-jutsu/dac82d7a-b040-4110-9bca-d56a9946b280
- Verified committed revision: 1, operation `core-body-build-03`.
- Runtime GLB: `public/assets/robots/models/slop-core.glb`, 49 meshes, 50,668 triangles, approximately 1 MB.
- Reproducible source: `tools/build-core-mesh.py`.
- Local model review: `/tools/core-preview.html` on the development server.
- Runtime: lazy-loaded only when full-body display is requested, bounded 30 FPS, offscreen/hidden-page suspension, reduced motion, drag rotation, floating/spin/wave response.
- Equipped mobile heads attach to the same body socket. The body display preference is local to this browser; it does not claim to sync a new body cosmetic to the mobile backend.

## Cleanup

Removed 23 obsolete presentation modules after checking the production import graph. Removed obsolete tests for those retired modules; retained and extended the current player, security, MCP, preview, catalog, profile, and character tests. Removed the old compiled Flutter character viewer, sprite atlases, duplicate catalogs, and unused full font source after preserving a hashed recovery archive. Its old entry URL redirects to the current profile.

Retired assets total 45,076,502 bytes. Converting the three new campaign copies to WebP saves another 4,905,812 bytes. Desktop campaign originals remain unchanged. Removed 163 unused stylesheet rules (10,766 bytes). Existing public game footage remains available for older shared media URLs. The current shell previews, worlds, coin, font, and all referenced app assets remain present.

The file-by-file retirement record is `docs/retired-assets-audit.json`. Recovery archives are `/tmp/slop-retired-ui-20260930.tar.gz`, `/tmp/slop-retired-assets-20260930.tar.gz`, `/tmp/slop-retired-tests-20260930.tar.gz`, and `/tmp/slop-body-experiment-v1.tar.gz`; previously tracked content also remains recoverable in Git.

## Verification

- Web tests: 239 total, 233 passed, 6 environment-dependent tests skipped.
- MCP tests: 62 total, 60 passed, 2 skipped.
- Database authority/contract tests: 21 passed.
- Billing request/signature tests: 9 passed; billing Edge Functions type-check passed.
- Production build passed; 388 static HTTP-200 game routes generated.
- Articulated GLB loads; geometry is finite and within the triangle/size budgets; each limb has the correct parent chain; authored idle clips close at the same transforms.
- Desktop browser: home, actual video previews, Social, Quests, Create, profile/body, desktop filter, and live game theater checked. Phone browser at 390×844: home and full-height Play feed checked with no horizontal overflow and one running video.
- Later browser permission was denied. Remaining visual rechecks require restored browser permission. Native pointer capture has automated gesture/source validation; its final interactive check is still outstanding.

Production release status is recorded separately from these local checks.

## Source references

- Mobile robot renderer: `/Users/rob/Documents/slop-mobile-robots/tool/robots/src`.
- Mobile artwork: `/Users/rob/Documents/slop-mobile-robots/assets/robots`.
- Hero motion reference: `/Users/rob/Documents/JevBot/src/scene` (visual reference only; no reference-project naming in the customer interface).
- Campaign originals: `/Users/rob/Desktop/Slop - 35 TikTok Videos/03 - Refreshed Campaign/Brand Images`.
