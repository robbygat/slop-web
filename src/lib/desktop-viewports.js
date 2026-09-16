// These reviewed June releases have a fixed logical viewport. Their 16:9
// catalog recordings include letterboxing and must not shrink live fullscreen.
// Match the immutable release root so a later revision can choose a new shape.
const viewports = new Map([
  ['releases/a4ff1b4e360daffd53058f3d4d726f79fceb4e6f4f2eeea96b4c768365c6b766/run-infinite-desktop', 4 / 3],
  ['releases/ca8ca349a7056ef1c4d17a2b8a126053a37e09552e0528eea5544a3d267a6006/slopkart-desktop', 8 / 5],
  ['releases/b63e8ee36d570cd184982fa331f7b62a47eff1e4b63a9ec22c044a164c8e5637/sloppy-zombies-desktop', 4 / 3],
]);
export const desktopViewport = game => viewports.get(game?.published_bundle_path);
