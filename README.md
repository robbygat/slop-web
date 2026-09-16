# Slop on the web

[slop.game](https://slop.game) extends the Flutter app with the same accounts, game catalog, creator projects, wardrobe, and desktop MCP connections. The interface is a responsive React application written in JavaScript, with Gabarito typography, native Slop character renders, and claymation artwork.

## Development

Use Node 26 and Deno 2.9.6 for the same runtimes as CI.

```sh
npm ci
npm --prefix mcp ci
npm run dev
```

The app opens at `http://127.0.0.1:5173`. `npm run build` writes the production site to `dist/`; `npm run preview` serves it at `http://127.0.0.1:4174`. Backend calls use the existing mobile Supabase project at `https://api.slop.game`. Its publishable key is intentionally public; privileged keys are never bundled into the site.

```sh
npm run check
node --test supabase/billing/test/authority.test.mjs
deno test --no-lock --node-modules-dir=none --allow-env supabase/functions/billing-tests/
```

## Structure

- `src/`: application routes, account state, API contracts, and the sandboxed game player.
- `public/`: public art, game clips, downloads, legal documents, universal-link files, and redirects from old URLs.
- `mcp/`: installable desktop MCP bridge, pairing, private draft delivery, and protocol/database tests. `npm --prefix mcp run package` builds the website download.
- `supabase/functions/`: shared backend endpoints. Website publishing does not deploy these functions or migrate the database.
- `supabase/billing/`: reviewed billing recovery and PostgreSQL tests. See [billing operations](docs/billing.md) before any payment configuration.
- `cloudflare/`: the existing Apple association-file worker.
- `tools/`: repeatable asset export and maintenance tools.

The former `NewSite/` marketing site and old Node/SQLite studio were removed. The website has one source entry point, `index.html`, and one production output, `dist/`. Old URLs redirect into the application.

## Publishing

GitHub Pages must use **GitHub Actions** as its source. The Pages workflow runs on pushes to `main` and manual dispatches. It installs locked dependencies, tests the app/MCP/billing boundaries, rebuilds the MCP download and web app, and deploys only `dist/`. Only a successful build from `main` can publish. The custom domain remains `slop.game` through `public/CNAME`.

Do not commit `dist/`, account tokens, Android signing keys, or Edge Function secrets. Do not use `supabase db push` from this checkout: the historical web migrations predate the current mobile database. Backend changes require a targeted, reviewed migration and separate deployment.

## Service boundaries

Games run in an opaque sandbox without account tokens. Creation and publishing use the existing server authorities. MCP connections and every private draft revision require account-owner confirmation; the bridge cannot publish or spend coins.

New premium sales remain disabled. The backend checks exact provider prices and replay-safe payment receipts, but live billing still requires webhook/portal configuration, a provider round trip, and reliable provider cleanup after account erasure. See [billing status and activation](docs/billing.md). The signed Android APK is hosted as a public GitHub Release asset, so the website bundle stays small while the Download page provides a direct file download.

Project decisions and verification are in [the overhaul notes](docs/web-overhaul.md) and [MCP release evidence](docs/mcp-release-2026-09-16.md).
