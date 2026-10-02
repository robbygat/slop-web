# First-party APK2076 download

Rob requested a direct Slop.game download rather than a GitHub-hosted link.
This change keeps the already verified APK bytes; it does not rebuild the app,
publish a game, enable ads, alter signing, or remove any prior release.

- Public URL: `https://slop.game/downloads/Slop-3.7.7-build-2076-universal.apk`
- Original preserved source: GitHub release `android-3.7.7-build-2076`
- Bytes:184841937
- SHA-256:`609161105b0c063e66dfce936c75a5c74058a967d32c77f4ab0815cd7b07bbab`
- Package:`game.slop.api`3.7.7(2076), same verified v2 certificate.

Pages stages the binary only after the web build. It checks both release records,
the immutable source identity, exact size and SHA-256 before adding the APK to
the deployment. A verified hash-keyed CI cache avoids downloading185MB on every
scheduled site refresh. The binary is not committed to Git. A failed staging
check prevents upload, so metadata and file deploy atomically.

The public hero, footer and download-page anchors use the first-party URL and
HTML download attribute. The shared metadata refresh bypasses browser cache,
rejects foreign/stale records, and keeps the known bundled release usable if the
request fails. The download page explicitly displays the build number.

GitHub Pages currently returns max-age600 for HTML. Already cached pre-fix app
shells may need a reload or that cache lifetime to expire; new code cannot rewrite
an already executing old bundle. Do not claim that a new upload changes old APKs.

Final local web checks:431 pass/6 existing skips;388-route build. All13 focused
download/staging cases pass. The actual185MB source staged successfully and
retained the exact SHA-256; cache reuse is reverified. Browser preview confirms
the first-party href and visible Build2076. Public HTTP/hash and Browser
observations are recorded in the mobile canonical release ledger after deploy.
