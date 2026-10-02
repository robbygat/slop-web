# APK2077 and bounded Worlds upload transport

## First World publication and preview recovery

Knight Crawler published successfully on the first normal publisher attempt at 08:43:35 UTC. The caller's 145-second finish deadline expired two seconds earlier, so workflow36985130838 reported `service_unavailable` and never reached MP4 attachment. Independent public reads confirm the exact reviewed source, `persistent: true`, mobile support and one immutable published release. This is not a reason to republish or send another draft.

The added `repair_one` workflow requires an explicit published MCP slug, source digest and release root. It verifies every immutable source byte before the existing World recorder and uses only the existing OIDC media endpoint. It skips the queue/catalog passes, refuses withdrawn or changed releases, preserves already-attached current previews, and stops on unknown upload outcomes. Twenty targeted repair tests plus workflow guards pass. Full check: 466 web tests pass/9 opt-in skips; 122 MCP tests pass/2 Windows-only skips; production build generates 392 routes. Production repair and public video acceptance remain separate post-merge checks.

The native shared-link resolver also omitted the existing `persistent` field. Guarded migration20261002210000 adds that single authoritative JSON pair while preserving every other definition byte, permission and visibility condition. 115 database checks, live rollback rehearsal, independent preflight/apply/postflight and official history verification pass. The public Knight Crawler resolver now returns200 and `persistent: true`; native shared-link UI acceptance is not claimed.

## Live follow-up (supersedes the initial upload blocker below)

- PR62 and Pages36979906868 completed. A full download from `https://slop.game/downloads/Slop-3.7.7-build-2077-universal.apk` returned 200 with zero redirects and the exact size/hash below; the fresh browser download page displays build2077. The2076 first-party URL remains available.
- The database's normal 8-second statement limit was insufficient for the complete World admission operation. Additive migration `20261002200000_worlds_upload_rpc_timeout` adds only a service-role-only, SECURITY INVOKER `mcp_world_submit(jsonb)` with a60-second transaction budget. It accepts only a validated persistent draft and calls the unchanged `mcp_service('send_draft', p)`. Ordinary role limits, permissions, quotas, immutable request identity and bundle caps remain unchanged.
- The guarded rollback rehearsal, independent unchanged-state check, exact apply, independent postflight and official migration-history repair all passed. Wrapper definition MD5 `a08d8cd14ce1b628c712ba241bcc1e96`; migration SHA-256 `dabf3f326dca5003f6ba80697b9099ad2977ad3a9f9fac21e7c26082825f4182`.
- The new Edge adapter independently downloaded byte-for-byte across all8 files; index SHA-256 `2e5e6c711523de88182ab387095c629c3a387552056ebfbdc51dc8cf79896316`.
- The real7,853,821-byte high-entropy private fixture now returns a matching receipt in23.43 seconds. The actual reviewed Knight Crawler bundle also returned a matching private receipt:7,850,467 bytes in28.37 seconds. Neither upload is a public release; the synthetic fixture must never be published.
- 42 additional PostgreSQL checks and122 MCP tests pass, with2 Windows-only skips. Maximum50MB HTTP throughput remains unverified; the tested full-size first World is7.85MB.
- The World-aware preview recorder is now implemented and independently reviewed. It uses the actual isolated persistence/asset host, exact SDK admission, verified decoded-byte manifests and bounded ordinary touch inputs. It fails closed on missing/corrupt assets, late runtime errors and pending transfers, before and after encoding. Ordinary Arcade behavior and server permissions are unchanged.
- Final actual Knight Crawler captures passed: H.264 720×1280, 30 fps, 7 seconds, 220/222 moving frames and zero errors; matching GIF/cover capture passed. All 28 requested assets were verified, with no pending requests. Captures used local macOS Chrome, not Linux CI or native-device acceptance. The first publication still must pass the normal production recorder and publisher; no blank-preview or publication bypass is permitted. Remote-URL-only World backfill explicitly fails without a verified full source manifest.
- Final complete check: 445 web tests passed (9 opt-in browser skips), 122 MCP tests passed (2 Windows-only skips), and production build succeeded with 390 game routes. Separately, all 16 World real-browser cases and existing Arcade browser cases passed. Knight Crawler remains a private draft until the production publishing receipt is verified.

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
