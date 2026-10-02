# Game result score context

The website reads the native `my_game_personal_best(p_game)` contract before
submitting a completed run. This exact account-scoped baseline distinguishes a
first score, a tied best and an improvement. Missing/offline responses are not
treated as a zero best. A failed save leaves the saved personal best unchanged.

`my_game_standing(p_game)` adds the account's actual place even below the top ten,
the best score on that board, and the target immediately above it. Apply
[`20261002120000_game_player_standing.sql`](../supabase/migrations/20261002120000_game_player_standing.sql)
to the shared Supabase backend before releasing that feature. This change has
not been applied to production by the local website work.

The new RPC uses `_live_crown_rankings` exactly as `competitive_top_scores` does.
It preserves per-game verified/community authority and the existing tie order.
Only when that projection is empty does it use the website's existing
`top_scores` fallback (maximum score descending, user ID ascending). No top-N
fetch is used to infer the account's rank, and neither private ranking helpers
nor the scores table gain client grants. The account comes from `auth.uid()`,
not a supplied user ID; anonymous sessions are rejected.

The source contracts were checked against the shared native migrations
`20260817150000_live_crown_holder_projection.sql`,
`20260817170000_community_display_crown_transition.sql`,
`20260917020000_creator_games_join_live_crowns.sql`,
`20260629000000_application_prehistory.sql`, and
`20260916223000_authoritative_personal_best.sql`.

Personal best and board best are separate facts: a community submission must
never be displayed as receipt-verified. The next-position gap is the previous
row's score minus the account's board best, plus one. Ties therefore need another
point; the maximum supported score has no achievable higher target.

Both reads use the existing verified-owner and session-epoch guards. A missing
standing RPC or failed read must render an unavailable state, not an invented
rank or an empty personal best.

Validation: `node --test test/player-standing.test.mjs` covers response identity,
authority separation, saved zero scores, ties, score caps and pre-save context.
`mcp/test/game-player-standing-db.test.mjs` executes the actual migration in
PGlite and checks full-rank projection, fallback ordering, authentication and
grants. It runs with `npm run test:mcp` using that package's existing PGlite
dependency. Both focused suites passed seven tests each; this is local SQL
validation, not proof of production deployment.
