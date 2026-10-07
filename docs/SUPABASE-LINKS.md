# Slop links: Supabase and GitHub Pages

The link services are owned by the Slop Supabase project `yqlolbebqfsodqgjlbeh` (`slop.game`), at the verified custom API domain `api.slop.game`. They require no Cloudflare Worker or Cloudflare account credentials.

- `GET https://api.slop.game/functions/v1/slop-aasa` returns the reviewed Apple app association JSON.
- `GET https://api.slop.game/functions/v1/slop-aasa/assetlinks.json` returns the Android association JSON, preserving the production `game.slop.api` package and all four reviewed signing fingerprints.
- `GET https://api.slop.game/functions/v1/slop-invites?code=XXXXXXXX` returns normalized invite instructions. It never looks up a private account, accepts an invite or awards coins.
- Existing `apply_referral(text)` and `my_referral_status()` RPCs stay in Supabase. Acceptance requires the verified signed-in user and an explicit Accept invite action.

The public app link remains `https://slop.game/invite/?code=XXXXXXXX`; older `/invite/XXXXXXXX` links work through the website fallback. The app's existing native parser and associated-domain entitlement remain unchanged. Invalid, duplicate or extra query parameters are rejected.

## Why there is a website copy

[Apple requires the association file on the associated website domain over HTTPS without a redirect](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html). A Supabase function URL alone cannot verify `slop.game`.

The website build runs `tools/sync-supabase-links.mjs`, reads the two canonical JSON documents from Slop Supabase, verifies them against reviewed public source and mirrors them at the root and `.well-known` paths in the GitHub Pages artifact. It refuses to publish if the endpoint is unavailable or the manifest unexpectedly changes. `include-hidden-files: true` preserves `.well-known` in the Pages upload.

[Supabase Edge Functions do not serve HTML documents](https://supabase.com/docs/guides/functions/http-methods). The invitation UI therefore stays in the existing Slop website frontend on GitHub Pages. It loads invite metadata from Supabase and reuses the website's verified session and owner-scoped RPC client. No second authentication store or service credential is introduced.

## Verify

```sh
curl -i https://api.slop.game/functions/v1/slop-aasa
curl -i https://api.slop.game/functions/v1/slop-aasa/assetlinks.json
curl -i 'https://api.slop.game/functions/v1/slop-invites?code=ABCDEF12'
curl -i https://slop.game/.well-known/apple-app-site-association
curl -i https://slop.game/apple-app-site-association
curl -i https://slop.game/.well-known/assetlinks.json
```

`ABCDEF12` is a format fixture, not a verified redeemable invite. Read-only QA must never accept a referral or claim its coins. Opening an invite page must not call `apply_referral` automatically.

GitHub Pages serves extensionless AASA as `application/octet-stream`; the current Apple CDN returns the same accepted JSON as `application/json`. Actual new-install association and app-link opening still require physical device verification. The production AASA retains its reviewed path allowlist (`/play/*`, `/r/*`, `/g/*`, `/invite/*`, `/mcp/pair`). New root game aliases and the legacy `/open/?game=` link are not included by that allowlist; keep the website's explicit Open in Slop fallback until a separate native route/association change is reviewed.

## Deployment boundary

Deploy only the named Supabase functions with `--project-ref yqlolbebqfsodqgjlbeh`; never deploy all functions implicitly or run blanket database migrations. The former Cloudflare AASA/invite configurations are retired, pinned to a nonexistent account and blocked by a local build guard. Do not bypass or revive them. Do not access Parky or any work Cloudflare account. Existing historical resources in another account cannot be claimed removed without a verified audit by that account's owner.
