# APK2077 and bounded Worlds upload transport

## Verified locally and at the release source

- APK: `game.slop.api`, 3.7.7 (2077), universal ARM64/ARMv7/x86_64.
- Exact size: 184841937 bytes; SHA-256 `a041ed8f6e73b95eda0ea70f71edd2177fd6cf96452161f961fa749fd3a19e7b`.
- Signature v2 verified; certificate matches preserved APK2076.
- New Worlds header divider/larger labels and corrected self-record loading copy are present in all three ABI binaries. 132 scoped Flutter tests pass, full analysis is clean, and actual compiled web header/Worlds UI was observed.
- Runtime remains persistent SDK452194 bytes, SHA-256 `dc6d666cc482ea568e9d752f9bcfd3eda02486ffca100724ac883d197a03c2f6`.
- Ads remain disabled. No physical-device installation or gameplay acceptance is claimed.
- Website points directly to Slop.game, not a GitHub redirect. Pages stages hash-verified APK2077 and keeps the existing APK2076 first-party path available; original release assets remain untouched.

## MCP0.6.1

Large/persistent draft submissions get a bounded120-second client deadline. Server-validated persistent `send_draft` calls get100 seconds upstream; ordinary requests remain30 seconds. No automatic retry, identity changes, authentication changes, size-cap relaxation or publication bypass. Ambiguous failure guidance requires checking the existing receipt and retaining identical request identity.

The exact slop-mcp adapter was deployed and independently downloaded: eight source files match; index SHA-256 `b423bc8cb13610f55fb38a6f79bbe89a85634cdf668125bdb425e79c0c8f7116`. Previous live source is backed up. The separate guarded SQL helper optimization was applied and postflight-verified in the mobile repository; permissions, service function and byte caps remain unchanged.

**Remaining blocker:** the actual7.85MB private transport fixture still returns `upstream_unavailable` after these changes. End-to-end upload readiness is NOT claimed; investigation continues. No synthetic fixture was published and Knight Crawler is not yet published by this change.

## Website verification

432 web tests pass,6 existing skips. 121 MCP tests pass,2 Windows-only skips. 318 independent PostgreSQL fixture checks pass. Production site build succeeds with390 game routes. APK2077 GitHub source receipt matches the reviewed hash/bytes. Public Slop.game deployment and full download must be verified separately after merge.
