# Local Worlds acceptance — no backend

From the web checkout, run `npm run qa:worlds`, then open
`http://127.0.0.1:5193/__worlds-qa/` in Browser. Stop with Ctrl-C.
This host binds loopback only and does not build, deploy, sign in or publish.

The real GamePlayer, opaque relay, packaged SDK, device IndexedDB and asset
cache run against a clearly labeled synthetic World. The served bundle is
generated from the current package at startup; no fixture SDK copy can go stale.
Production auth/Supabase imports are replaced with inert, throwing local
adapters before module evaluation. All fixture external fetches are blocked.
The production app never imports this harness.

1. Tap the canvas or press Space; confirm run and profile counters advance.
2. Close World (flush), reopen, and choose Continue. Values must survive.
3. Close, set Assets: offline, reopen and Continue. Ready must succeed from
   verified cached assets without increasing the request counter.
4. Close/reopen and choose New run. Run resets; profile remains.
5. Reload host; confirm the durable state remains. The asset-offline toggle
   resets on reload; it is not a complete browser network outage.
6. Confirm the forbidden-call count stays zero throughout. Errors are failures,
   not an excuse to clear storage or silently discard progress.

This proves only the exercised synthetic local host paths. It does not prove a
signed private preview, cloud auth/transfer, cross-device sync, browser hard-kill
durability, native operation or a fully offline website bootstrap. It never
calls Slop.finished, creates a real game, awards coins or publishes a World.
