# Slop redesign QA — September 16, 2026

The user accepted Social as a reference and rejected the old homepage repeatedly. A passed layout check is not design acceptance.

## Verified in the in-app browser

- Home at 1280 × 900: the mascot/two-phones composition is gone. One frameless Run Infinite stage uses actual gameplay; the only title is “Just play.” The game aspect ratio is preserved, with a visible pause control and a separate actual-game Play action. No native character engine is booted on Home.
- Native Gabarito wordmark and navigation: the web navigation now uses icons and a lowercase `play` mark. Accessible destination names remain on every link.
- Authenticated You at 390 × 844: viewport content width375; profile card x18, width339, equal18px gutters. Native scene and character are centered. Mobile identity/handle, three stats, and actions are now centered. The six actual native backgrounds are exposed through the owned-background interface.
- Build at 390 × 844: one prompt composer, optional style/controls, actual model allowance, saved projects, and the exact native morph video. No horizontal overflow or embedded character engine.
- For You: one visible game runs automatically. Night Drift actually started and progressed. Popover expansion filled the 390 × 844 phone with a 390 × 796 game surface; replay reset the game in the same expanded player. Shared results display the leaderboard, including empty/guest states.
- Signed-in generation: the existing Astra-created Pocket Hop project was opened. A Sol update marked “First change free” reached a real version2 preview candidate through the production creator service. The generated version loaded in the opaque sandbox and reached the shared game-over screen. The subsequent real input, capture and READY checks passed, as recorded below.

## Source and focused checks

- Only explicit preview dimensions change game shape. Portrait games keep their phone viewport on desktop; square and landscape captures preserve their orientation.
- Replay now retains one mounted player's previously validated document; no shared cache or cross-account/source reuse. Error retry deliberately refetches the document.
- Source and game-over checks for all three recovered June desktop originals:27 pass. These are separate from browser play evidence and publication status.
- Web contract tests:61 pass including acknowledged same-frame replay. Production build passes.
- Native promo tests:31 pass across ten-game cadence, small screens, larger text, light/dark, inactive/background/reduced-motion states. Native Play text and semantic-selection tests are separate.

## Remaining release gates

- Final three-clip HD hero rotation and current signed Android download.
- Exact temporary-account cleanup; no public QA game or review notification.
- Authorized website push, GitHub Pages run and live-route/download verification.

## Follow-up evidence

- The 320px check caught an actual oversized CSS grid track: a267px scene contained a350px native iframe. The grid now has an explicit shrinking column and a square viewer capped to its available width. Rechecked scene and viewer both267px wide at x19, with no body overflow; the character is fully visible. Small-phone action buttons stack instead of squeezing their labels.
- All six native profile backgrounds are visible in the dark mobile picker. Equipped the QA account's owned Cloud City through the real owner RPC and observed “Background updated”; then restored Slopwood Forest. Locked backgrounds remain locked.
- All three June originals are now published under official @slop.game through existing storage operation leases and release finalizers.24 public objects were downloaded anonymously and matched their exact reviewed source/media hashes. The Desktop filter shows Sloppy Zombies, SlopKart, and Run Infinite. Run Infinite rendered and progressed to251m inside the actual homepage player.
- PocketHop version2 mouse jump, obstacle clearance and score1 were verified in the second browser; Space/replay and actual feedback capture followed. Evidence is in /tmp/slop-web-redesign/secondary-pages. No public QA game was submitted.

- PocketHop v2 reached READY as “Pocket Hop — Gentler First Five.” Real Play again kept iframe generation0, closed game-over without loading/remount, then actual input reached score1. The12-frame publication preview encoded and enabled Submit; Submit was not clicked.
- HD hero: Run Infinite visibly decoded at1600×1200 and SlopKart at1920×1200. Automatic transition changed the actual clip, title and matching Play action. Manual selection while paused showed the chosen first frame without starting playback; Resume restarted it. Third-game completion is tracked separately until final capture.
- Desktop For You at1280×900: inherited880px max-width caused the original left offset. After correction, page/card centerlines both632.5px in the1265px scrollable viewport. Landscape game stage900px and metadata600px also center at632.5px; Sloppy Zombies visibly loaded and played.
