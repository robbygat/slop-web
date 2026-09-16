import 'package:flutter/painting.dart';

/// Everything that makes a Slop *yours*.
///
/// A look is pure data: a palette plus a handful of feature choices. Every
/// surface that draws Slop — the studio composer, the shop hero, the profile
/// card — paints from one of these, so customizing in one place changes Slop
/// everywhere at once.

/// A body colour ramp. The painter reads it top-to-bottom: [glow] is the lit
/// crown, [shade] is the pooled bottom, and [ink] is the face.
class SlopPalette {
  const SlopPalette({
    required this.id,
    required this.name,
    required this.glow,
    required this.light,
    required this.mid,
    required this.deep,
    required this.shade,
    required this.ink,
    this.cheek = const Color(0xFFFF7595),
  });

  final String id;
  final String name;
  final Color glow;
  final Color light;
  final Color mid;
  final Color deep;
  final Color shade;

  /// Face colour — eyes, mouth, brows. Dark palettes need a lighter ink so the
  /// face doesn't disappear into the body.
  final Color ink;
  final Color cheek;

  /// The vertical body ramp. Slime is lit from above and pools at the base, so
  /// the gradient runs top-to-bottom rather than corner-to-corner.
  LinearGradient get bodyGradient => LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [glow, light, mid, deep, shade],
    stops: const [0, 0.24, 0.52, 0.79, 1],
  );

  /// The swatch shown in the customizer grid.
  LinearGradient get swatch => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [light, deep],
  );
}

const slopPalettes = <SlopPalette>[
  SlopPalette(
    id: 'tangerine',
    name: 'Tangerine',
    glow: Color(0xFFFFE9BE),
    light: Color(0xFFFFB13B),
    mid: Color(0xFFFF8A22),
    deep: Color(0xFFF4561D),
    shade: Color(0xFFB8300F),
    ink: Color(0xFF3B1206),
  ),
  SlopPalette(
    id: 'grape',
    name: 'Grape',
    glow: Color(0xFFF0E2FF),
    light: Color(0xFFC79BFF),
    mid: Color(0xFF9A5CF6),
    deep: Color(0xFF7431DC),
    shade: Color(0xFF45178F),
    ink: Color(0xFF260A4D),
  ),
  SlopPalette(
    id: 'mint',
    name: 'Mint',
    glow: Color(0xFFE4FFF0),
    light: Color(0xFF9BF3C6),
    mid: Color(0xFF48DC96),
    deep: Color(0xFF15B36D),
    shade: Color(0xFF067044),
    ink: Color(0xFF043723),
  ),
  SlopPalette(
    id: 'bubblegum',
    name: 'Bubblegum',
    glow: Color(0xFFFFE7F1),
    light: Color(0xFFFFAAD0),
    mid: Color(0xFFFF6FAE),
    deep: Color(0xFFEF3B88),
    shade: Color(0xFFA8145B),
    ink: Color(0xFF4E0526),
    cheek: Color(0xFFFF4F93),
  ),
  SlopPalette(
    id: 'blueberry',
    name: 'Blueberry',
    glow: Color(0xFFE0F0FF),
    light: Color(0xFF93C6FF),
    mid: Color(0xFF4A93FF),
    deep: Color(0xFF2B6BFF),
    shade: Color(0xFF123C86),
    ink: Color(0xFF0A2050),
  ),
  SlopPalette(
    id: 'lime',
    name: 'Lime',
    glow: Color(0xFFF8FFD8),
    light: Color(0xFFDDF97C),
    mid: Color(0xFFAEE62E),
    deep: Color(0xFF7CBB10),
    shade: Color(0xFF477207),
    ink: Color(0xFF243C03),
  ),
  SlopPalette(
    id: 'aqua',
    name: 'Aqua',
    glow: Color(0xFFDFFCFF),
    light: Color(0xFF8AEBF7),
    mid: Color(0xFF32C8DF),
    deep: Color(0xFF0E9ABB),
    shade: Color(0xFF055C74),
    ink: Color(0xFF03303E),
  ),
  SlopPalette(
    id: 'void',
    name: 'Void',
    glow: Color(0xFFB7C0D6),
    light: Color(0xFF6E778C),
    mid: Color(0xFF434B5C),
    deep: Color(0xFF272C38),
    shade: Color(0xFF12151C),
    ink: Color(0xFF05070B),
    cheek: Color(0xFF7E6BFF),
  ),
  SlopPalette(
    id: 'peach',
    name: 'Peach',
    glow: Color(0xFFFFEFE2),
    light: Color(0xFFFFC2A3),
    mid: Color(0xFFFF9670),
    deep: Color(0xFFEE6A45),
    shade: Color(0xFFA83C23),
    ink: Color(0xFF4A1608),
  ),
  SlopPalette(
    id: 'lavender',
    name: 'Lavender',
    glow: Color(0xFFF6EFFF),
    light: Color(0xFFD4BEFF),
    mid: Color(0xFFB295F0),
    deep: Color(0xFF8E6BD6),
    shade: Color(0xFF573C91),
    ink: Color(0xFF2C1B52),
  ),
  SlopPalette(
    id: 'ember',
    name: 'Ember',
    glow: Color(0xFFFFD9B0),
    light: Color(0xFFFF8B5E),
    mid: Color(0xFFF4522E),
    deep: Color(0xFFC42714),
    shade: Color(0xFF751007),
    ink: Color(0xFF3A0703),
  ),
  SlopPalette(
    id: 'butter',
    name: 'Butter',
    glow: Color(0xFFFFFBE0),
    light: Color(0xFFFFEB8F),
    mid: Color(0xFFFFD43B),
    deep: Color(0xFFE0AC00),
    shade: Color(0xFF8F6C00),
    ink: Color(0xFF453200),
  ),
  SlopPalette(
    id: 'rose',
    name: 'Rose',
    glow: Color(0xFFFFEDF2),
    light: Color(0xFFFFB3C6),
    mid: Color(0xFFF5789B),
    deep: Color(0xFFD34A72),
    shade: Color(0xFF8C2145),
    ink: Color(0xFF430F21),
  ),
  SlopPalette(
    id: 'slate',
    name: 'Slate',
    glow: Color(0xFFE8EEF6),
    light: Color(0xFFAEBDD1),
    mid: Color(0xFF7A8CA5),
    deep: Color(0xFF52627A),
    shade: Color(0xFF2C3646),
    ink: Color(0xFF151C26),
  ),
  SlopPalette(
    id: 'toxic',
    name: 'Toxic',
    glow: Color(0xFFEBFFC7),
    light: Color(0xFFB6FF4D),
    mid: Color(0xFF7BE800),
    deep: Color(0xFF4EA800),
    shade: Color(0xFF2A6100),
    ink: Color(0xFF162F00),
    cheek: Color(0xFFD6FF6B),
  ),
  SlopPalette(
    id: 'ultraviolet',
    name: 'Ultraviolet',
    glow: Color(0xFFEBD6FF),
    light: Color(0xFFB07BFF),
    mid: Color(0xFF7A3BE8),
    deep: Color(0xFF4A15A8),
    shade: Color(0xFF250459),
    ink: Color(0xFF12002E),
    cheek: Color(0xFF00E5FF),
  ),
  SlopPalette(
    id: 'seafoam',
    name: 'Seafoam',
    glow: Color(0xFFEAFFF8),
    light: Color(0xFFA8F0DC),
    mid: Color(0xFF5FD6B8),
    deep: Color(0xFF27A98A),
    shade: Color(0xFF0F6552),
    ink: Color(0xFF063228),
  ),
  SlopPalette(
    id: 'cherry',
    name: 'Cherry',
    glow: Color(0xFFFFE0E0),
    light: Color(0xFFFF8A8A),
    mid: Color(0xFFF04848),
    deep: Color(0xFFC01F1F),
    shade: Color(0xFF750B0B),
    ink: Color(0xFF3B0303),
  ),
  SlopPalette(
    id: 'porcelain',
    name: 'Porcelain',
    glow: Color(0xFFFFFFFF),
    light: Color(0xFFF3F1EC),
    mid: Color(0xFFDDD9D0),
    deep: Color(0xFFB9B3A6),
    shade: Color(0xFF8A8478),
    ink: Color(0xFF3A362E),
  ),
  SlopPalette(
    id: 'cocoa',
    name: 'Cocoa',
    glow: Color(0xFFF3E2D2),
    light: Color(0xFFCBA37C),
    mid: Color(0xFF9E7350),
    deep: Color(0xFF6F4B31),
    shade: Color(0xFF41291A),
    ink: Color(0xFF23140C),
  ),
];

SlopPalette paletteById(String id) => slopPalettes.firstWhere(
  (p) => p.id == id,
  orElse: () => slopPalettes.first,
);

/// Pupil colour. [ink] follows the body palette; the rest are fixed so a Slop
/// can have eyes that contrast with its own colour.
enum SlopEyeColor {
  ink,
  cocoa,
  sky,
  forest,
  amber,
  violet,
  crimson,
  rose,
  teal,
  gold,
  silver,
  glow,
}

extension SlopEyeColorInfo on SlopEyeColor {
  String get label => switch (this) {
    SlopEyeColor.ink => 'Ink',
    SlopEyeColor.cocoa => 'Cocoa',
    SlopEyeColor.sky => 'Sky',
    SlopEyeColor.forest => 'Forest',
    SlopEyeColor.amber => 'Amber',
    SlopEyeColor.violet => 'Violet',
    SlopEyeColor.crimson => 'Crimson',
    SlopEyeColor.rose => 'Rose',
    SlopEyeColor.teal => 'Teal',
    SlopEyeColor.gold => 'Gold',
    SlopEyeColor.silver => 'Silver',
    SlopEyeColor.glow => 'Glow',
  };

  /// Null means "use the body palette's ink".
  Color? get color => switch (this) {
    SlopEyeColor.ink => null,
    SlopEyeColor.cocoa => const Color(0xFF5A3418),
    SlopEyeColor.sky => const Color(0xFF2E8BE6),
    SlopEyeColor.forest => const Color(0xFF2C8A4B),
    SlopEyeColor.amber => const Color(0xFFD98A12),
    SlopEyeColor.violet => const Color(0xFF8145E0),
    SlopEyeColor.crimson => const Color(0xFFC42035),
    SlopEyeColor.rose => const Color(0xFFE85C93),
    SlopEyeColor.teal => const Color(0xFF12A5A5),
    SlopEyeColor.gold => const Color(0xFFC9A227),
    SlopEyeColor.silver => const Color(0xFF8D97A6),
    SlopEyeColor.glow => const Color(0xFF35F0C0),
  };
}

enum SlopEyes {
  round,
  wide,
  sleepy,
  star,
  wink,
  cyclops,
  dot,
  kawaii,
  heart,
  angry,
  sparkle,
  spiral,
  visor,
  squint,
  three,
  many,
  liquid,
  crescent,
  velvetLash,
  slopCyclops,
  orbit,
}

enum SlopMouth {
  smile,
  grin,
  cat,
  smirk,
  oh,
  fang,
  flat,
  wavy,
  tongueOut,
  gasp,
  teeth,
  kiss,
  zigzag,
  drool,
  laugh,
  tinyFangs,
  uwu,
  bubble,
  jellyBean,
  nibble,
  glossySmile,
  gooberBite,
}

enum SlopHat {
  none,
  antenna,
  crown,
  cap,
  halo,
  horns,
  bow,
  beanie,
  sprout,
  propeller,
  star,
  headphones,
  tuft,
  mohawk,
  ponytail,
  afro,
  bangs,
  curls,
  mushroom,
  chefPuff,
  ideaWizard,
  satinBow,
  pearlTiara,
  blossomCrown,
  butterflyClips,
  mintedBeret,
  itCouldBeWorse,
  globalChampion,
}

/// Optional backwear worn independently of face accessories, aura and headgear.
/// Existing and seeded looks keep an empty back until the player chooses one.
enum SlopCape { none, petal, midnight, red, satchel }

extension SlopCapeLabel on SlopCape {
  String get label => switch (this) {
    SlopCape.none => 'No tail',
    SlopCape.petal => 'Petal tail',
    SlopCape.midnight => 'Comet tail',
    SlopCape.red => 'Cherry curl',
    SlopCape.satchel => 'Bud tail',
  };
}

enum SlopPattern {
  none,
  spots,
  stripes,
  stars,
  swirl,
  drips,
  bubbles,
  checker,
  sparkles,
  hearts,
  camo,
  lavaLamp,
  topographic,
  confetti,
  nebula,
  kintsugi,
  fruitSlices,
  gummyWorms,
  arcadeBits,
  ginghamBloom,
  claimGrid,
  slopCode,
  pixelPetal,
  cloudQuilt,
  itCouldBeWorseRobot,
}

/// The physical material of a Slop. Colour answers "which Slop is this?";
/// finish answers "how rare does it feel?" and is the primary collectible
/// skin slot sold and dropped by the Slop Shop.
enum SlopFinish {
  jelly,
  gummy,
  pearl,
  galaxy,
  molten,
  chrome,
  hologram,
  aurora,
  crystal,
  obsidian,
  firstBatch,
  clearGlass,
  gold,
  wildfire,
  celPop,
  tidepool,
}

/// A lightweight effect orbiting the pet. Auras never obscure the face, which
/// keeps even legendary Slops readable in tiny feed/profile avatars.
enum SlopAura {
  none,
  bubbles,
  stardust,
  embers,
  hearts,
  glitch,
  orbit,
  fireflies,
  lightning,
  portal,
  prismatic,
  sloplings,
  petals,
  ideaComets,
  soundRings,
  echoTrail,
  ribbonTrail,
  coinChorus,
  dewdrops,
  moonMotes,
}

/// The overall silhouette. Slime is still slime — this changes how it sits.
/// `droplet` is retained as the persisted compatibility ID for Square.
enum SlopBody {
  classic,
  tall,
  wide,
  droplet,
  capsule,
  cloud,
  star,
  heart,
  ghost,
  triangle,
}

/// Something worn on the face itself, on top of whatever eyes are chosen.
enum SlopAccessory {
  none,
  glasses,
  shades,
  freckles,
  sticker,
  bandage,
  monocle,
  eyepatch,
  mustache,
  tear,
  mask,
}

extension SlopEyesLabel on SlopEyes {
  String get label => switch (this) {
    SlopEyes.round => 'Round',
    SlopEyes.wide => 'Wide',
    SlopEyes.sleepy => 'Sleepy',
    SlopEyes.star => 'Star',
    SlopEyes.wink => 'Wink',
    SlopEyes.cyclops => 'Cyclops',
    SlopEyes.dot => 'Dot',
    SlopEyes.kawaii => 'Kawaii',
    SlopEyes.heart => 'Heart',
    SlopEyes.angry => 'Angry',
    SlopEyes.sparkle => 'Sparkle',
    SlopEyes.spiral => 'Spiral',
    SlopEyes.visor => 'Bubble Visor',
    SlopEyes.squint => 'Squint',
    SlopEyes.three => 'Three',
    SlopEyes.many => 'Ten eyes',
    SlopEyes.liquid => 'Liquid drops',
    SlopEyes.crescent => 'Crescent',
    SlopEyes.velvetLash => 'Velvet lash',
    SlopEyes.slopCyclops => 'Living Slop Eye',
    SlopEyes.orbit => 'Tiny planets',
  };
}

extension SlopMouthLabel on SlopMouth {
  String get label => switch (this) {
    SlopMouth.smile => 'Smile',
    SlopMouth.grin => 'Grin',
    SlopMouth.cat => 'Cat',
    SlopMouth.smirk => 'Smirk',
    SlopMouth.oh => 'Oh!',
    SlopMouth.fang => 'Fang',
    SlopMouth.flat => 'Flat',
    SlopMouth.wavy => 'Wavy',
    SlopMouth.tongueOut => 'Blep',
    SlopMouth.gasp => 'Gasp',
    SlopMouth.teeth => 'Teeth',
    SlopMouth.kiss => 'Kiss',
    SlopMouth.zigzag => 'Zigzag',
    SlopMouth.drool => 'Drool',
    SlopMouth.laugh => 'Laugh',
    SlopMouth.tinyFangs => 'Twin fangs',
    SlopMouth.uwu => 'UwU',
    SlopMouth.bubble => 'Bubble gum',
    SlopMouth.jellyBean => 'Jelly bean',
    SlopMouth.nibble => 'Nibble',
    SlopMouth.glossySmile => 'Glossy smile',
    SlopMouth.gooberBite => 'Goober bite',
  };
}

extension SlopHatLabel on SlopHat {
  String get label => switch (this) {
    SlopHat.none => 'Bare',
    SlopHat.antenna => 'Antenna',
    SlopHat.crown => 'Crown',
    SlopHat.cap => 'Cap',
    SlopHat.halo => 'Halo',
    SlopHat.horns => 'Horns',
    SlopHat.bow => 'Bow',
    SlopHat.beanie => 'Beanie',
    SlopHat.sprout => 'Sprout',
    SlopHat.propeller => 'Propeller',
    SlopHat.star => 'Star',
    SlopHat.headphones => 'Headphones',
    SlopHat.tuft => 'Tuft',
    SlopHat.mohawk => 'Sprout Crest',
    SlopHat.ponytail => 'Comet Clip',
    SlopHat.afro => 'Paper Sail',
    SlopHat.bangs => 'Cloud Band',
    SlopHat.curls => 'Daisy Clips',
    SlopHat.mushroom => 'Mushroom cap',
    SlopHat.chefPuff => 'Maker’s toque',
    SlopHat.ideaWizard => 'Idea wizard',
    SlopHat.satinBow => 'Satin bow',
    SlopHat.pearlTiara => 'Pearl tiara',
    SlopHat.blossomCrown => 'Blossom crown',
    SlopHat.butterflyClips => 'Butterfly clips',
    SlopHat.mintedBeret => 'Minted beret',
    SlopHat.itCouldBeWorse => 'It Could Be Worse',
    SlopHat.globalChampion => 'Global Champion',
  };
}

extension SlopPatternLabel on SlopPattern {
  String get label => switch (this) {
    SlopPattern.none => 'Clean',
    SlopPattern.spots => 'Spots',
    SlopPattern.stripes => 'Stripes',
    SlopPattern.stars => 'Stars',
    SlopPattern.swirl => 'Swirl',
    SlopPattern.drips => 'Drips',
    SlopPattern.bubbles => 'Bubbles',
    SlopPattern.checker => 'Checker',
    SlopPattern.sparkles => 'Sparkles',
    SlopPattern.hearts => 'Hearts',
    SlopPattern.camo => 'Camo',
    SlopPattern.lavaLamp => 'Lava lamp',
    SlopPattern.topographic => 'Topographic',
    SlopPattern.confetti => 'Confetti',
    SlopPattern.nebula => 'Nebula',
    SlopPattern.kintsugi => 'Kintsugi',
    SlopPattern.fruitSlices => 'Jelly citrus',
    SlopPattern.gummyWorms => 'Worm jar',
    SlopPattern.arcadeBits => 'Arcade bits',
    SlopPattern.ginghamBloom => 'Gingham bloom',
    SlopPattern.claimGrid => 'Claim grid',
    SlopPattern.slopCode => 'SLOP Code',
    SlopPattern.pixelPetal => 'Lunar Glaze',
    SlopPattern.cloudQuilt => 'Cloud Quilt',
    SlopPattern.itCouldBeWorseRobot => 'It Could Be Worse Robot',
  };
}

extension SlopFinishLabel on SlopFinish {
  String get label => switch (this) {
    SlopFinish.jelly => 'Living jelly',
    SlopFinish.gummy => 'Soft gummy',
    SlopFinish.pearl => 'Pearlescent',
    SlopFinish.galaxy => 'Deep space',
    SlopFinish.molten => 'Molten core',
    SlopFinish.chrome => 'Liquid chrome',
    SlopFinish.hologram => 'Hologel',
    SlopFinish.aurora => 'Aurora gel',
    SlopFinish.crystal => 'Prism crystal',
    SlopFinish.obsidian => 'Void obsidian',
    SlopFinish.firstBatch => 'First Batch',
    SlopFinish.clearGlass => 'Clear glass',
    SlopFinish.gold => 'Sunforge gold',
    SlopFinish.wildfire => 'Wildfire gel',
    SlopFinish.celPop => 'Cel pop',
    SlopFinish.tidepool => 'Tidepool glass',
  };
}

extension SlopAuraLabel on SlopAura {
  String get label => switch (this) {
    SlopAura.none => 'No aura',
    SlopAura.bubbles => 'Bubbles',
    SlopAura.stardust => 'Stardust',
    SlopAura.embers => 'Embers',
    SlopAura.hearts => 'Heart pop',
    SlopAura.glitch => 'Glitch',
    SlopAura.orbit => 'Mini orbit',
    SlopAura.fireflies => 'Fireflies',
    SlopAura.lightning => 'Lightning',
    SlopAura.portal => 'Gel portal',
    SlopAura.prismatic => 'Prismatic',
    SlopAura.sloplings => 'Tiny Slops',
    SlopAura.petals => 'Petal float',
    SlopAura.ideaComets => 'Idea comets',
    SlopAura.soundRings => 'Sound rings',
    SlopAura.echoTrail => 'Echo Slops',
    SlopAura.ribbonTrail => 'Ribbon trail',
    SlopAura.coinChorus => 'Coin chorus',
    SlopAura.dewdrops => 'Dewdrops',
    SlopAura.moonMotes => 'Moon motes',
  };
}

extension SlopBodyLabel on SlopBody {
  String get label => switch (this) {
    SlopBody.classic => 'Bloom',
    SlopBody.tall => 'Pebble',
    SlopBody.wide => 'Clover',
    // Keep the serialized `droplet` value for existing saved looks and server
    // receipts, but present its redesigned silhouette as Square everywhere.
    SlopBody.droplet => 'Pillow',
    SlopBody.capsule => 'Pill',
    SlopBody.cloud => 'Cloud',
    SlopBody.star => 'Sunbeam',
    SlopBody.heart => 'Sweetheart',
    SlopBody.ghost => 'Little ghost',
    SlopBody.triangle => 'Soft triangle',
  };
}

extension SlopAccessoryLabel on SlopAccessory {
  String get label => switch (this) {
    SlopAccessory.none => 'None',
    SlopAccessory.glasses => 'Glasses',
    SlopAccessory.shades => 'Shades',
    SlopAccessory.freckles => 'Freckles',
    SlopAccessory.sticker => 'Star sticker',
    SlopAccessory.bandage => 'Bandage',
    SlopAccessory.monocle => 'Monocle',
    SlopAccessory.eyepatch => 'Eyepatch',
    SlopAccessory.mustache => 'Mustache',
    SlopAccessory.tear => 'Tear',
    SlopAccessory.mask => 'Mask',
  };
}

/// One saved Slop. Immutable — [copyWith] produces the next look so the
/// customizer can preview a change before it is committed.
class SlopLook {
  static const int designVersion = 7;

  const SlopLook({
    this.paletteId = 'tangerine',
    this.eyes = SlopEyes.cyclops,
    this.eyeColor = SlopEyeColor.ink,
    this.mouth = SlopMouth.smile,
    this.hat = SlopHat.none,
    this.pattern = SlopPattern.none,
    this.finish = SlopFinish.jelly,
    this.aura = SlopAura.bubbles,
    this.body = SlopBody.ghost,
    this.accessory = SlopAccessory.none,
    this.cape = SlopCape.none,
    this.ownerId,
    this.blush = true,
    this.name = 'Slop',
  });

  final String paletteId;
  final SlopEyes eyes;
  final SlopEyeColor eyeColor;
  final SlopMouth mouth;
  final SlopHat hat;
  final SlopPattern pattern;
  final SlopFinish finish;
  final SlopAura aura;
  final SlopBody body;
  final SlopAccessory accessory;
  final SlopCape cape;

  /// Trusted projection context, never serialized inside a user-editable look.
  /// The live Champion-crown display gate uses the actual portrait owner.
  final String? ownerId;
  final bool blush;
  final String name;

  static const fallback = SlopLook();

  /// A stable, distinct Slop derived from a name or user id.
  ///
  /// Identity is the Slop now, so everyone needs one the moment you see them —
  /// in a comment, on a leaderboard, on a feed card — long before their real
  /// saved look has been fetched. The same seed always produces the same Slop,
  /// so a creator doesn't visibly change between screens.
  factory SlopLook.fromSeed(String seed) {
    final rawSeed = seed.trim();
    if (rawSeed.isEmpty) return fallback;
    // v5 makes the cyclops face the species-level signature. Earlier recipes
    // could still land on an ugly visor + bow + teeth collision even with
    // weights. Earned cosmetics provide spectacle; generated pets begin clean.
    // The salt is part of the identity recipe, so all surfaces still agree.
    final clean = 'slop-look-v5:${rawSeed.toLowerCase()}';
    // FNV-1a: a small, stable hash. Dart's String.hashCode is NOT stable across
    // runs, which would give the same person a different Slop every launch.
    var h = 0x811c9dc5;
    for (final unit in clean.codeUnits) {
      h ^= unit;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    int mixed(int salt) {
      var x = (h ^ (0x9E3779B9 * (salt + 1))) & 0xFFFFFFFF;
      x ^= x >> 16;
      x = (x * 0x85EBCA6B) & 0xFFFFFFFF;
      x ^= x >> 13;
      x = (x * 0xC2B2AE35) & 0xFFFFFFFF;
      return (x ^ (x >> 16)) & 0x7FFFFFFF;
    }

    int pick(int slot, int count) => mixed(slot) % count;
    T weighted<T>(int slot, List<(T, int)> choices) {
      final total = choices.fold<int>(0, (sum, item) => sum + item.$2);
      var n = mixed(slot) % total;
      for (final choice in choices) {
        if (n < choice.$2) return choice.$1;
        n -= choice.$2;
      }
      return choices.last.$1;
    }

    return SlopLook(
      paletteId: slopPalettes[pick(0, slopPalettes.length)].id,
      eyes: SlopEyes.cyclops,
      eyeColor: weighted(4, const [
        (SlopEyeColor.ink, 10),
        (SlopEyeColor.cocoa, 3),
        (SlopEyeColor.sky, 2),
        (SlopEyeColor.forest, 2),
        (SlopEyeColor.violet, 1),
      ]),
      mouth: weighted(6, const [
        (SlopMouth.smile, 12),
        (SlopMouth.smirk, 5),
        (SlopMouth.cat, 3),
        (SlopMouth.grin, 2),
      ]),
      hat: weighted(8, const [
        (SlopHat.none, 24),
        // Seeded identities only use free base headwear. Sprout is a paid
        // wardrobe product and must never appear without an entitlement.
        (SlopHat.cap, 3),
        (SlopHat.tuft, 2),
      ]),
      pattern: SlopPattern.none,
      finish: SlopFinish.jelly,
      aura: weighted(10, const [(SlopAura.none, 5), (SlopAura.bubbles, 3)]),
      body: weighted(3, const [
        (SlopBody.classic, 5),
        (SlopBody.wide, 3),
        (SlopBody.tall, 2),
        (SlopBody.droplet, 1),
      ]),
      accessory: SlopAccessory.none,
      blush: mixed(7) % 10 < 7,
      name: 'Slop',
    );
  }

  SlopPalette get palette => paletteById(paletteId);

  SlopLook copyWith({
    String? paletteId,
    SlopEyes? eyes,
    SlopEyeColor? eyeColor,
    SlopMouth? mouth,
    SlopHat? hat,
    SlopPattern? pattern,
    SlopFinish? finish,
    SlopAura? aura,
    SlopBody? body,
    SlopAccessory? accessory,
    SlopCape? cape,
    String? ownerId,
    bool clearOwnerId = false,
    bool? blush,
    String? name,
  }) => SlopLook(
    paletteId: paletteId ?? this.paletteId,
    eyes: eyes ?? this.eyes,
    eyeColor: eyeColor ?? this.eyeColor,
    mouth: mouth ?? this.mouth,
    hat: hat ?? this.hat,
    pattern: pattern ?? this.pattern,
    finish: finish ?? this.finish,
    aura: aura ?? this.aura,
    body: body ?? this.body,
    accessory: accessory ?? this.accessory,
    cape: cape ?? this.cape,
    ownerId: clearOwnerId ? null : ownerId ?? this.ownerId,
    blush: blush ?? this.blush,
    name: name ?? this.name,
  );

  Map<String, dynamic> toJson() => {
    'designVersion': designVersion,
    'palette': paletteId,
    'eyes': eyes.name,
    'eyeColor': eyeColor.name,
    'mouth': mouth.name,
    'hat': hat.name,
    'pattern': pattern.name,
    'finish': finish.name,
    'aura': aura.name,
    'body': body.name,
    'accessory': accessory.name,
    'cape': cape.name,
    'blush': blush,
    'name': name,
  };

  /// Tolerant of missing/renamed fields — an unknown value falls back to the
  /// default rather than throwing and wiping the user's Slop.
  factory SlopLook.fromJson(Map<String, dynamic> json, {String? ownerId}) {
    T pick<T extends Enum>(List<T> values, Object? raw, T fallback) {
      if (raw is! String) return fallback;
      for (final v in values) {
        if (v.name == raw) return v;
      }
      return fallback;
    }

    final rawName = json['name'];
    return SlopLook(
      paletteId: json['palette'] is String
          ? paletteById(json['palette'] as String).id
          : 'tangerine',
      eyes: pick(SlopEyes.values, json['eyes'], SlopEyes.cyclops),
      eyeColor: pick(SlopEyeColor.values, json['eyeColor'], SlopEyeColor.ink),
      mouth: pick(SlopMouth.values, json['mouth'], SlopMouth.smile),
      hat: pick(SlopHat.values, json['hat'], SlopHat.none),
      pattern: pick(SlopPattern.values, json['pattern'], SlopPattern.none),
      finish: pick(SlopFinish.values, json['finish'], SlopFinish.jelly),
      aura: pick(SlopAura.values, json['aura'], SlopAura.bubbles),
      body: pick(SlopBody.values, json['body'], SlopBody.classic),
      accessory: pick(
        SlopAccessory.values,
        json['accessory'],
        SlopAccessory.none,
      ),
      cape: pick(SlopCape.values, json['cape'], SlopCape.none),
      ownerId: ownerId,
      blush: json['blush'] is bool ? json['blush'] as bool : true,
      name: rawName is String && rawName.trim().isNotEmpty
          ? rawName.trim()
          : 'Slop',
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SlopLook &&
      other.paletteId == paletteId &&
      other.eyes == eyes &&
      other.eyeColor == eyeColor &&
      other.mouth == mouth &&
      other.hat == hat &&
      other.pattern == pattern &&
      other.finish == finish &&
      other.aura == aura &&
      other.body == body &&
      other.accessory == accessory &&
      other.cape == cape &&
      (hat != SlopHat.globalChampion || other.ownerId == ownerId) &&
      other.blush == blush &&
      other.name == name;

  @override
  int get hashCode => Object.hash(
    paletteId,
    eyes,
    eyeColor,
    mouth,
    hat,
    pattern,
    finish,
    aura,
    body,
    accessory,
    cape,
    hat == SlopHat.globalChampion ? ownerId : null,
    blush,
    name,
  );
}

/// Resolves combinations whose geometry cannot occupy the same face cleanly.
/// This is intentionally small: creative combinations remain possible, while
/// known collisions (two-frame glasses on one/three-eye faces, eye gear over a
/// visor) can never leak from the editor into feed/profile/chat renderers.
SlopLook normalizeSlopPairing(SlopLook look) {
  const doubleFrame = {SlopAccessory.glasses, SlopAccessory.shades};
  const eyeGear = {
    SlopAccessory.glasses,
    SlopAccessory.shades,
    SlopAccessory.monocle,
    SlopAccessory.eyepatch,
    SlopAccessory.mask,
  };
  var accessory = look.accessory;
  if ((look.eyes == SlopEyes.cyclops || look.eyes == SlopEyes.slopCyclops) &&
      doubleFrame.contains(accessory)) {
    accessory = SlopAccessory.none;
  }
  if (look.eyes == SlopEyes.three && eyeGear.contains(accessory)) {
    accessory = SlopAccessory.none;
  }
  if (look.eyes == SlopEyes.visor && eyeGear.contains(accessory)) {
    accessory = SlopAccessory.none;
  }
  if (accessory == look.accessory) return look;
  return look.copyWith(accessory: accessory);
}
