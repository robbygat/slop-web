// These reviewed June releases have a fixed logical viewport. Their 16:9
// catalog recordings include letterboxing and must not shrink live fullscreen.
// Match the immutable release root so a later revision can choose a new shape.
const viewports = new Map([
  ['releases/a4ff1b4e360daffd53058f3d4d726f79fceb4e6f4f2eeea96b4c768365c6b766/run-infinite-desktop', 4 / 3],
  ['releases/ca8ca349a7056ef1c4d17a2b8a126053a37e09552e0528eea5544a3d267a6006/slopkart-desktop', 8 / 5],
  ['releases/b63e8ee36d570cd184982fa331f7b62a47eff1e4b63a9ec22c044a164c8e5637/sloppy-zombies-desktop', 4 / 3],
  ['releases/254e48e8d07abe84c48ed124f414c5b16e1ca03a99590049034f96cf8c376ed0/dungeon-panic-desktop', 4 / 3],
  ['releases/dd79866ff90546557cf8242c201531c478ee28dd38b0acbc2fcb8e10ef0322b9/slopcraft-desktop', 16 / 9],
  ['releases/85916f9d9b3f4c1cc46428de52a703ba6f9987dce543b7e2a11d768817ffa4d6/slopcraft-desktop', 16 / 9],
  ['releases/6165deb934dadc47a30f3fe6abd3744d1fc10c5e24f8a0bc714fc65661af6686/umbral-red-desktop', 4 / 3],
]);
export const desktopViewport = game => viewports.get(game?.published_bundle_path);
