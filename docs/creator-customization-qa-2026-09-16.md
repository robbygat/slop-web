# Creator, MCP and customization verification — 16 September 2026

The web checks use production owner-authorized APIs. Temporary release data is kept in a single reserved-domain QA account and isolated browser origin; no real account is charged or given test content.

## Profile customization

- On the existing account, clicking the actual native profile character opens the editor. The native bridge separately passed tap, movement-over-8px drag suppression, and Enter activation checks.
- At a 390px viewport, the editor fits without horizontal overflow and contains one native renderer. Opening it suspends the profile renderer below it.
- The editor uses native appearance identifiers and names, the current profile look, and actual `my_slop_cosmetics` ownership. Locked choices cannot be equipped. Two unreleased native promotion traits remain disabled because the production validator does not accept them yet.
- Changed the preview locally, restored the original Grape/Pebble appearance, then used Save. The real `equip_slop_look` receipt and profile readback matched the original look; no appearance, balance or entitlement was changed.
- Tests cover stale editors, owner switching before equipment, exact accepted-look receipts and native face/accessory normalization.
- Local visual evidence: `/tmp/slop-web-redesign/secondary-pages/customizer-mobile.png`.

## Creator

- Started one real Astra build from the browser after both the capability response and UI showed a free allowance. The site displayed actual server milestones, including Designing 33% and Ready to playtest 67%, plus durable activity entries.
- The first generated candidate had a real high-DPI canvas bug. Clicking its visibly displaced star failed. Submitted those observations through the actual playtest feedback action; the same run authored a new candidate that restores the SDK's DPR transform.
- Played the repaired candidate by clicking all five moving stars. The shared result showed score 15, including a timing bonus. Play again reset score and collected stars to 0; a subsequent click worked in the new run.
- Submitted positive feedback only after that playtest. The server accepted a canonical head with the final title and summary. The web chooses that head rather than a stale preview candidate.
- Inline preview displays a validated, persisted version automatically. During a refinement it keeps the prior saved game available. Build percentages describe six durable milestones, not streamed incomplete source or estimated elapsed time.
- Fixed a live-discovered preview-loader bug caused by collision between a revision key and the bundle identity object. Added exact-version preview reuse and account-epoch fencing.
- Selecting or admitting a project preserves its validated project ID in the URL so reload can resume server-saved work.
- Ran a standard edit using the actual Update game button only after the server capability and UI both confirmed the first Sol change cost zero coins. While it worked, the previous game remained available and the UI displayed Designing 33%. The resulting pale-blue background and mint first star were visibly verified, including pointer collection and restart. Positive feedback produced the accepted edited head and 100% completion. A full reload restored that head from its project URL.
- Recorded 12 real frames through the production web capture component while interacting with the edited game. The UI reserved its game name, prepared the owner-bound release candidate, uploaded its exact source, and saved the cover and 360×640 gameplay-clip receipts.
- The isolated QA server blocked only `submit_review` forwarding before the external Edge notification path. It recorded the exact expected temporary owner and release slug. Production then passed the real finalizer in a transaction, including pending-review status, nonce, source/build, owner and stored media assertions, followed by rollback. No public QA game or review notification was created; post-rollback activity and push counts were zero.
- Advance polling now reconciles an exact newer saved run after a version conflict, so opening a preview during an in-flight advance cannot strand the build on an old version. Tests reject foreign, unchanged and malformed reconciliation results and preserve unrelated errors.
- Local visual evidence: `qa-final/build-progress.png`, `qa-final/creator-result.png` and `qa-final/creator-replay.png` under `/tmp/slop-web-redesign`.
- Publication capture evidence: `/tmp/slop-web-redesign/qa-final/creator-recorded.png`. Private source/receipt manifests and rollback SQL remain in the same restricted QA directory.

## MCP

- Installed the production hosted `slop-game-mcp-0.2.0.tgz` through `npx`, completed the real MCP SDK handshake, and listed all six tools.
- Verified QR pairing stays pending after review and only becomes active after explicit owner confirmation. Repeating confirmation and draft delivery is idempotent.
- Sent a canonical Slop runtime template, explicitly approved it as the owner, and verified private HTML, JavaScript MIME and exact source/runtime bytes through the immutable preview gateway. Agent status contains no preview capability.
- Sent and approved a second revision that changes the ball color. The new preview contains the new bytes while the earlier preview retains the prior bytes; canonical `Slop.js` remains unchanged.
- Repeated unauthorized and foreign-origin probes: owner endpoints require authentication, untrusted origins are denied, and browser callers cannot use agent routes.
- Prepared publication using actual cover and 12-frame 360×640 gameplay media captured earlier from the byte-identical template (both full source map and bundle digest were compared before reuse). Source/runtime, stored raster data, build identity and owner receipts passed fresh production checks.
- Ran the real publication finalizer inside a production transaction and asserted the pending-review status, review nonce, owner, build and media paths; rolled it back. Readback confirmed the private draft remained and there were zero activity/push rows.

This finalizer test proves submission authority and receipt handling. It does not claim moderator approval or a public QA release, and it does not send a review notification to anyone.

## Balance and regression checks

- The temporary account had zero coins after the free create, repair and first edit. Its actual daily claim returned a 200-coin reward; both the receipt and `my_coins` readback passed the same validators used by the wallet. A repeated claim kept the balance at 200 and the daily claim unavailable.
- Final integrated `npm run check` passed: 113 web tests, 27 MCP tests and the production build.
- Follow-up frontend repairs fence delayed Build responses with a mounted route ticket through admission, cancellation, feedback and history updates. Unmount/project changes invalidate old work. Tab-storage quota failures are caught before admission, preserve the idea, clear busy state and retain exact idempotency for ambiguous requests. Five targeted delayed-response/storage tests passed; no new production generation was performed.
- Follow-up source audit: the native generation guide mentions CSS coordinates and `view.dpr`, but does not explicitly warn against discarding the SDK transform with `setTransform(1,…)`. The parent received the exact source location and a suggested one-line DPR-preservation instruction; no unrelated backend deployment was started.

## Cleanup

- The actual MCP disconnect tool revoked the temporary connection; subsequent agent draft access was denied.
- Deleted all nine controlled private games through the normal owner game-deletion endpoint, removed eight owned diagnostic preview roots, then deleted the reserved QA account through its recent-auth owner deletion flow.
- Production readback confirmed zero QA auth users, games, MCP connections and score rows. All six official published desktop originals remained present. No real creator content or account appearance was changed by cleanup.
- Restricted cleanup receipts: `/tmp/slop-web-redesign/qa-final/qa-cleanup-result.json`.
