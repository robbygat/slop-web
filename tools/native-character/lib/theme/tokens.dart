import 'package:flutter/material.dart';

/// slop.game design tokens.
///
/// The shell is a warm, dark playground for the player's bright Slop and game
/// art. Stable neutrals live here; personalized interactive color is derived
/// from the equipped Slop in `SlopUiTheme`.
///
/// Semantics matter here: [ink] is the **foreground / text** color (near-white
/// on dark) and is the default for every [T] text style. [black] is the
/// **true-black brand/art** color — the slop disc, game pupils, full-bleed game
/// scaffolds — and must never be used for text on a dark surface.
class S {
  S._();

  // ---- Core palette -------------------------------------------------------
  static const Color ink = Color(0xFFFFF8EF); // warm primary foreground
  static const Color soft = Color(0xFFCDBFD4); // secondary text
  static const Color black = Color(0xFF080807); // brand disc / art / scaffolds
  static const Color onLight = Color(0xFF24102D); // text on cream/light fills
  static const Color onAccent = onLight; // checked per personalized fill
  static const Color el = Color(0xFFFFB13B); // warm fallback accent
  static const Color pk = Color(0xFFFF6B9D); // pink accent, rare
  static const Color y = Color(0xFFEFCB68); // coin / reward accent
  static const Color wh = Color(0xFFFFFFFF);
  static const Color mint = Color(0xFF5FE6C4); // "live" / online state
  static const Color coral = Color(0xFFFF5D24); // playful brand edge

  // ---- Warm dark surfaces -------------------------------------------------
  // A layered plum ladder — never pure black. Cards, inputs, and chips remain
  // distinct while the warm base connects app chrome to the Slop character.
  // (True black `black` is reserved for the brand disc / full-bleed game art.)
  static const Color bg = Color(0xFF100918); // app background / startup plum
  static const Color surface = Color(0xFF1A1222); // cards
  static const Color surfaceHi = Color(0xFF261B30); // inputs / nested
  static const Color surfaceTop = Color(0xFF342541); // elevated chips / hovers
  static const Color hairline = Color(0x24FFF8EF); // ~14% cream border
  // Opaque control boundary: >= 3:1 against [surfaceHi]. Decorative strokes
  // continue to use [hairline] so cards and dividers stay quiet.
  static const Color controlOutline = Color(0xFF8D7C96);
  static const Color line = Color(0x14FFF8EF); // faint divider

  // NOTE: [surfaceTop] is the lightest plum step, for elements that sit on
  // top of an already-elevated surface (a chip on a card, a hovered row), so
  // nested controls do not collapse into one flat field.

  // ---- Spacing ------------------------------------------------------------
  static const double space2 = 2;
  static const double space4 = 4;
  static const double space8 = 8;
  static const double space12 = 12;
  static const double space16 = 16;
  static const double space20 = 20;
  static const double space24 = 24;
  static const double space32 = 32;
  static const double screenGutter = space20;
  static const double controlMinHeight = 48;

  // ---- Radii --------------------------------------------------------------
  static const double rPill = 999;
  static const BorderRadius pill = BorderRadius.all(Radius.circular(999));
  static const BorderRadius card = BorderRadius.all(Radius.circular(24));
  static const BorderRadius feature = BorderRadius.all(Radius.circular(28));
  static const BorderRadius bar = BorderRadius.all(Radius.circular(20));
  static const BorderRadius tile = BorderRadius.all(Radius.circular(16));

  // ---- Shadows (deeper, for dark surfaces) --------------------------------
  static const List<BoxShadow> soft1 = [
    BoxShadow(color: Color(0x40000000), blurRadius: 18, offset: Offset(0, 6)),
  ];
  static const List<BoxShadow> soft2 = [
    BoxShadow(color: Color(0x59000000), blurRadius: 36, offset: Offset(0, 16)),
  ];
  static List<BoxShadow> glow(Color c, {double a = 0.28, double blur = 24}) => [
    BoxShadow(
      color: c.withValues(alpha: a),
      blurRadius: blur,
      spreadRadius: 0,
    ),
  ];

  // ---- Brand gradients ----------------------------------------------------
  /// Download progress red palette.
  static const Color downloadRedDeep = Color(0xFFE8294F);
  static const Color downloadRedLight = Color(0xFFFF647D);

  /// Contrast-safe candy fallback for legacy contexts that cannot read the
  /// equipped Slop. Every stop supports the white foreground those surfaces
  /// already use; normal app controls use `SlopUiTheme.accentGradient`.
  static const LinearGradient cook = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFB8300F), Color(0xFF9F1239), Color(0xFF6D287E)],
  );

  static const LinearGradient blueGlow = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [surfaceHi, bg],
  );

  /// Warm fallback for the app/agent logo mark.
  static const LinearGradient brand = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [ink, Color(0xFFFFB13B)],
  );

  /// Animated-feeling fallback used when the hero video can't play.
  static const LinearGradient heroFallback = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [bg, surfaceTop, Color(0xFF09050D)],
    stops: [0.0, 0.55, 1.0],
  );

  /// Bright Slop-derived content accents (all read on the warm dark shell).
  static const List<Color> avatarColors = [
    Color(0xFFFFB13B), // tangerine
    Color(0xFFC79BFF), // grape
    Color(0xFF9BF3C6), // mint
    Color(0xFFFFAAD0), // bubblegum
    Color(0xFF93C6FF), // blueberry
    Color(0xFFDDF97C), // lime
  ];

  /// The ONE deterministic accent for a piece of content (a game title, a
  /// handle). Use this everywhere a game needs "its" color — challenge chips,
  /// the game-over card, ambient glows — so the same game is always the same
  /// hue across the app instead of each screen hashing its own.
  static Color accentOf(String seed) =>
      avatarColors[seed.hashCode.abs() % avatarColors.length];

  // ---- Motion (ONE feel for the whole app) --------------------------------
  // Every entrance, switch, and press settle should use these — consistent
  // physics is what reads as "designed" instead of assembled. Quick = presses
  // and toggles; smooth = overlays, sheets, and page-level entrances.
  static const Curve snap = Curves.easeOutCubic;
  static const Curve bounce = Curves.easeOutBack;
  static const Duration press = Duration(milliseconds: 120);
  static const Duration quick = Duration(milliseconds: 180);
  static const Duration smooth = Duration(milliseconds: 320);
}
