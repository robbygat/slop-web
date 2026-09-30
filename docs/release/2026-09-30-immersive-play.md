# Immersive Play and simpler discovery

This pass supersedes the previous mobile-player note where the hero body and
Play navigation are concerned.

## Changes

- Play does not mount the website masthead or footer, including while its lazy
  route loads. Phones get full-viewport previews with compact Newest / For You
  controls over the picture. All / Mobile / Desktop live in a preferences
  dialog. Desktop portrait video sits between game details and reactions.
- Desktop wheel gestures advance one game and ignore the same gesture's
  inertia. Touch keeps native scroll snapping. Resizing keeps the active game
  aligned. First-place character portraits stay small; the title, real crown
  holder and score, then description retain their order.
- Visible game previews receive rotating decoder slots, rather than permanently
  favoring the earliest tiles. Hover and keyboard focus take priority. There are
  two active decoders on compact/coarse screens, six on medium desktops, and
  eight on wide desktops. Offscreen and paused previews release their slots.
- Grid motion affects the picture inside each card, keeping hitboxes stationary.
  The catalog is now called All games, replacing Dive in.
- Home removes the large Slop emblem behind the orbit. On phones the headline,
  play/download controls, and interactive characters form a vertical composition.
  A small complete mascot sits independently on the section border, with its
  feet extending into the following section. It uses a lightweight image and
  restrained CSS motion, not a rigged mesh or a second WebGL context.
- Social uses steady profile cards and a compact single-column phone layout.
  The old ribbon morphs and view-transition profile clones are removed.
- Create focuses on choosing a coding app, copying its setup message, approving
  the real connection, and sending a game. Technical setup stays expandable.
  Existing pairing, private drafts, publication, and revocation authority remain.
- Removed the rejected headless seated model, its renderer and export script,
  and conflicting retired CSS. The original standing Core rig is retained.

## Validation

- Full npm run check passed: 253 web tests and 60 MCP tests; eight existing
  environment-dependent tests skipped. Seven new tests cover preview fairness,
  hover priority, decoder release, pause-before-play ordering, wheel inertia,
  direction changes, and leaving horizontal/pinch gestures alone.
- Production build and route generation succeeded: 388 public game routes.
  Final CSS cleanup was followed by another successful production build.
- git diff --check passed. No package dependencies or backend migrations added.
- Browser access to the local preview was rejected again by a saved user
  permission setting. No workaround was attempted. Responsive layouts, real
  touch swiping, video decoding, actual game input, and authenticated onboarding
  have not received a browser acceptance pass in this revision.
- The existing lazy Three.js chunk size warning remains. These changes do not
  establish measured device performance.

## Generated hero artwork

Selected asset: public/assets/robots/ledge-slop.webp, 640 by 960, 85,174 bytes.
Generated with the built-in image generation tool, using the supplied central
Slop robot in 01-Play-for-the-Crown.png as its reference. The selected cleaned
PNG remains in the generated_images directory as
exec-85815073-56f8-452b-ad9d-386ecd1d1d94.png. WebP conversion only resized and
compressed the generated art.

Generation prompt:

> Use case: stylized-concept. Create ONE exceptionally polished transparent cutout of the main Slop robot as a small decorative mascot for a website section boundary. The attached image is the exact character/style reference: use ONLY the central white/lavender ceramic robot with sky-blue mittens and boots, dark graphite inset joints, glass face showing the exact glowing lime Slop S symbol, and its small blue crown. Preserve the distinctive head, body proportions, materials, and brand identity. NEW POSE: a complete robot sitting casually on an INVISIBLE horizontal ledge, leaning slightly to the viewer's left, head relaxed and tilted toward the viewer, both thighs forward, both knees naturally bent at right angles, legs and blue boots dangling freely DOWN below the ledge. One hand rests next to its hip on the invisible ledge, the other arm hangs relaxed slightly below the ledge, natural anatomical joint connections, no disconnected parts or swollen ball-joints. Ledge contact/hips roughly 62 percent of image height, feet near 94 percent; full crown visible near 5 percent. Slight front three-quarter camera, almost straight-on at chest height, clear leg silhouette. High-end playful 3D brand campaign quality, immaculate toy-like design, soft studio highlights and subtle contact shading on the character itself. Isolated on true alpha transparency. There must be NO physical ledge, no block, no floor, no background, no scenery, no text or slogan, no second robot. This will be composited onto a real CSS section border, so leave everything around the complete character completely transparent and keep all limbs inside the canvas.

The follow-up image edit preserved the pose, crown, logo, proportions and robot
lighting while requesting removal of exterior glow and a transparent silhouette.

Deployment is tracked by the Pages workflow for the merged commit. Build and
unit checks alone are not evidence of deployment or interactive acceptance.
