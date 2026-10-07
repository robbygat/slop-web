# Slop Cloudflare isolation — 2026-10-07

The optional `slop-aasa` and `slop-invites` Worker configurations previously omitted `account_id`. Slop Invites already recorded that the accessible account did not own the Slop zone. Current CLI and browser checks are signed out, so live account/worker ownership could not be verified. No Cloudflare resource was changed or deleted during this pass. Parky source/configuration was not opened or modified.

These two Slop deployment paths are now disabled locally: the config pins a nonexistent all-zero account and its custom build exits before upload, irrespective of inherited credentials or account overrides. Guards exist in the active redesign and canonical mobile Invites source and canonical Slop web AASA source. Slop web's existing GitHub Pages workflow remains unchanged. This prevents the known local paths from silently deploying under a work account; it does not assert that historical live workers were removed or that arbitrary direct API calls outside these repositories are globally impossible.

Do not deploy either optional Worker until the owner-approved personal Slop account and ownership of `slop.game` are independently verified and a dedicated token is restricted to that account. Do not clean up Slop-named workers inside Parky: those are work-account resources and require the account owner's separate procedure.

[Cloudflare configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/) describes explicit account pins; [account-scoped credentials](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) prevent a token from reaching other accounts.
