# Play, Create, Quests, Social, and account upgrade

This pass keeps the colored Home hero and appearance menu from 5c2dde1 and
supersedes the earlier Play note where exit controls and Social are concerned.

## Changes

- Immersive Play has a visible Back control, an Activity bell, and a labeled
  return from the game. Leaving and returning preserves the current game and
  filters in a bounded, five-minute, public-only in-memory cache. Catalog paging
  remains continuous; Home no longer displays a partial loaded-game count.
- Create offers three editable gameplay starters and a custom idea, with Phone,
  Desktop, or Both targeting. The generated MCP brief explicitly requests a
  private playtest, canonical template/check tools, and `publish: false`.
  Signed-in studios recommend the next real draft, video, or connection action.
- Quests recommends a verified ready claim or the closest incomplete mission,
  with real remaining rewards, server reset times, and collapsible collected
  rewards. Existing owner, expiry, and claim authority is preserved.
- Social adds a crown board: actual featured-game holders, scores, profile
  links, playable challenges, and a copied score/game invitation. Everyone,
  Following, and Your crowns filter these featured games, not the whole catalog.
- Activity reads the existing private inbox: crown losses/wins, rival profiles,
  winning and previous scores when available, rematch/defend actions, followers,
  and messages. Message events open their specific accessible conversation.
  Earlier activity and explicit Mark all read use existing server contracts.
- Header and Play bells share exact unread counts and one account-scoped
  Realtime subscription. INSERT and read updates, focus, and a periodic fallback
  refresh the count. Account changes discard private Social/chat state; stale
  requests cannot restore an old unread count. This is in-app activity delivery;
  background push remains in the native app.
- Sign-in and account creation use a colorful character scene, clear mode
  controls, existing Google/Apple/email providers, password visibility, and a
  reset/confirmation path. Duplicate submissions and late UI updates are guarded.

## Validation

- Full web and MCP suites pass: 276 web and 60 MCP tests; eight existing
  environment-dependent tests skipped. Production build and 388 generated
  public game routes succeed. `git diff --check` passes.
- Production preview checked at desktop and 390 x 844: account mode/password/
  reset controls, Activity entry, real public crown holders/scores, copying a
  challenge, Social-to-game return, Play-to-game return, and feed exit/reentry.
  Play returned to the same game at scrollTop 664 with a 664px viewport.
- Home continued from 48 to 192 rendered game cards without a loaded-count label
  or error alert. Create and guest Quests received additional desktop/mobile
  light/dark checks. Account and Social phone layouts had no horizontal overflow.
- Authenticated inbox/read receipts, live sign-in, signup, reward claims, and
  cross-device notification receipt were not exercised with a live account.
  No backend migration, publication, or message send was performed. Contract
  tests cover notification privacy, count races, and exact conversation targeting.
- The existing large lazy Three.js chunk warning remains. Device performance
  and production deployment are separate from these local checks.
