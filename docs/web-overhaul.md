# Slop web application

The web app is a JavaScript extension of the Flutter app, using its production
Supabase project, published game bundles, accounts, creator projects and MCP
connections. Mobile was fast-forwarded to `e2538ff05461130ca4dbf5bd70073e7cc1861068`
before this work. Existing mobile working changes were preserved.

## Source of truth

- `src/`: application UI and clients. `public/`: deployed static assets.
- `npm run dev`: local development. `npm run build`: publishable `dist/`.
- Shared production backend: `https://api.slop.game`.
- Mobile reference: refined SlopSurfaceTheme, Gabarito, current native characters.
- The website uses the same owner-bound creator and MCP contracts as mobile.
- An MCP connection can send drafts and inspect its own submissions. The owner
  confirms each immutable revision before preview. It cannot publish or spend.
- Games run in an opaque sandbox, separate from account storage and credentials.
- Billing must use the current server catalog, verified signatures and atomic
  idempotent grant RPCs. Client prices and redirect parameters grant nothing.

## Release verification

Run application security/contract tests, MCP SDK/handler/database tests and the
production build. Inspect desktop and mobile layouts and play actual published
games. Test authenticated pairing, draft receipt and revocation with an explicitly
authorized test account before claiming those live flows are verified. Document
any payment configuration or store-release dependency instead of claiming it works.
