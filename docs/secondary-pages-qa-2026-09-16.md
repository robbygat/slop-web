# Shop, Connect and Download verification — September 16, 2026

The three routes use a quieter layout consistent with the current web design. Connect's decorative computer, phone and character scene is removed; setup begins with Codex, Cursor and Claude Code choices and three steps. Shop retains the exact exported mobile cosmetic art, removes the decorative banner and repeated rarity labels, and keeps real catalog prices and account actions. Download separates iPhone and Android and puts APK installation and checksum information in expandable details. Stripe remains Coming soon.

Visual checks used a dedicated Chrome tab on the current local preview, http://localhost:5182, at 390×844 and 1440×1000. These were guest sessions until the separate creator playtest. Each route was reloaded through about:blank to avoid stale preview modules.

- All three pages render at both sizes. No horizontal document overflow at 390 pixels. Shop and Download also have no overflow at 1440 pixels.
- Zero Flutter/game iframes on Shop, Connect or Download. No decorative video or invented phone screens.
- Shop's Material filter updates the actual catalog, and Clear Glass opens its real native-art preview. No cosmetic purchase, equip, daily reward claim or lesson reward was performed during these visual checks.
- Connect's Codex, Cursor and Claude Code setup instructions fit the phone modal. Cursor displays its ~/.cursor/mcp.json path; Claude Code displays its stdio CLI command. An unrelated example.invalid connection link is rejected before approval or account mutation.
- Download points to the existing App Store listing and the current android-release.json APK. Expanded installation, source commit and SHA-256 details wrap within the phone layout. Actual APK release/signature verification is recorded separately by the mobile release task.
- No JavaScript errors reported by Chrome for the checked Shop, Connect and Download interactions.

Local screenshot evidence is in /tmp/slop-web-redesign/secondary-pages/: 01–03 show the former layouts; 04–09 show the new 390-pixel layouts, setup dialog, material detail and expanded APK details; 10–12 show the desktop pages. These screenshots are local QA artifacts, not shipped site assets.

Authentication, owner isolation, pairing, native approval, game receipts and billing behavior have separate functional evidence in mcp-release-2026-09-16.md and release-audit.md. The visual pass does not claim another authenticated purchase or a public game submission.

## Creator refinement and replay follow-up

The controlled temporary account's generated Pocket Hop version 2 was playtested in the actual web UI. Mouse clicks visibly jumped over an obstacle and the native-style host result showed score 1. Space key presses also produced visible jumps. Replay returned to score 0. The UI captured a real frame and submitted affirmative playtest notes only after these checks; the server completed the run and the UI selected the accepted version 2, titled “Pocket Hop — Gentler First Five,” with Publish available.

Canonical Slop.js replay now uses its existing restart acknowledgment. The web player binds the acknowledgment to its exact current frame and a fresh UUID request and requires handled to be boolean true. An unhandled response, runtime error or 900 ms timeout retains the reload fallback. The old run closes before requesting reset; the new score run is created after acknowledgment. Six focused tests cover wrong-frame/stale/malformed replies, timeouts, teardown, duplicate requests and the actual shipped runtime's successful and failed restart callbacks.

On a fresh browser load after this change, replay preserved iframe generation 0, removed the result overlay and kept loading false; the control-and-DOM check returned in 287 ms. This measures that observed browser round trip, not a universal latency guarantee. The subsequent round reached score 1 while the actual 12-frame recording encoded successfully and enabled Submit. Submit was not clicked. No public review notification was created.

Evidence: pocket-hop-v2-long-9.png shows the mouse-driven jump over an obstacle; pocket-hop-v2-long-19.png shows score 1; pocket-hop-v2-space-35.png shows a later Space-driven jump; pocket-hop-v2-fast-replay.png shows the reset playable canvas; pocket-hop-v2-capture.png shows score 1 and the completed real preview. All are in the same local screenshot directory. The complete web suite passed 61 tests after the replay change. Chrome reported no game errors during this playtest. The temporary browser viewport was reset after QA.
