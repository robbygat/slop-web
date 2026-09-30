# Desktop and cross-platform play — September 30, 2026

## Behavior

Device filters include games supporting both devices. A separate live-play
format chooses a wide desktop viewport for cross-platform games while keeping
portrait preview clips intact. Desktop players can switch between Original and
Wide without changing the iframe key, loaded document, or score-run identity.
Held keys are released before changing the viewport. Phone layouts and explicit
preview/recording stages retain their original shape. Reviewed fixed desktop
viewports retain their existing logical aspect ratios.

The Play preferences include Cross-play and preserve that filter when returning
from a game. A bounded compatibility registry adds verified mouse-friendly
mobile releases to web discovery. It is keyed to immutable published bundle
paths and exact versions; it does not update platform records, infer capability
from a title, or grant compatibility to a future release.

## Browser evidence

Ice Cream Stack's genuine mouse drag moves its cone/tower. At 1280×900, Original
measures 337.38×730.99 and Wide measures 1232×693; iframe generation remains zero
and the finished score 4042 stays intact. Another active run preserves score
1470 while switching back to Original. At 390×740, the playfield measures
271.84×588.99, the view selector is absent, mouse/pointer dragging works, and
there is no horizontal overflow. Screenshots:

- `/private/tmp/slop-desktop-ice-wide-active.png`
- `/private/tmp/slop-phone-ice-active.png`

The production preview at 1280×720 independently resizes Ice Cream Stack from
254×551 to 979.55×550.99 and back, keeping generation zero and a progressing
visible score (4144 → 5448 → 7098).

An independent review verifies that resizing does not change iframe/run
dependencies, author controls, sandbox permissions, score ownership, or receipt
validation. The authored SDK propagates resize to the game's own handler.
A game may intentionally retain its own letterboxing in a wide viewport; the
host does not stretch its canvas or rewrite world/physics coordinates.

## Release acceptance

Final local validation: 310 web and 60 MCP tests pass, eight existing environment
skips, production build and 388 generated game routes. Log:
`/private/tmp/slop-desktop-play-final-check.log`. Live deployment is recorded in
the canonical outstanding-work ledger after merge and public verification. Physical-device performance and unrelated
authenticated account/reward acceptance remain outside this change.


Wobble Tower also passes genuine mouse tap/rotation and horizontal drag. At
1280×900, Wide is 1232×693; returning to Original preserves finished score 41
and frame generation 1. Phone 390×740 retains a 271.84×588.99 playfield without
a viewport selector or horizontal overflow. Replay resets score to zero in
place; expanding uses the available top-layer fallback, Escape exits, and Back
to Home unmounts the game. Native fullscreen was not granted in this browser.
Screenshots: `/private/tmp/slop-desktop-wobble-wide-active.png` and
`/private/tmp/slop-phone-wobble-active.png`.

The two reviewed releases are listed with exact immutable paths, versions, and
actual game.js SHA-256 hashes in `src/lib/reviewed-desktop-games.js`. Ice Cream
Stack uses pointer handlers and a camera/renderer resize handler. Wobble Tower
uses authored tap-to-rotate, drag-to-move, downward-flick-to-drop, and a resize
handler. Mutable legacy Flappy Duck was exercised but deliberately excluded
from the review registry.

The final production preview's Cross-play filter returns exactly Ice Cream Stack
and Wobble Tower. Desktop returns those two alongside the 13 declared desktop
games. Ice Cream Stack starts at 980×551 in Wide with its mouse-drag hint;
choosing Original then Next correctly opens Wobble Tower in its own automatic
Wide mode. Returning Home retains the selected catalog filter.
