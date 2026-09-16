import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/slop_look_store.dart';
import '../models/slop_look.dart';
import '../services/slop_champion_authority.dart';
import '../theme/tokens.dart';
import '../config/product_features.dart';
import 'slop_coin_mark.dart';
import 'slop_cape.dart';

part 'slop_form_renderer.dart';
part 'slop_headpieces.dart';

/// Slop's permanent brand palette.
///
/// Orange is the character, coral is the active edge, and the warm cream
/// highlight makes the material read as glossy, moldable slime. Per-user
/// colour now lives in [SlopLook]; these constants stay as the brand chrome
/// (bubbles, buttons, surfaces) that surrounds the character.
abstract final class SlopBrand {
  static const glow = Color(0xFFFFE1A6);
  static const orange = Color(0xFFFFB13B);
  static const tangerine = Color(0xFFFF8A22);
  static const coral = Color(0xFFFF5D24);
  static const ember = Color(0xFFE74318);
  static const deep = Color(0xFFA72A13);
  static const ink = Color(0xFF391407);
  static const cloud = Color(0xFFFFF8EF);
  static const cheek = Color(0xFFFF7595);

  /// Compatibility names used by older Slop surfaces while they migrate to
  /// the character palette. They intentionally resolve to the new brand.
  static const lime = glow;
  static const green = tangerine;
  static const purple = orange;
  static const violet = tangerine;
  static const blue = coral;
  static const forest = ink;
  static const cream = cloud;

  static const bodyGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [glow, orange, tangerine, coral, ember, deep],
    stops: [0, 0.18, 0.42, 0.66, 0.84, 1],
  );
}

/// A small, reusable emotional vocabulary keeps Slop expressive without
/// turning every screen into a different mascot.
enum SlopEmotion { happy, curious, excited, thinking, proud }

/// Optional presentation treatment layered inside the canonical live body.
///
/// Standard is intentionally the default so existing Slop surfaces retain
/// their exact raster. Toon adds broad, centred volume fields for the large
/// interactive Buddy without replacing any material or cosmetic artwork.
enum SlopSurfaceStyle { standard, toon, clay, paper }

/// One bounded surface-space pose shared by every live toon layer.
///
/// This is deliberately normalized rather than pixel based: the same pose can
/// drive the standalone Buddy, Studio's independently composed mouth anatomy,
/// compact profile previews, and renderer tests without creating a Cartesian
/// sprite atlas. Positive [turn] means Slop is presenting its right cheek.
@immutable
class SlopToonDepthPose {
  const SlopToonDepthPose({
    required this.orientationAngle,
    required this.turn,
    required this.frontVisibility,
    required this.backVisibility,
    required this.bodyScaleX,
    required this.faceOffsetX,
    required this.faceScaleX,
    required this.patternOffsetX,
    required this.patternScaleX,
    required this.hatOffsetX,
    required this.hatTilt,
    required this.hatScaleX,
    required this.lightOffsetX,
    required this.auraOrbitOffsetX,
  });

  static const neutral = SlopToonDepthPose(
    orientationAngle: 0,
    turn: 0,
    frontVisibility: 1,
    backVisibility: 0,
    bodyScaleX: 1,
    faceOffsetX: 0,
    faceScaleX: 1,
    patternOffsetX: 0,
    patternScaleX: 1,
    hatOffsetX: 0,
    hatTilt: 0,
    hatScaleX: 1,
    lightOffsetX: 0,
    auraOrbitOffsetX: 0,
  );

  /// Signed orientation in radians. Zero is front, +/-pi is back.
  final double orientationAngle;

  /// Normalized yaw in the inclusive -1...1 range.
  final double turn;

  /// Presentation weights for front-authored traits and the faceless rear
  /// cel-light treatment. Both are exactly zero at their opposite hemisphere;
  /// the live body clip, rather than overlapping alpha cards, owns the tangent.
  final double frontVisibility;
  final double backVisibility;

  /// Whole-volume foreshortening. Vertical scale stays owned by the gel pose.
  final double bodyScaleX;

  /// Surface attachment channels, expressed in fractions of body width.
  final double faceOffsetX;
  final double patternOffsetX;
  final double hatOffsetX;
  final double auraOrbitOffsetX;

  /// Perspective compression for live face, markings, and crown artwork.
  final double faceScaleX;
  final double patternScaleX;
  final double hatScaleX;

  /// Crown tilt in radians and the small cel-light response to the turn.
  final double hatTilt;
  final double lightOffsetX;

  /// Signed depth of the front-authored face longitude. `1` is the directly
  /// facing front plane, `0` is the silhouette tangent, and negative values
  /// are behind the gel. This is intentionally exposed separately from alpha:
  /// painters use it for surface contact/occlusion while tests can prove that
  /// the face never takes the shorter path through the middle of the body.
  double get faceSurfaceDepth => math.cos(orientationAngle);

  /// Continuous signed surface anchor for the face longitude.
  ///
  /// A longitude on a rounded volume reaches +/- one half body width at its
  /// tangent. The canonical painter clips the complete compressed face plane
  /// to the live silhouette, so no eye, mouth, brow, or accessory can detach.
  double get faceSurfaceOffsetX => faceOffsetX;

  /// Crown-axis anchor used by headwear.
  ///
  /// The top pole is invariant under yaw, so this remains centered while the
  /// headwear's own x/z geometry and painter pass communicate orientation.
  double get crownSurfaceOffsetX => hatOffsetX;

  /// Near/rear crown depth. Kept continuous across both side tangents.
  double get crownSurfaceDepth => math.cos(orientationAngle);

  /// Painter-order switch for crown art crossing the silhouette tangent.
  ///
  /// Headwear is one opaque authored object. Alpha-blending duplicate front
  /// and rear passes made the equipped hat turn translucent at a true side
  /// view, so the body appeared through its contact band. Geometry remains
  /// continuous; only its placement before/after the gel changes here.
  double get crownFrontVisibility => crownSurfaceDepth >= 0 ? 1 : 0;

  double get crownRearVisibility => 1 - crownFrontVisibility;

  bool get isNeutral => orientationAngle.abs() < 0.000001;

  /// Painter's-algorithm depth for an elliptical orbit angle.
  ///
  /// Positive values are on the near/lower half of the orbit, negative values
  /// are behind Slop. The yaw offset keeps the orbit attached while the head
  /// presents a different cheek.
  double orbitDepthFor(double angle) {
    final safeAngle = angle.isFinite ? angle : 0.0;
    return math
        .sin(safeAngle + orientationAngle * 0.74 + turn * 0.16)
        .clamp(-1.0, 1.0);
  }

  /// Near particles grow subtly; rear particles recede without disappearing.
  double auraScaleForDepth(double depth) {
    final z = (depth.isFinite ? depth : 0.0).clamp(-1.0, 1.0);
    return 0.84 + (z + 1) * 0.10;
  }

  double auraOpacityForDepth(double depth) {
    final z = (depth.isFinite ? depth : 0.0).clamp(-1.0, 1.0);
    return 0.68 + (z + 1) * 0.14;
  }
}

/// Resolves every pseudo-3D attachment channel from one sanitized turn.
///
/// Reduced-motion callers receive an exact static front pose. Direct-manip-
/// ulation surfaces can opt out of that freeze before calling this helper, but
/// autonomous clocks must never leak motion into an accessibility rest frame.
SlopToonDepthPose slopToonDepthPoseFor({
  required double turn,
  bool reducedMotion = false,
}) {
  if (reducedMotion) return SlopToonDepthPose.neutral;
  final yaw = (turn.isFinite ? turn : 0.0).clamp(-1.0, 1.0);
  if (yaw.abs() < 0.000001) return SlopToonDepthPose.neutral;
  final edge = yaw.abs();
  return SlopToonDepthPose(
    orientationAngle: math.asin(yaw) * 0.30,
    turn: yaw,
    frontVisibility: 1,
    backVisibility: 0,
    bodyScaleX: 1 - edge * 0.075,
    faceOffsetX: yaw * 0.025,
    faceScaleX: 1 - edge * 0.115,
    patternOffsetX: yaw * 0.026,
    patternScaleX: 1 - edge * 0.055,
    hatOffsetX: 0,
    hatTilt: 0,
    hatScaleX: 1 - edge * 0.060,
    // The key remains top-left; only the cheek plane follows the living mass.
    lightOffsetX: yaw * 0.10,
    auraOrbitOffsetX: yaw * 0.040,
  );
}

/// Normalizes an arbitrary orientation to the shortest signed angle around
/// the front pose. This makes 0 and +/-2pi exact visual seams.
double slopToonNormalizeOrientation(double angle) {
  if (!angle.isFinite) return 0;
  const tau = math.pi * 2;
  var wrapped = (angle + math.pi) % tau;
  if (wrapped < 0) wrapped += tau;
  return wrapped - math.pi;
}

/// Resolves a true 0–360 degree 2.5D pose from one shared orientation.
///
/// Unlike [slopToonDepthPoseFor], which preserves the original shallow-yaw
/// contract, this path projects the complete front plane as one decal toward
/// the silhouette, culls it on the rear half, foreshortens the body at each
/// side, and keeps pattern, crown, cel light, and aura channels attached.
SlopToonDepthPose slopToonDepthPoseForAngle({
  required double angle,
  bool reducedMotion = false,
}) {
  if (reducedMotion) return SlopToonDepthPose.neutral;
  final orientation = slopToonNormalizeOrientation(angle);
  if (orientation.abs() < 0.000001) return SlopToonDepthPose.neutral;
  final side = math.sin(orientation);
  final facing = math.cos(orientation);
  final edge = side.abs();
  // A face painted on a globe has x = r*sin(yaw) and apparent width
  // proportional to max(0, cos(yaw)). Fade only across the final narrow front
  // tangent interval to absorb pixel quantization; the rear hemisphere is
  // exactly empty. The live body path provides the physical limb occlusion.
  final frontT = (facing / 0.14).clamp(0.0, 1.0);
  final front = frontT * frontT * (3 - 2 * frontT);
  final backT = (-facing / 0.14).clamp(0.0, 1.0);
  final back = backT * backT * (3 - 2 * backT);
  return SlopToonDepthPose(
    orientationAngle: orientation,
    turn: side,
    frontVisibility: front,
    backVisibility: back,
    bodyScaleX: 1 - edge * 0.16,
    faceOffsetX: side * 0.5,
    faceScaleX: math.max(0.0, facing),
    patternOffsetX: side * 0.105,
    patternScaleX: 0.38 + facing.abs() * 0.62,
    // Yaw leaves the top pole fixed. Headwear rotates around that centered
    // anchor instead of orbiting with the facial longitude.
    hatOffsetX: 0,
    hatTilt: 0,
    // Never mirror asymmetric hair. The retained side width represents the
    // topper's fore/aft volume while its front/rear pass supplies occlusion.
    hatScaleX: 0.62 + facing.abs() * 0.38,
    lightOffsetX: side * 0.16,
    auraOrbitOffsetX: side * 0.070,
  );
}

/// Compatibility hook for Studio's registered mouth overlay.
///
/// The baseline renderer uses the shared facial plane offset directly; there
/// is no independent per-eye surface projection.
double slopToonResolvedFaceSurfaceOffsetFor({
  required SlopLook look,
  required SlopToonDepthPose depthPose,
}) => depthPose.faceOffsetX;

/// Smoothly brings any manual/autonomous orientation to the nearest front
/// pose before mouth anatomy begins to expand.
///
/// Studio can feed its mouth-morph progress directly into [progress]. The
/// shortest signed route prevents a near-complete reverse spin when Slop was
/// looking just across the 0/2pi seam.
double slopToonFrontLockAngleFor(
  double angle, {
  required double progress,
  bool reducedMotion = false,
}) {
  if (reducedMotion) return 0;
  final p = progress.isFinite ? progress.clamp(0.0, 1.0) : 0.0;
  final smooth = p * p * (3 - 2 * p);
  return slopToonNormalizeOrientation(angle) * (1 - smooth);
}

/// Which half of a live aura is being composed around the body.
///
/// [all] preserves the legacy single-pass renderer for non-toon surfaces.
/// Toon composition uses [rear] before the body and [front] after the worn
/// traits, which gives orbiting effects truthful occlusion without bitmaps.
enum SlopAuraDepthPass { all, rear, front }

/// Painter-order slice for crown-mounted headwear.
///
/// Unlike facial artwork, a hat is a volume centred on the body's crown. Toon
/// composition paints its far shell before the gel and its near rim/details
/// after the gel. Direct canonical-renderer callers keep [all], which preserves
/// the established straight-on artwork exactly.
enum SlopHeadwearDepthPass { all, rear, front }

typedef _ProjectedCrownPoint = ({
  Offset point,
  double depth,
  double normalizedX,
});

/// Legacy per-feature profile presentation retained for non-production paint
/// experiments.
///
/// The live toon path no longer enables it: independently relocating sockets,
/// brows, and the mouth fights the shared globe projection and can place a
/// feature beyond the body. Production rotation uses one compressed face plane
/// clipped to the exact gel silhouette instead.
@immutable
class _SlopProfileFaceContext {
  const _SlopProfileFaceContext({
    required this.side,
    required this.amount,
    required this.bodyRect,
    required this.bodyPath,
    required this.faceCenterX,
    required this.faceScaleX,
  });

  final double side;
  final double amount;
  final Rect bodyRect;
  final Path bodyPath;
  final double faceCenterX;
  final double faceScaleX;

  double get nearDirection => -side.sign;
  double get farDirection => side.sign;

  bool isNear(double direction) => direction == 0 || direction == nearDirection;
  bool isFar(double direction) => direction != 0 && direction == farDirection;

  double contourXAt(double y) {
    var inside = bodyRect.center.dx;
    var outside = side > 0 ? bodyRect.right + 2 : bodyRect.left - 2;
    for (var step = 0; step < 20; step++) {
      final middle = (inside + outside) / 2;
      if (bodyPath.contains(Offset(middle, y))) {
        inside = middle;
      } else {
        outside = middle;
      }
    }
    return inside;
  }

  ({double centerX, double localScaleX}) transformFor({
    required double canonicalX,
    required double unit,
    required double direction,
    required double canonicalHalfWidth,
    required double surfaceY,
    double targetScaleX = 0.82,
  }) {
    final safeScale = math.max(0.001, faceScaleX);
    final seamFinalX = faceCenterX + safeScale * (canonicalX - faceCenterX);
    final edge = contourXAt(surfaceY);
    final desiredFinalScale = faceScaleX + (targetScaleX - faceScaleX) * amount;
    final finalHalfWidth = canonicalHalfWidth * desiredFinalScale;
    final targetX = isFar(direction)
        ? edge + side * (finalHalfWidth + unit * 0.35)
        : edge - side * (finalHalfWidth + unit * 1.35);
    final finalX = seamFinalX + (targetX - seamFinalX) * amount;
    return (
      centerX: faceCenterX + (finalX - faceCenterX) / safeScale,
      localScaleX: desiredFinalScale / safeScale,
    );
  }
}

_SlopProfileFaceContext? _slopProfileFaceContextFor(
  SlopToonDepthPose depthPose,
  Rect bodyRect,
  Path bodyPath,
  double faceCenterX, {
  bool independentFeatureProjection = false,
}) {
  // Keep the old mapper structurally available to its authored face helpers,
  // but never layer it over the canonical spherical projection. One shared
  // transform is what guarantees every trait crosses the tangent together.
  if (!independentFeatureProjection) return null;
  final degrees = depthPose.orientationAngle.abs() * 180 / math.pi;
  if (degrees <= 45 || degrees >= 120) return null;
  final raw = ((degrees - 45) / 45).clamp(0.0, 1.0);
  final amount = raw * raw * (3 - 2 * raw);
  return _SlopProfileFaceContext(
    side: depthPose.orientationAngle.sign,
    amount: amount,
    bodyRect: bodyRect,
    bodyPath: bodyPath,
    faceCenterX: faceCenterX,
    faceScaleX: depthPose.faceScaleX,
  );
}

/// Curved painter-order partition used by the split toon aura passes.
///
/// The partition lives in the aura's own orbital plane. Portal owns a low
/// floor plane; shoulder waves own a higher one; all other effects orbit the
/// body midpoint. A slight yaw slope prevents the result from reading as two
/// flat Cartesian half-sprites when Slop presents a cheek.
@visibleForTesting
Path slopAuraDepthClipPathFor({
  required Rect bodyRect,
  required SlopAura aura,
  required SlopAuraDepthPass pass,
  SlopToonDepthPose depthPose = SlopToonDepthPose.neutral,
}) {
  final expanded = bodyRect.inflate(bodyRect.width * 0.92);
  if (pass == SlopAuraDepthPass.all) return Path()..addRect(expanded);
  final horizon = switch (aura) {
    SlopAura.portal => bodyRect.bottom - bodyRect.width / 100 * 2,
    SlopAura.soundRings => bodyRect.top + bodyRect.height * 0.47,
    _ => bodyRect.center.dy,
  };
  final slope = depthPose.turn * bodyRect.height * 0.075;
  final leftY = horizon - slope;
  final rightY = horizon + slope;
  final centerLift = bodyRect.height * 0.025;
  final path = Path();
  if (pass == SlopAuraDepthPass.rear) {
    path
      ..moveTo(expanded.left, expanded.top)
      ..lineTo(expanded.right, expanded.top)
      ..lineTo(expanded.right, rightY)
      ..cubicTo(
        bodyRect.right,
        horizon - centerLift + slope * 0.45,
        bodyRect.left,
        horizon - centerLift - slope * 0.45,
        expanded.left,
        leftY,
      )
      ..close();
  } else {
    path
      ..moveTo(expanded.left, leftY)
      ..cubicTo(
        bodyRect.left,
        horizon - centerLift - slope * 0.45,
        bodyRect.right,
        horizon - centerLift + slope * 0.45,
        expanded.right,
        rightY,
      )
      ..lineTo(expanded.right, expanded.bottom)
      ..lineTo(expanded.left, expanded.bottom)
      ..close();
  }
  return path;
}

/// Ways Slop can briefly change shape.
///
/// The resting form is ALWAYS the armless dome. Every shift grows out of that
/// silhouette and is reabsorbed back into it — that is the whole idea: slime
/// can make an arm when it wants to wave at you, and then it doesn't have one
/// any more. Nothing here is a permanent body part.
enum SlopShift {
  /// Grows a single arm out of one side, waves, melts it back in.
  wave,

  /// Rises into a tall column and settles — a stretch after sitting still.
  stretch,

  /// A travelling ripple runs around the whole outline, like it was poked.
  wobble,

  /// Pinches a droplet off its crown; it hovers, then rejoins.
  droplet,

  /// Leans hard toward whatever it is looking at, elongating on one side.
  lean,

  /// Slumps into a wide puddle, then gathers itself back up.
  melt,

  /// Squashes, launches, stretches thin in the air, lands and wobbles.
  hop,

  /// Pushes a periscope eye up out of the crown to look around.
  eyeStalk,

  /// Pulls its whole body into a heart for a beat.
  heart,

  /// Briefly resolves into a soft, billboard-readable squircle.
  square,

  /// Gathers into a rounded triangle, points up, then pours back down.
  triangle,

  /// Bursts into a soft five-point star before returning to the dome.
  star,

  /// Blooms into a puffy cloud silhouette.
  cloud,

  /// Opens into a six-petal gel flower.
  flower,

  /// Turns on the spot — squashing to an edge and back out.
  spin,

  /// Three quick hops in a row.
  bounce,

  /// A fast shiver, like it just got a chill.
  shiver,

  /// Puffs up round and full, then settles.
  inflate,

  /// Sinks into the floor and pops back up.
  peek,

  /// Rocks side to side.
  rock,

  /// Belly-laughs: fast bobbing with the mouth wide open.
  laugh,

  /// Winds up small, then lurches with a spray.
  sneeze,

  /// Squeezes thin at the waist as if about to divide, then relaxes.
  pinch,

  /// Swells with a bright rim of light.
  glow,

  /// Throws up two arms for a beat — a cheer, then gone.
  cheer,

  /// Extends a long thin pseudopod sideways to investigate, then retracts.
  reach,
}

/// ---------------------------------------------------------------------------
/// The render engine
/// ---------------------------------------------------------------------------
///
/// One function paints Slop everywhere — the studio composer, the build
/// screen, the shop hero, the profile card. That is deliberate: because the
/// composer and the build screen call the *same* renderer, the composer can
/// physically shrink into the build orb instead of being cut to a different
/// drawing.
///
/// The silhouette is a rounded-box support function, so [round] slides
/// continuously from a gooey blob (0) to a tall input panel (1) with no
/// special-casing at either end.
///
/// A mouth is anchored to the body, never to the height of the selected eye.
/// Keeping this tiny anatomy contract public for tests prevents a tall eye or
/// cyclops from silently pushing the mouth down toward the Slop's base again.
@visibleForTesting
({double offsetY, double maxWidth, double maxHeight})
slopRestingMouthMetricsFor(SlopBody body) => switch (body) {
  SlopBody.classic ||
  SlopBody.triangle ||
  SlopBody.ghost ||
  SlopBody.cloud ||
  SlopBody.star => (offsetY: 24.0, maxWidth: 24.0, maxHeight: 15.0),
  SlopBody.tall => (offsetY: 24.0, maxWidth: 24.0, maxHeight: 15.0),
  SlopBody.wide ||
  SlopBody.capsule => (offsetY: 18.0, maxWidth: 24.0, maxHeight: 14.0),
  SlopBody.droplet ||
  SlopBody.heart => (offsetY: 23.0, maxWidth: 24.0, maxHeight: 15.0),
};

/// The authored performance for a heart shift.
///
/// Unlike the generic `sin(pi * t)` gesture envelope, this choreography has
/// readable beats: Slop anticipates low, stretches into a held heart, gives
/// two soft pulses, then elastically pours back into its resting dome. Keeping
/// the channels explicit also lets tests prove that the silhouette starts and
/// ends at rest without a one-frame snap.
@visibleForTesting
({
  double morph,
  double widthScale,
  double heightScale,
  double verticalOffset,
  double glow,
  double accents,
})
slopHeartMotionFor(double progress) {
  final t = progress.clamp(0.0, 1.0);
  double smooth(double value) {
    final x = value.clamp(0.0, 1.0);
    return x * x * (3 - 2 * x);
  }

  if (t <= 0.11) {
    final u = smooth(t / 0.11);
    return (
      morph: 0,
      widthScale: 1 + 0.08 * u,
      heightScale: 1 - 0.09 * u,
      verticalOffset: 0.025 * u,
      glow: 0.08 * u,
      accents: 0,
    );
  }

  if (t <= 0.38) {
    final u = smooth((t - 0.11) / 0.27);
    final elasticLift = math.sin(u * math.pi);
    return (
      morph: u,
      widthScale: 1.08 - 0.02 * u + 0.065 * elasticLift,
      heightScale: 0.91 + 0.17 * u + 0.055 * elasticLift,
      verticalOffset: 0.025 * (1 - u) - 0.035 * u - 0.018 * elasticLift,
      glow: 0.08 + 0.42 * u,
      accents: smooth((t - 0.20) / 0.18),
    );
  }

  if (t <= 0.68) {
    final u = (t - 0.38) / 0.30;
    // sin^4 gives two distinct heartbeat pulses while meeting the surrounding
    // stages at exactly zero velocity and scale offset.
    final beat = math.pow(math.sin(u * math.pi * 2), 4).toDouble();
    return (
      morph: 1,
      widthScale: 1.06 + 0.052 * beat,
      heightScale: 1.08 + 0.052 * beat,
      verticalOffset: -0.035 - 0.011 * beat,
      glow: 0.50 + 0.34 * beat,
      accents: 1,
    );
  }

  final u = smooth((t - 0.68) / 0.32);
  final settle = math.sin(u * math.pi * 3) * (1 - u);
  return (
    morph: 1 - u,
    widthScale: 1.06 - 0.06 * u + 0.025 * settle,
    heightScale: 1.08 - 0.08 * u - 0.020 * settle,
    verticalOffset: -0.035 * (1 - u) - 0.010 * math.sin(u * math.pi),
    glow: 0.50 * (1 - u),
    accents: 1 - u,
  );
}

/// A normalized, billboard-readable heart outline.
///
/// [outlineAngle] follows the renderer's clockwise outline parameter: zero is
/// the right edge, pi/2 is the bottom point, and 3pi/2 is the crown cleft.
/// The classic parametric heart gives us two broad lobes and one unmistakable
/// lower point instead of approximating a heart with bumps on a dome.
@visibleForTesting
Offset slopHeartSilhouettePointFor(double outlineAngle) {
  final theta = outlineAngle + math.pi / 2;
  final s = math.sin(theta);
  final x = s * s * s;
  final rawY =
      -(13 * math.cos(theta) -
          5 * math.cos(theta * 2) -
          2 * math.cos(theta * 3) -
          math.cos(theta * 4));
  // The raw curve spans approximately -12..17. Recentring it keeps the
  // morph inside the exact same responsive body rectangle.
  return Offset(x, (rawY - 2.5) / 14.5);
}

/// Body-aware horizontal room for the heart's elastic beats.
///
/// Wide Slops already occupy the full brand silhouette, so their heartbeat is
/// expressed vertically instead of growing beyond a compact phone's canvas.
@visibleForTesting
double slopHeartWidthScaleFor(SlopBody body, double progress) {
  final bodyWidth = switch (body) {
    SlopBody.classic ||
    SlopBody.triangle ||
    SlopBody.ghost ||
    SlopBody.cloud ||
    SlopBody.star => 1.0,
    SlopBody.tall => 0.92,
    SlopBody.wide || SlopBody.capsule => 1.12,
    SlopBody.droplet || SlopBody.heart => 1.02,
  };
  final requested = slopHeartMotionFor(progress).widthScale;
  return math.min(requested, 1.12 / bodyWidth);
}

/// Neutral, genuinely transparent material ramp for the private-beta glass.
///
/// Clear Glass must not inherit the owner's body palette: doing so turns it
/// into cloudy pastel jelly. These low-alpha neutral values leave the surface
/// behind the Slop visible, while the final cool edge gives the lens just
/// enough thickness to read on both dark and light screens.
@visibleForTesting
const slopClearGlassBodyColors = <Color>[
  Color(0x20FFFFFF),
  Color(0x0DFFFFFF),
  Color(0x05FFFFFF),
  Color(0x0BDDF7FF),
  Color(0x2097C7D8),
];

/// Stable finish-detail scale for both a resting mascot and its very wide
/// ribbon form. Width-based units make the same reflection or facet several
/// times thicker merely because the body becomes a panel.
double slopFinishDetailUnitFor(Rect rect) => rect.shortestSide / 100;

/// Dense, aspect-safe binary rain. Every column repeats after three rows,
/// preserving both digit and luminance as the material clock wraps.
@visibleForTesting
({
  double fontSize,
  int columns,
  int rows,
  List<({Offset topCenter, int tone, int digit})> stamps,
})
slopCodeRainLayoutFor(Rect rect, double phase) {
  if (rect.isEmpty || !rect.width.isFinite || !rect.height.isFinite) {
    return (fontSize: 0, columns: 0, rows: 0, stamps: const []);
  }
  final fontSize = math.min(rect.width * .034, rect.height * .13);
  final columns = (rect.width / (fontSize * 1.6)).floor().clamp(8, 36);
  final rows = (rect.height / (fontSize * 1.85)).floor().clamp(5, 14);
  final clock = phase.isFinite ? phase - phase.floorToDouble() : 0.0;
  return (
    fontSize: fontSize,
    columns: columns,
    rows: rows,
    stamps: [
      for (var column = 0; column < columns; column++)
        for (var row = -3; row < rows; row++)
          (
            topCenter: Offset(
              rect.left + rect.width * (column + .5) / columns,
              rect.top +
                  rect.height * (row + ((clock + column * .23) % 1) * 3) / rows,
            ),
            tone: (column + row + 3) % 3,
            digit: (column * 13 + row + 3) % 3 == 0 ? 0 : 1,
          ),
    ],
  );
}

/// Shared by the round character, turned sculpture and full-width ribbon.
/// Pooled vector glyphs need three draw calls and no per-frame text layout.
void paintSlopBinaryCode(Canvas canvas, Rect rect, double phase) {
  canvas.drawRect(
    rect,
    Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF347956), Color(0xFF1C4E38), Color(0xFF286849)],
      ).createShader(rect),
  );
  final rain = slopCodeRainLayoutFor(rect, phase);
  final unit = rain.fontSize;
  final paths = [Path(), Path(), Path()];
  for (final stamp in rain.stamps) {
    final x = stamp.topCenter.dx, y = stamp.topCenter.dy;
    final path = paths[stamp.tone];
    if (stamp.digit == 0) {
      path.addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x - unit * .24, y, unit * .48, unit * .78),
          Radius.circular(unit * .16),
        ),
      );
      path.moveTo(x - unit * .08, y + unit * .56);
      path.lineTo(x + unit * .08, y + unit * .22);
    } else {
      path.moveTo(x - unit * .18, y + unit * .16);
      path.lineTo(x, y);
      path.lineTo(x, y + unit * .78);
      path.moveTo(x - unit * .19, y + unit * .78);
      path.lineTo(x + unit * .19, y + unit * .78);
    }
  }
  const colors = [Color(0xFF3E8B61), Color(0xFF79C58C), Color(0xFFCEF4CD)];
  for (var tone = 0; tone < paths.length; tone++) {
    canvas.drawPath(
      paths[tone],
      Paint()
        ..color = colors[tone]
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * .105
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }
}

/// Resting facial strokes adapt when a material would swallow the owner's
/// ordinary palette ink. Glass gets an electric-blue face that remains legible
/// over whatever game art is behind it; SLOP Code keeps its authored terminal
/// green. The remaining fixed dark finishes use a pale material-specific ink.
Color slopMaterialFacialLineColorFor(SlopLook look) =>
    look.finish == SlopFinish.clearGlass
    ? const Color(0xFF65E8FF)
    : look.pattern == SlopPattern.slopCode
    ? const Color(0xFF68FF91)
    : switch (look.finish) {
        SlopFinish.galaxy => const Color(0xFFF1E9FF),
        SlopFinish.obsidian => const Color(0xFFE1D6FF),
        SlopFinish.firstBatch => const Color(0xFFFFD19A),
        SlopFinish.wildfire => const Color(0xFFFFD0A8),
        SlopFinish.tidepool => const Color(0xFFD8FFFA),
        _ => look.palette.ink,
      };

/// Canonical selected eye pigment used by every eye family and performance.
/// Material skins may replace the default `ink` pigment so a dark or clear
/// face never loses its pupils. Explicitly chosen eye colors remain untouched.
@visibleForTesting
Color slopResolvedEyeColorFor(SlopLook look) =>
    look.eyeColor.color ??
    (look.finish == SlopFinish.clearGlass
        ? const Color(0xFF30D8FF)
        : look.pattern == SlopPattern.slopCode
        ? const Color(0xFF68FF91)
        : look.palette.ink);

/// A hue-preserving dark edge/core. Bright eye colors stay visibly authored,
/// while pupils and graphic shapes retain enough contrast on the warm sclera.
@visibleForTesting
Color slopEyeDeepToneFor(Color eyeColor) =>
    Color.lerp(eyeColor, Colors.black, 0.62)!;

/// A hue-preserving wet highlight used by dimensional specialty eyes.
@visibleForTesting
Color slopEyeLightToneFor(Color eyeColor) =>
    Color.lerp(eyeColor, Colors.white, 0.52)!;

/// Blush follows the same contrast contract as facial strokes on fixed dark
/// materials. It remains a soft color field rather than becoming an outline.
@visibleForTesting
Color slopMaterialCheekColorFor(SlopLook look) => switch (look.finish) {
  SlopFinish.galaxy => const Color(0xFFFFB6E8),
  SlopFinish.obsidian => const Color(0xFFCDB8FF),
  SlopFinish.firstBatch => const Color(0xFFFFA465),
  SlopFinish.wildfire => const Color(0xFFFF8F70),
  SlopFinish.tidepool => const Color(0xFFFF84BD),
  _ => look.palette.cheek,
};

/// Timing shared by the geometric shape-shift performances.
///
/// There is a visible anticipation, a held silhouette, and a liquid return.
/// Exact endpoints prevent a one-frame pop when another animation follows.
@visibleForTesting
({
  double morph,
  double widthScale,
  double heightScale,
  double verticalOffset,
  double glow,
})
slopSilhouetteMotionFor(double progress) {
  final t = progress.clamp(0.0, 1.0);
  double smooth(double value) {
    final x = value.clamp(0.0, 1.0);
    return x * x * (3 - 2 * x);
  }

  if (t <= 0.12) {
    final u = smooth(t / 0.12);
    return (
      morph: 0,
      widthScale: 1 + 0.07 * u,
      heightScale: 1 - 0.10 * u,
      verticalOffset: 0.028 * u,
      glow: 0.04 * u,
    );
  }
  if (t <= 0.40) {
    final u = smooth((t - 0.12) / 0.28);
    final overshoot = math.sin(u * math.pi);
    return (
      morph: u,
      widthScale: 1.07 - 0.05 * u + 0.035 * overshoot,
      heightScale: 0.90 + 0.12 * u + 0.045 * overshoot,
      verticalOffset: 0.028 * (1 - u) - 0.022 * u,
      glow: 0.04 + 0.34 * u,
    );
  }
  if (t <= 0.70) {
    final u = (t - 0.40) / 0.30;
    final breathe = math.pow(math.sin(u * math.pi), 2).toDouble();
    return (
      morph: 1,
      widthScale: 1.02 + 0.025 * breathe,
      heightScale: 1.02 + 0.025 * breathe,
      verticalOffset: -0.022 - 0.006 * breathe,
      glow: 0.38 + 0.13 * breathe,
    );
  }
  final u = smooth((t - 0.70) / 0.30);
  final settle = math.sin(u * math.pi * 3) * (1 - u);
  return (
    morph: 1 - u,
    widthScale: 1.02 - 0.02 * u + 0.018 * settle,
    heightScale: 1.02 - 0.02 * u - 0.014 * settle,
    verticalOffset: -0.022 * (1 - u),
    glow: 0.38 * (1 - u),
  );
}

/// Normalized target point for an authored transient silhouette.
///
/// The parameter uses the renderer's clockwise outline angle: 0 is right and
/// pi/2 is bottom. Targets stay inside the same responsive body rectangle.
@visibleForTesting
Offset slopShiftSilhouettePointFor(SlopShift shift, double outlineAngle) {
  final a = outlineAngle;
  final dx = math.cos(a);
  final dy = math.sin(a);
  switch (shift) {
    case SlopShift.square:
      const power = 5.0;
      final denominator = math.pow(
        math.pow(dx.abs(), power) + math.pow(dy.abs(), power),
        1 / power,
      );
      final radius = denominator == 0 ? 1.0 : 0.94 / denominator;
      return Offset(dx * radius, dy * radius);
    case SlopShift.triangle:
      return _rayPolygonPoint(a, const [
        Offset(0, -1),
        Offset(0.94, 0.78),
        Offset(-0.94, 0.78),
      ]);
    case SlopShift.star:
      final radius = 0.76 + 0.21 * math.cos(5 * (a + math.pi / 2));
      return Offset(dx * radius, dy * radius);
    case SlopShift.cloud:
      final crown = ((-dy + 1) / 2).clamp(0.0, 1.0);
      final lobes = math.cos(5 * (a + math.pi / 2));
      final radius = 0.82 + 0.12 * lobes * (0.25 + 0.75 * crown);
      return Offset(dx * radius * 1.06, dy * radius * 0.90 + 0.08);
    case SlopShift.flower:
      final radius = 0.73 + 0.22 * math.cos(6 * (a + math.pi / 2));
      return Offset(dx * radius, dy * radius);
    default:
      return Offset(dx, dy);
  }
}

/// Top edge of a shifted silhouette at normalized horizontal position.
///
/// Topper attachment uses this instead of the resting dome while a body is
/// transformed, preventing horns, headphones, and hair from hovering above a
/// triangle/star/heart. When a concave shape has multiple intersections, the
/// uppermost edge is the physical crown.
@visibleForTesting
double slopShiftCrownYFor(SlopShift shift, double normalizedX) {
  final targetX = normalizedX.clamp(-1.0, 1.0);
  const samples = 360;
  double best = double.infinity;
  Offset pointAt(int index) {
    final angle = index / samples * math.pi * 2;
    return shift == SlopShift.heart
        ? slopHeartSilhouettePointFor(angle)
        : slopShiftSilhouettePointFor(shift, angle);
  }

  var previous = pointAt(0);
  for (var i = 1; i <= samples; i++) {
    final current = pointAt(i % samples);
    final minX = math.min(previous.dx, current.dx) - 1e-9;
    final maxX = math.max(previous.dx, current.dx) + 1e-9;
    if (targetX >= minX && targetX <= maxX) {
      final span = current.dx - previous.dx;
      final t = span.abs() < 1e-9
          ? 0.5
          : ((targetX - previous.dx) / span).clamp(0.0, 1.0);
      best = math.min(best, _lerpD(previous.dy, current.dy, t));
    }
    previous = current;
  }
  if (best.isFinite) return best;

  var nearest = pointAt(0);
  for (var i = 1; i < samples; i++) {
    final candidate = pointAt(i);
    if ((candidate.dx - targetX).abs() < (nearest.dx - targetX).abs()) {
      nearest = candidate;
    }
  }
  return nearest.dy;
}

Offset _rayPolygonPoint(double angle, List<Offset> vertices) {
  final ray = Offset(math.cos(angle), math.sin(angle));
  var nearest = double.infinity;
  for (var i = 0; i < vertices.length; i++) {
    final first = vertices[i];
    final second = vertices[(i + 1) % vertices.length];
    final edge = second - first;
    final cross = ray.dx * edge.dy - ray.dy * edge.dx;
    if (cross.abs() < 1e-9) continue;
    final distance = (first.dx * edge.dy - first.dy * edge.dx) / cross;
    final edgeT = (first.dx * ray.dy - first.dy * ray.dx) / cross;
    if (distance >= 0 && edgeT >= -1e-9 && edgeT <= 1 + 1e-9) {
      nearest = math.min(nearest, distance);
    }
  }
  if (!nearest.isFinite) return ray;
  return ray * nearest;
}

/// Ordinary pokes vary; the signature heart is a rare discovery.
@visibleForTesting
SlopShift slopTapReactionFor(int tapOrdinal) {
  const deck = <SlopShift>[
    SlopShift.wobble,
    SlopShift.wave,
    SlopShift.bounce,
    SlopShift.square,
    SlopShift.reach,
    SlopShift.cloud,
    SlopShift.hop,
    SlopShift.triangle,
    SlopShift.rock,
    SlopShift.flower,
    SlopShift.cheer,
    SlopShift.heart,
    SlopShift.star,
  ];
  return deck[tapOrdinal.abs() % deck.length];
}

@visibleForTesting
const slopAmbientShiftDeck = <SlopShift>[
  SlopShift.wave,
  SlopShift.stretch,
  SlopShift.wobble,
  SlopShift.droplet,
  SlopShift.lean,
  SlopShift.melt,
  SlopShift.hop,
  SlopShift.reach,
  SlopShift.square,
  SlopShift.cloud,
  SlopShift.triangle,
  SlopShift.flower,
  SlopShift.star,
  SlopShift.heart,
];

/// Crown-relative contact geometry for the fitted Mushroom Cap.
///
/// The lowest brim point is intentionally shallow: it remains embedded in the
/// gel without descending into the Cyclops eye corridor on Buddy's open body.
({Offset leftRoot, Offset rightRoot, double capBottom, double lowestBrim})
slopMushroomBrimGeometryFor(
  Rect rect, {
  required SlopBody body,
  required double round,
  double wave = 0,
  SlopShift? shift,
  double shiftMorph = 0,
  double? renderUnit,
}) {
  final edgeX = body == SlopBody.triangle ? .19 + .11 * round : .30;
  final unit = renderUnit ?? rect.width / 100;
  double crownY(double x) => SlopRenderer._crownYAt(
    rect,
    normalizedX: x,
    body: body,
    round: round,
    wave: wave,
    shift: shift,
    shiftMorph: shiftMorph,
  );
  final leftRoot = Offset(
    rect.center.dx - rect.width * edgeX,
    crownY(-edgeX) + unit * 1.6,
  );
  final rightRoot = Offset(
    rect.center.dx + rect.width * edgeX,
    crownY(edgeX) + unit * 1.6,
  );
  final capBottom = math.max(leftRoot.dy, rightRoot.dy) + unit;
  return (
    leftRoot: leftRoot,
    rightRoot: rightRoot,
    capBottom: capBottom,
    lowestBrim: capBottom + unit * 2.2,
  );
}

/// Crown-relative contact geometry for the Idea Wizard's curved brim.
/// [lowestBrim] is deliberately conservative (the deepest quadratic control
/// point), guaranteeing that an inflated eye socket also clears the rendered
/// curve between its sampled roots.
({Offset leftRoot, Offset rightRoot, double crownCenter, double lowestBrim})
slopIdeaWizardBrimGeometryFor(
  Rect rect, {
  required SlopBody body,
  required double round,
  double wave = 0,
  SlopShift? shift,
  double shiftMorph = 0,
  double? renderUnit,
}) {
  final brimX = body == SlopBody.triangle ? .19 + .11 * round : .30;
  final unit = renderUnit ?? rect.width / 100;
  double crownY(double x) => SlopRenderer._crownYAt(
    rect,
    normalizedX: x,
    body: body,
    round: round,
    wave: wave,
    shift: shift,
    shiftMorph: shiftMorph,
  );
  final crownCenter = crownY(0);
  final leftRoot = Offset(
    rect.center.dx - rect.width * brimX,
    crownY(-brimX) + unit * 2.8,
  );
  final rightRoot = Offset(
    rect.center.dx + rect.width * brimX,
    crownY(brimX) + unit * 2.8,
  );
  return (
    leftRoot: leftRoot,
    rightRoot: rightRoot,
    crownCenter: crownCenter,
    lowestBrim: math.max(
      math.max(leftRoot.dy, rightRoot.dy),
      crownCenter + unit * 12.2,
    ),
  );
}

/// Lowest collision edge for hats whose crown contact spans the face corridor.
/// Other toppers do not own this central band and therefore need no face shift.
double? slopHatLowestBrimFor(
  SlopHat hat,
  Rect rect, {
  required SlopBody body,
  required double round,
  double wave = 0,
  double? renderUnit,
}) => switch (hat) {
  SlopHat.mushroom => slopMushroomBrimGeometryFor(
    rect,
    body: body,
    round: round,
    wave: wave,
    renderUnit: renderUnit,
  ).lowestBrim,
  SlopHat.ideaWizard => slopIdeaWizardBrimGeometryFor(
    rect,
    body: body,
    round: round,
    wave: wave,
    renderUnit: renderUnit,
  ).lowestBrim,
  _ => null,
};

/// Crown samples shared by the new fitted adornments and their geometry tests.
///
/// Each [crown] point is on the live body silhouette. [root] sits just inside
/// the gel, creating a real overlap patch rather than letting a bow, clip, or
/// circlet hover above tall/wide/panel bodies. Keeping these points in one
/// helper prevents preview, feed, and Buddy-scale renderers from inventing
/// different attachment baselines.
List<({Offset crown, Offset root})> slopFittedHatContactsFor(
  SlopHat hat,
  Rect rect, {
  required SlopBody body,
  required double round,
  double wave = 0,
  SlopShift? shift,
  double shiftMorph = 0,
  double? renderUnit,
}) {
  final xs = switch (hat) {
    SlopHat.satinBow => const [0.18],
    SlopHat.pearlTiara => const [-0.24, 0.0, 0.24],
    SlopHat.blossomCrown => const [-0.28, -0.14, 0.0, 0.14, 0.28],
    SlopHat.butterflyClips => const [-0.24, 0.24],
    _ => const <double>[],
  };
  final unit = renderUnit ?? rect.width / 100;
  return [
    for (final sourceX in xs)
      () {
        // Triangle has real straight sides. Bring fitted adornments toward its
        // crown so the outer flowers/clips do not slide down to cheek height.
        // A fully expanded panel keeps its original, evenly spaced band.
        final triangleSpread = switch (hat) {
          SlopHat.satinBow => .48,
          SlopHat.blossomCrown => .65,
          _ => .76,
        };
        final x =
            sourceX *
            (body == SlopBody.triangle
                ? triangleSpread + (1 - triangleSpread) * round
                : 1);
        final crown = Offset(
          rect.center.dx + rect.width * x,
          SlopRenderer._crownYAt(
            rect,
            normalizedX: x,
            body: body,
            round: round,
            wave: wave,
            shift: shift,
            shiftMorph: shiftMorph,
          ),
        );
        return (crown: crown, root: crown.translate(0, unit * 2.6));
      }(),
  ];
}

/// Resting body proportions shared by the renderer and collision geometry.
/// Buddy uses this exact transformed rect when fitting face attachments; using
/// the incoming layout rect directly is wrong for tall/wide body identities.
@visibleForTesting
({double width, double height, double tip}) slopBodyProportionsFor(
  SlopBody body,
) => switch (body) {
  SlopBody.classic ||
  SlopBody.ghost ||
  SlopBody.cloud ||
  SlopBody.star => (width: 1.0, height: 0.94, tip: 0.70),
  SlopBody.tall => (width: 1.04, height: 0.88, tip: 0.0),
  SlopBody.triangle => (width: 1.08, height: 0.90, tip: 0.0),
  SlopBody.wide => (width: 1.12, height: 0.84, tip: 0.58),
  SlopBody.capsule => (width: 1.12, height: 0.72, tip: 0.0),
  // `droplet` remains the compatibility/storage ID. Pillow keeps its broad
  // rounded-square identity, but uses a ten-percent smaller resting footprint
  // so it does not overpower neighbouring bodies or crowd a rank Crown.
  SlopBody.droplet => (width: 0.92, height: 0.85, tip: 0.0),
  SlopBody.heart => (width: 1.02, height: 0.94, tip: 0.0),
};

/// Body-specific rounded-box blend used by every Slop surface.
///
/// Square keeps its historical `droplet` wire value so existing profiles and
/// web snapshots remain valid. At rest it starts as a soft rounded panel, then
/// converges continuously to the same ribbon geometry as every other body.
@visibleForTesting
double slopBodySilhouetteRoundFor(SlopBody body, double round) {
  final t = round.clamp(0.0, 1.0);
  if (body != SlopBody.droplet) return t;
  return 0.58 + (1 - 0.58) * t;
}

/// The body rect produced by [SlopRenderer] before a reaction or authored
/// shift. The composer is collision-checked in this resting animation frame;
/// body/mouth transforms are then applied to the whole shared stage.
Rect slopRestingBodyRectFor(
  Rect rect, {
  required SlopBody body,
  double round = 0,
}) {
  final shape = slopBodyProportionsFor(body);
  final blobbiness = 1 - round.clamp(0.0, 1.0);
  final widthScale = 1 + (shape.width - 1) * blobbiness;
  final heightScale = 1 + (shape.height - 1) * blobbiness;
  return Rect.fromCenter(
    center: rect.center,
    width: rect.width * widthScale,
    height: rect.height * heightScale,
  );
}

/// The renderer's exact resting silhouette for a body at a given morph value.
///
/// Attached identity surfaces use this to preserve a body's authored outline
/// without repainting a second body over the shared gel material. Keeping the
/// path here also guarantees that the persisted `droplet`/Square body has the
/// same soft-square corners in Buddy, For You, and Circle.
Path slopRestingBodyPathFor(
  Rect rect, {
  required SlopBody body,
  double round = 0,
  double phase = 0,
}) {
  final morph = round.clamp(0.0, 1.0);
  final shape = slopBodyProportionsFor(body);
  final bodyRect = slopRestingBodyRectFor(rect, body: body, round: morph);
  if (reimaginedCharactersEnabled) {
    return slopFormOutlineFor(bodyRect, body: body, round: morph, phase: phase);
  }
  return SlopRenderer._bodyPath(
    bodyRect,
    round: slopBodySilhouetteRoundFor(body, morph),
    wobble: 1 - morph,
    phase: phase,
    spread: 0,
    tipScale: shape.tip,
  );
}

const double slopCyclopsEyeScale = .95;

/// Exact open-eye socket used by the renderer for the signature Cyclops face.
/// It includes the dark inflated socket, not merely the white eye oval.
Rect slopCyclopsSocketBoundsFor({
  required Rect layoutRect,
  required Rect bodyRect,
  required double faceAnchor,
  required double faceScale,
}) {
  final unit = layoutRect.width / 100 * faceScale;
  final eye = Rect.fromCenter(
    center: Offset(
      bodyRect.center.dx,
      bodyRect.top + bodyRect.height * faceAnchor,
    ),
    width: unit * 29.5 * slopCyclopsEyeScale,
    height: unit * 31.5 * slopCyclopsEyeScale,
  );
  return eye.inflate(unit * 1.7 * slopCyclopsEyeScale);
}

abstract final class SlopRenderer {
  /// Paint Slop filling [rect].
  ///
  /// [round] 0 = blob, 1 = panel. [phase] is the 0..1 idle clock. [reaction]
  /// is a 0..1 tap impulse. [gaze] is -1..1 on each axis. Setting
  /// [centerFaceHorizontally] locks only the face socket to the body centre;
  /// blink, material, aura, and body animation continue to use [phase].
  static void paint(
    Canvas canvas, {
    required Rect rect,
    required SlopLook look,
    required SlopEmotion emotion,
    double round = 0,
    double phase = 0,
    double reaction = 0,
    Offset gaze = Offset.zero,
    double talk = 0,
    double smirk = 0,
    double faceAnchor = 0.5,
    double faceScale = 1,
    double opacity = 1,
    SlopShift? shift,
    double shiftT = 0,
    double shiftStrength = 1,
    bool hat = true,
    bool shadow = true,
    bool ambient = true,
    double bodyRimOpacity = 1,
    bool showBody = true,
    bool showFace = true,
    bool showMouth = true,
    double mouthOpacity = 1,
    bool centerFaceHorizontally = false,
    Color? facialLineColor,
    SlopSurfaceStyle surfaceStyle = SlopSurfaceStyle.standard,
    SlopToonDepthPose depthPose = SlopToonDepthPose.neutral,
    SlopAuraDepthPass auraDepthPass = SlopAuraDepthPass.all,
    SlopHeadwearDepthPass headwearDepthPass = SlopHeadwearDepthPass.all,
  }) {
    look = slopLookWithCurrentChampion(look);
    if (reimaginedCharactersEnabled) {
      SlopFormRenderer.paint(
        canvas,
        rect: rect,
        look: look,
        emotion: emotion,
        round: round,
        phase: phase,
        reaction: reaction,
        gaze: gaze,
        talk: talk,
        smirk: smirk,
        faceAnchor: faceAnchor,
        faceScale: faceScale,
        opacity: opacity,
        shift: shift,
        shiftT: shiftT,
        shiftStrength: shiftStrength,
        hat: hat,
        shadow: shadow,
        ambient: ambient,
        showBody: showBody,
        showFace: showFace,
        showMouth: showMouth,
        mouthOpacity: mouthOpacity,
        centerFaceHorizontally: centerFaceHorizontally,
        facialLineColor: facialLineColor,
        surfaceStyle: surfaceStyle,
        depthPose: depthPose,
        auraDepthPass: auraDepthPass,
        headwearDepthPass: headwearDepthPass,
      );
      return;
    }
    final palette = look.palette;
    final wave = math.sin(phase * math.pi * 2);

    // A tap squashes Slop down and spreads the base, then it springs back
    // through the resting height. Damped by (1 - reaction) so the last frame
    // lands exactly at rest instead of freezing mid-stretch.
    final spring = math.sin(reaction * math.pi * 3) * (1 - reaction);
    final squash = spring * 0.17;
    final blobbiness = 1 - round;

    // Silhouette choice applies to the blob form only — the input panel has to
    // stay a panel whichever body the user picked.
    // One familiar rounded species. Body choices change the proportions, not
    // the identity: none grows a pointed crown or a poop-like peak.
    final shape = slopBodyProportionsFor(look.body);
    final silhouetteRound = slopBodySilhouetteRoundFor(look.body, round);
    var shapeW = 1 + (shape.width - 1) * blobbiness;
    var shapeH = 1 + (shape.height - 1) * blobbiness;

    // Every shift rides a 0→1→0 envelope, so whatever it does it is guaranteed
    // to end exactly back at the resting dome. Scaled by blobbiness so the
    // input-panel form barely moves.
    final active = (shiftT > 0 && shiftT < 1) ? shift : null;
    final e = active == null
        ? 0.0
        : math.sin(shiftT.clamp(0.0, 1.0) * math.pi) * blobbiness;
    final heartMotion = slopHeartMotionFor(
      active == SlopShift.heart ? shiftT : 0,
    );
    final silhouetteMotion = slopSilhouetteMotionFor(switch (active) {
      SlopShift.square ||
      SlopShift.triangle ||
      SlopShift.star ||
      SlopShift.cloud ||
      SlopShift.flower => shiftT,
      _ => 0,
    });

    var lift = 0.0;
    var lift2 = 0.0;
    var shear = 0.0;
    var tipCurl = 0.0;
    var drift = 0.0;
    var rimGlow = 0.0;
    var faceFade = 0.0;
    var forceTalk = 0.0;
    var waist = 0.0;
    const twist = 0.0;
    var rippleBoost = 0.0;
    var heart = 0.0;
    SlopShift? silhouette;
    var silhouetteMorph = 0.0;
    var baseSpread = squash;

    // Limbs are grown per shift. Nothing here persists: `e` returns to 0 and
    // every limb is reabsorbed into the dome.
    final limbs =
        <({double angle, double length, double width, double hand})>[];

    switch (active) {
      case SlopShift.wave:
        // The whole arm sweeps from the shoulder — the base stays put and the
        // limb swings, the way an actual wave works.
        final sweep = math.sin(shiftT * math.pi * 6) * 0.40 * e;
        limbs.add((
          angle: 0.16 + sweep,
          length: 0.40 * e,
          width: 0.175,
          hand: 0.098 * e,
        ));
      case SlopShift.cheer:
        // Held wide apart, or the two bulges merge into one lumpy crown.
        final lift = math.sin(shiftT * math.pi * 3).abs() * 0.16;
        for (final a in [-0.26 - lift, -2.88 + lift]) {
          limbs.add((
            angle: a,
            length: 0.74 * e,
            width: 0.095,
            hand: 0.062 * e,
          ));
        }
        lift2 = e;
      case SlopShift.reach:
        // A long thin pseudopod, no hand — curiosity, not a greeting.
        final probe = 0.5 + 0.5 * math.sin(shiftT * math.pi * 2);
        limbs.add((
          angle: 0.46,
          length: 0.70 * e * probe,
          width: 0.075,
          hand: 0.022 * e,
        ));
      case SlopShift.eyeStalk:
        limbs.add((angle: -1.48, length: 0.86 * e, width: 0.085, hand: 0));
      case SlopShift.stretch:
        shapeH *= 1 + 0.30 * e;
        shapeW *= 1 - 0.15 * e;
        lift = -rect.height * 0.06 * e;
      case SlopShift.melt:
        shapeH *= 1 - 0.30 * e;
        shapeW *= 1 + 0.26 * e;
        baseSpread += 0.5 * e;
        lift = rect.height * 0.06 * e;
      case SlopShift.hop:
        // Anticipate low, then launch and stretch thin at the top of the arc.
        final launch = math.sin(shiftT.clamp(0.0, 1.0) * math.pi);
        final crouch = shiftT < 0.22 ? shiftT / 0.22 : 0.0;
        lift = -rect.height * 0.34 * launch * blobbiness;
        shapeH *=
            (1 + 0.22 * launch - 0.18 * crouch) * blobbiness + (1 - blobbiness);
        shapeW *=
            (1 - 0.12 * launch + 0.16 * crouch) * blobbiness + (1 - blobbiness);
      case SlopShift.wobble:
        rippleBoost = 4.5 * e;
      case SlopShift.lean:
        shear = (gaze.dx.abs() < 0.05 ? 1.0 : gaze.dx.sign) * 0.42 * e;

      case SlopShift.heart:
        heart = heartMotion.morph * blobbiness;
        final fittedWidth = slopHeartWidthScaleFor(look.body, shiftT);
        shapeW *= 1 + (fittedWidth - 1) * blobbiness;
        shapeH *= 1 + (heartMotion.heightScale - 1) * blobbiness;
        lift = rect.height * heartMotion.verticalOffset * blobbiness;
        rimGlow = math.max(rimGlow, heartMotion.glow * 0.72);
      case SlopShift.square:
      case SlopShift.triangle:
      case SlopShift.star:
      case SlopShift.cloud:
      case SlopShift.flower:
        silhouette = active;
        final strength = shiftStrength.clamp(0.0, 1.0);
        silhouetteMorph = silhouetteMotion.morph * blobbiness * strength;
        shapeW *= 1 + (silhouetteMotion.widthScale - 1) * blobbiness * strength;
        shapeH *=
            1 + (silhouetteMotion.heightScale - 1) * blobbiness * strength;
        lift =
            rect.height *
            silhouetteMotion.verticalOffset *
            blobbiness *
            strength;
        rimGlow = math.max(rimGlow, silhouetteMotion.glow * 0.48 * strength);
      case SlopShift.spin:
        // Squash to an edge and back. The face fades out at the thinnest
        // point, because a face painted on a sliver reads as a glitch.
        shapeW *= 1 - 0.92 * e;
        shapeH *= 1 + 0.06 * e;
        faceFade = (e - 0.45).clamp(0.0, 1.0) / 0.55;
      case SlopShift.bounce:
        final hops = math.sin(shiftT.clamp(0.0, 1.0) * math.pi * 3).abs();
        final decay = 1 - shiftT.clamp(0.0, 1.0);
        lift = -rect.height * 0.30 * hops * decay * blobbiness;
        shapeH *= 1 + 0.16 * hops * decay;
        shapeW *= 1 - 0.10 * hops * decay;
      case SlopShift.shiver:
        drift = math.sin(shiftT * math.pi * 26) * rect.width * 0.035 * e;
        shapeW *= 1 - 0.05 * e;
        shapeH *= 1 + 0.05 * e;
      case SlopShift.inflate:
        shapeW *= 1 + 0.26 * e;
        shapeH *= 1 + 0.24 * e;
        rimGlow = e * 0.5;
      case SlopShift.peek:
        // Sinks into the floor, then pops back.
        final sink = math.sin(shiftT.clamp(0.0, 1.0) * math.pi);
        lift = rect.height * 0.34 * sink * blobbiness;
        shapeH *= 1 - 0.34 * sink;
        shapeW *= 1 + 0.16 * sink;
      case SlopShift.rock:
        shear = math.sin(shiftT * math.pi * 4) * 0.42 * e;
      case SlopShift.laugh:
        lift = -rect.height * 0.06 * math.sin(shiftT * math.pi * 12).abs() * e;
        shapeH *= 1 - 0.06 * e;
        shapeW *= 1 + 0.07 * e;
        forceTalk = e;
      case SlopShift.sneeze:
        // Wind up small and lean back, then snap forward.
        final t = shiftT.clamp(0.0, 1.0);
        final windUp = t < 0.55 ? t / 0.55 : 0.0;
        final snap = t >= 0.55 ? 1 - (t - 0.55) / 0.45 : 0.0;
        shapeW *= 1 - 0.14 * windUp + 0.18 * snap;
        shapeH *= 1 + 0.10 * windUp - 0.12 * snap;
        shear = -0.3 * windUp + 0.42 * snap;
        forceTalk = snap;
      case SlopShift.pinch:
        waist = e;
      case SlopShift.glow:
        rimGlow = e;
        shapeW *= 1 + 0.07 * e;
        shapeH *= 1 + 0.07 * e;
      case SlopShift.droplet:
      case null:
        break;
    }

    lift -= rect.height * 0.07 * lift2;
    final bodyRect = Rect.fromCenter(
      center: rect.center.translate(drift, squash * rect.height * 0.16 + lift),
      width:
          rect.width *
          shapeW *
          (1 + squash * 0.55 * blobbiness) *
          depthPose.bodyScaleX,
      height: rect.height * shapeH * (1 - squash * 0.7 * blobbiness),
    );

    canvas.save();
    if (opacity < 1) {
      canvas.saveLayer(
        rect.inflate(rect.shortestSide),
        Paint()..color = Colors.white.withValues(alpha: opacity.clamp(0, 1)),
      );
    }

    final unit = rect.width / 100;
    final body = _bodyPath(
      bodyRect,
      round: silhouetteRound,
      wobble: blobbiness,
      phase: phase,
      spread: baseSpread,
      // The crown tip trails the body — it leans into the bounce and keeps
      // swaying after the body has settled, which is what sells surface
      // tension rather than rubber.
      lean: wave * 0.34 + spring * 0.5 + tipCurl,
      limbs: limbs,
      tipScale: shape.tip,
      shear: shear,
      twist: twist,
      rippleBoost: rippleBoost,
      heart: heart,
      silhouette: silhouette,
      silhouetteMorph: silhouetteMorph,
      waist: waist,
    );

    if (showBody && shadow) {
      final shadowWidth = bodyRect.width * (0.62 + squash * 0.5);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(bodyRect.center.dx, bodyRect.bottom + unit * 3),
          width: shadowWidth,
          height: unit * 7 * (1 + squash),
        ),
        Paint()
          ..color = palette.shade.withValues(alpha: 0.26)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 5),
      );
    }

    if (ambient &&
        look.finish == SlopFinish.wildfire &&
        auraDepthPass != SlopAuraDepthPass.front) {
      _paintFinishAtmosphere(canvas, bodyRect, phase);
    }

    if (showBody) {
      SlopCapeRenderer.paint(
        canvas,
        bodyRect,
        cape: look.cape,
        bodyShape: look.body,
        orientationAngle: depthPose.orientationAngle,
        bodyScaleX: depthPose.bodyScaleX,
        phase: phase,
        frontPass: false,
        bodyOutline: body,
        opacity: 1 - round.clamp(0.0, 1.0),
      );
      // Drips share the body's shader and well up over the crown.
      // In panel form the body is a surface to read a form on, so the dark end
      // of the ramp is pushed down toward the base — same colours, but the
      // fields don't end up sitting on the shadow.
      final bodyColors = materialBodyColors(look);
      final isClearGlass = look.finish == SlopFinish.clearGlass;
      final bodyPaint = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: bodyColors,
          stops: [
            0,
            _lerp(0.24, 0.46, round),
            _lerp(0.52, 0.72, round),
            _lerp(0.79, 0.91, round),
            1,
          ],
        ).createShader(bodyRect)
        ..isAntiAlias = true;

      // A dark gummy rim is the species-level graphic signature. It holds up at
      // nav-icon size, gives pale skins contrast, and reads cleanly on a
      // billboard where the previous hairline highlight disappeared.
      final rimOpacity = bodyRimOpacity.clamp(0.0, 1.0);
      if (rimOpacity > 0.001) {
        final darkRim = isClearGlass
            ? const Color(0xB055707B)
            : Color.lerp(
                palette.shade,
                Colors.black,
                0.28,
              )!.withValues(alpha: 0.76);
        canvas.drawPath(
          body,
          Paint()
            ..color = darkRim.withValues(alpha: darkRim.a * rimOpacity)
            ..style = PaintingStyle.stroke
            ..strokeWidth = isClearGlass
                ? slopFinishDetailUnitFor(bodyRect) * 3.6
                : unit * 4.1
            ..strokeJoin = StrokeJoin.round,
        );
      }
      canvas.drawPath(body, bodyPaint);

      // The blob on the end of a limb. Same shader, overlapping the tip of the
      // bulge, so hand and arm are one piece of material.
      for (final limb in limbs) {
        if (limb.hand <= 0 || limb.length <= 0.02) continue;
        final tip = _limbTip(bodyRect, limb.angle, limb.length * 0.92);
        final r = rect.shortestSide * limb.hand;
        canvas.drawCircle(tip, r, bodyPaint);
        canvas.drawCircle(
          tip.translate(-r * 0.3, -r * 0.34),
          r * 0.28,
          Paint()..color = Colors.white.withValues(alpha: 0.32),
        );
      }

      // The periscope eye rides its stalk the same way a hand rides an arm.
      if (active == SlopShift.eyeStalk && limbs.isNotEmpty) {
        final limb = limbs.first;
        final tip = _limbTip(bodyRect, limb.angle, limb.length * 0.98);
        final r = rect.shortestSide * 0.088 * e;
        if (r > 0.6) {
          canvas.drawCircle(tip, r * 1.25, bodyPaint);
          canvas.drawCircle(tip, r, Paint()..color = const Color(0xFFFFFDF8));
          final pupil = tip.translate(gaze.dx * r * 0.34, gaze.dy * r * 0.34);
          final eyeColor = slopResolvedEyeColorFor(look);
          canvas.drawCircle(
            pupil,
            r * 0.52,
            Paint()..color = slopEyeDeepToneFor(eyeColor),
          );
          canvas.drawCircle(pupil, r * 0.42, Paint()..color = eyeColor);
          canvas.drawCircle(
            pupil.translate(-r * 0.18, -r * 0.2),
            r * 0.2,
            Paint()..color = Colors.white.withValues(alpha: 0.95),
          );
        }
      }

      if (active == SlopShift.droplet) {
        _paintDroplet(canvas, bodyRect, bodyPaint, palette, e, shiftT);
      }

      // Interior: pattern, pooled base shading, gloss, rim light.
      canvas.save();
      canvas.clipPath(body);
      // Clear Glass is a genuinely colourless lens material. Pattern pigment is
      // body content, so combining an owned pattern with this beta finish must
      // not put cloudy pixels back inside the otherwise empty gel. Face,
      // accessories, hats, and auras are painted outside this suppression.
      if (!isClearGlass) {
        _paintTurnedPattern(canvas, bodyRect, look, phase, depthPose);
      }
      paintMaterialFinish(canvas, bodyRect, look, phase, unit);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(bodyRect.center.dx, bodyRect.bottom + unit * 2),
          width: bodyRect.width * 1.1,
          height: bodyRect.height * 0.34,
        ),
        Paint()
          ..color = isClearGlass
              ? const Color(0x1026414A)
              : palette.shade.withValues(alpha: 0.34)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 6),
      );
      // The large toon Buddy uses one broad baked light field. Keeping the
      // standard wet crescent on top produced the hard white side-shine that
      // belongs to the small glossy avatar style, not the soft 2.5D reference.
      if (surfaceStyle == SlopSurfaceStyle.standard &&
          !isClearGlass &&
          look.finish != SlopFinish.gummy) {
        _paintGloss(canvas, bodyRect, wave: wave, round: round);
      }
      if (surfaceStyle == SlopSurfaceStyle.toon) {
        // Legacy contract marker: _paintToonVolume(canvas, bodyRect, look)
        // remains conceptually this exact slot; depth is now an extra channel.
        _paintToonVolume(canvas, bodyRect, look, depthPose);
      }
      canvas.restore();

      if (rimOpacity > 0.001) {
        final lightRim = isClearGlass
            ? const Color(0x88DDF9FF).withValues(alpha: 0.34 + 0.26 * rimGlow)
            : palette.glow.withValues(alpha: 0.58 + 0.38 * rimGlow);
        canvas.drawPath(
          body,
          Paint()
            ..color = lightRim.withValues(alpha: lightRim.a * rimOpacity)
            ..style = PaintingStyle.stroke
            ..strokeWidth = isClearGlass
                ? slopFinishDetailUnitFor(bodyRect) * (1.4 + 1.4 * rimGlow)
                : unit * (0.82 + 3.2 * rimGlow),
        );
      }
      if (rimGlow > 0.02 && rimOpacity > 0.001) {
        canvas.drawPath(
          body,
          Paint()
            ..color = (isClearGlass ? const Color(0xFFDDF9FF) : palette.glow)
                .withValues(alpha: 0.5 * rimGlow * rimOpacity)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 5
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 4),
        );
      }

      if (active == SlopShift.heart && heartMotion.accents > 0.01) {
        _paintHeartShiftAccents(
          canvas,
          bodyRect,
          palette,
          shiftT,
          heartMotion.accents,
          unit,
        );
      }
    }

    if (hat && look.hat != SlopHat.none) {
      _paintHat(
        canvas,
        bodyRect,
        look,
        round: round,
        wave: wave,
        unit: unit,
        depthPose: depthPose,
        depthPass: headwearDepthPass,
        shift: active == SlopShift.heart ? SlopShift.heart : silhouette,
        shiftMorph: active == SlopShift.heart ? heart : silhouetteMorph,
      );
    }
    if (showBody && look.pattern == SlopPattern.itCouldBeWorseRobot) {
      _paintItCouldBeWorseRobotAntennas(canvas, bodyRect, unit, wave);
    }

    // Face. In blob form it sits mid-body; in panel form it rides near the
    // top so the form fields have the space below it.
    final faceCenter = Offset(
      bodyRect.center.dx +
          bodyRect.width * depthPose.faceOffsetX +
          (centerFaceHorizontally ? 0 : wave * unit * 0.5 * blobbiness),
      bodyRect.top + bodyRect.height * faceAnchor,
    );
    final visibleFrontFace =
        (1 - faceFade).clamp(0.0, 1.0) * depthPose.frontVisibility;
    if (showFace && visibleFrontFace > 0.001) {
      final profileContext = _slopProfileFaceContextFor(
        depthPose,
        bodyRect,
        body,
        faceCenter.dx,
      );
      if (visibleFrontFace < 0.998) {
        canvas.saveLayer(
          bodyRect.inflate(bodyRect.width),
          Paint()..color = Colors.white.withValues(alpha: visibleFrontFace),
        );
      }
      canvas.save();
      // A turned face is a decal wrapped onto the gel, not a flat card pasted
      // through it. Clipping to the exact live silhouette lets the body rim
      // occlude the far half of an edge-on eye/accessory. Together with the
      // tangent surface anchor above, this produces the small contact crescent
      // expected at a side profile instead of an eye floating inside the gel.
      if (!depthPose.isNeutral) canvas.clipPath(body);
      canvas.translate(faceCenter.dx, faceCenter.dy);
      canvas.scale(depthPose.faceScaleX, 1);
      canvas.translate(-faceCenter.dx, -faceCenter.dy);
      _paintFace(
        canvas,
        center: faceCenter,
        unit: unit * faceScale,
        look: look,
        emotion: emotion,
        phase: phase,
        gaze: gaze,
        talk: math.max(talk, forceTalk),
        smirk: smirk,
        reaction: reaction,
        showMouth: showMouth,
        mouthOpacity: mouthOpacity,
        profileContext: profileContext,
        facialLineColor:
            facialLineColor ?? slopMaterialFacialLineColorFor(look),
      );
      canvas.restore();
      if (visibleFrontFace < 0.998) canvas.restore();
    }

    if (showBody) {
      SlopCapeRenderer.paint(
        canvas,
        bodyRect,
        cape: look.cape,
        bodyShape: look.body,
        orientationAngle: depthPose.orientationAngle,
        bodyScaleX: depthPose.bodyScaleX,
        phase: phase,
        frontPass: true,
        bodyOutline: body,
        opacity: 1 - round.clamp(0.0, 1.0),
      );
    }
    if (ambient) {
      _paintAmbient(
        canvas,
        bodyRect,
        look,
        phase,
        reaction,
        depthPose: depthPose,
        depthPass: auraDepthPass,
      );
    }

    if (opacity < 1) canvas.restore();
    canvas.restore();
  }

  /// The silhouette.
  ///
  /// Sampled as a rounded box around the centre so a blob and a panel are the
  /// same equation at different corner radii — that is what makes the
  /// composer→build morph continuous. Slime is heavy at the bottom, so the
  /// lower half is widened and the base flattened.
  /// A limb grown out of the body: a direction, how far past the surface it
  /// reaches, how wide its base is, and the size of the blob on the end.
  ///
  /// Crucially it is a bulge in the OUTLINE, not a shape drawn on top — so the
  /// base swells smoothly out of the body with no seam, which is the whole
  /// difference between "slime reaching out" and "a stick glued on".
  static Path _bodyPath(
    Rect rect, {
    required double round,
    required double wobble,
    required double phase,
    required double spread,
    double lean = 0,
    double tipScale = 1,
    double shear = 0,
    double twist = 0,
    double rippleBoost = 0,
    double heart = 0,
    SlopShift? silhouette,
    double silhouetteMorph = 0,
    double waist = 0,
    List<({double angle, double length, double width, double hand})> limbs =
        const [],
  }) {
    final hw = rect.width / 2;
    final hh = rect.height / 2;
    // A rounded rectangle's radius can never exceed half its shortest side.
    // The old panel target used width alone, so very wide caption Slops could
    // ask for a corner larger than their entire half-height. That collapsed
    // the ray construction into a thin line with a circular knot in the
    // middle on Fold-sized lanes. Clamp the authored 9% radius to the same
    // liquid inset used by the blob endpoint so every aspect ratio stays a
    // filled, smooth panel.
    final maxCorner = math.min(hw, hh) * 0.90;
    final panelCorner = math.min(rect.width * 0.09, maxCorner);
    final corner = _lerp(maxCorner, panelCorner, round);
    final spin = phase * math.pi * 2;
    const top = -math.pi / 2;

    const samples = 128;
    final points = <Offset>[];
    Offset roundedRectRayPoint(double dx, double dy) {
      final x = dx.abs();
      final y = dy.abs();
      if (x < 1e-9) return Offset(0, dy.sign * hh);
      if (y < 1e-9) return Offset(dx.sign * hw, 0);

      final innerX = math.max(0.0, hw - corner);
      final innerY = math.max(0.0, hh - corner);
      final sideXHit = hw / x;
      if (sideXHit * y <= innerY) {
        return Offset(dx * sideXHit, dy * sideXHit);
      }
      final sideYHit = hh / y;
      if (sideYHit * x <= innerX) {
        return Offset(dx * sideYHit, dy * sideYHit);
      }

      // The ray meets the quarter-circle centered at the inner corner.
      // Because (dx,dy) is a unit vector, the outward quadratic root is the
      // exact distance to the rounded-rectangle boundary.
      final dot = x * innerX + y * innerY;
      final innerSquared = innerX * innerX + innerY * innerY;
      final discriminant = math.max(
        0.0,
        dot * dot - (innerSquared - corner * corner),
      );
      final distance = dot + math.sqrt(discriminant);
      return Offset(dx * distance, dy * distance);
    }

    for (var i = 0; i < samples; i++) {
      final a = i / samples * math.pi * 2;
      final dx = math.cos(a);
      final dy = math.sin(a);
      final box = roundedRectRayPoint(dx, dy);
      // An ellipse stays smooth however wide or flat the body gets; a rounded
      // box does not. The panel form wants the box, the blob wants the ellipse.
      final ellipse = Offset(dx * hw, dy * hh);
      var p = Offset.lerp(ellipse, box, round)!;

      // The crown stays a smooth dome. A very broad, shallow breathing swell
      // keeps the outline alive without creating a tuft, horn, or point.
      var tip =
          0.018 * _bump(_angleDelta(a, top + lean * 0.10), 0.94) * tipScale;

      // The heart owns its complete target outline below. Fade the ordinary
      // crown swell out so no legacy peak survives between its two lobes.
      if (heart > 0 || silhouetteMorph > 0) {
        tip *= 1 - math.max(heart, silhouetteMorph);
      }

      // Limbs: a narrow, tall gaussian in the radius. The gaussian's tails ARE
      // the shoulder — the body swells into the limb instead of sprouting one.
      for (final limb in limbs) {
        if (limb.length <= 0) continue;
        tip += limb.length * _bump(_angleDelta(a, limb.angle), limb.width);
      }

      // Living surface: two out-of-phase ripples so it never looks like a
      // rotating shape.
      final ripple =
          (math.sin(a * 3 + spin) * 0.008 +
              // The renderer clock wraps once per cycle. An integer harmonic
              // keeps the secondary ripple continuous at that seam too.
              math.sin(a * 5 - spin * 2) * 0.004) *
          (1 + rippleBoost);
      p = p * (1 + (ripple + tip) * wobble);

      // Gravity. Slime is heavy: it narrows at the shoulders and pools into a
      // wide, nearly flat base. This is most of what separates it from a ball.
      final v = (p.dy / hh).clamp(-1.0, 1.0);
      final widen =
          1 +
          wobble * (0.13 * v + 0.12 * v * v - 0.03) +
          spread * 0.3 * v.clamp(0, 1);
      var flatten = v > 0 ? 1 - wobble * 0.13 * v * v : 1.0;
      // Pinch: squeeze the middle in, as if about to divide.
      final pinch = waist > 0 ? 1 - waist * 0.42 * _bump(v, 0.34) : 1.0;
      var out = Offset(p.dx * widen * pinch, p.dy * flatten);

      if (heart > 0) {
        final target = slopHeartSilhouettePointFor(a);
        // A trace of the living surface remains at full morph, but the authored
        // heart dominates. This avoids both a rigid icon and the old lumpy
        // almost-heart silhouette.
        final heartRipple = 1 + ripple * wobble * 0.18;
        final heartPoint = Offset(
          target.dx * hw * 0.98 * heartRipple,
          target.dy * hh * 0.97 * heartRipple,
        );
        out = Offset.lerp(out, heartPoint, heart)!;
      }
      if (silhouette != null && silhouetteMorph > 0) {
        final target = slopShiftSilhouettePointFor(silhouette, a);
        final livingRipple = 1 + ripple * wobble * 0.12;
        final targetPoint = Offset(
          target.dx * hw * livingRipple,
          target.dy * hh * livingRipple,
        );
        out = Offset.lerp(out, targetPoint, silhouetteMorph)!;
      }
      // Lean: the body shears over, anchored at its base.
      if (shear != 0) {
        out = Offset(out.dx + shear * hw * (-out.dy / hh) * 0.5, out.dy);
      }
      // Twist: rotation grows with height, so it winds like soft-serve.
      if (twist != 0) {
        final k = twist * (-out.dy / hh);
        final c = math.cos(k);
        final sn = math.sin(k);
        out = Offset(
          out.dx * c - out.dy * sn * 0.55,
          out.dy * c + out.dx * sn * 0.55,
        );
      }
      points.add(Offset(rect.center.dx + out.dx, rect.center.dy + out.dy));
    }

    // Smooth the samples through their midpoints — a closed quadratic spline
    // reads as liquid where straight segments would read as faceted.
    final path = Path();
    final first = (points[0] + points[1]) / 2;
    path.moveTo(first.dx, first.dy);
    for (var i = 1; i <= points.length; i++) {
      final current = points[i % points.length];
      final next = points[(i + 1) % points.length];
      final mid = (current + next) / 2;
      path.quadraticBezierTo(current.dx, current.dy, mid.dx, mid.dy);
    }
    path.close();
    return path;
  }

  /// A droplet pinched off the crown that hovers, then rejoins.
  static void _paintDroplet(
    Canvas canvas,
    Rect rect,
    Paint bodyPaint,
    SlopPalette palette,
    double e,
    double t,
  ) {
    if (e <= 0.02) return;
    final unit = rect.width / 100;
    final r = unit * 9 * e;
    if (r <= 0.5) return;
    final y = rect.top - rect.height * 0.28 * e;
    final x =
        rect.center.dx + math.sin(t * math.pi * 2) * rect.width * 0.15 * e;
    // The thread is thickest while it is still leaving or already returning.
    final thread = (1 - e).clamp(0.0, 1.0) * e;
    if (thread > 0.04) {
      canvas.drawLine(
        Offset(x, y + r),
        Offset(rect.center.dx, rect.top + unit * 4),
        Paint()
          ..color = palette.mid.withValues(alpha: (thread * 3).clamp(0.0, 0.6))
          ..strokeWidth = unit * 2.6 * e
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.drawCircle(Offset(x, y), r, bodyPaint);
    canvas.drawCircle(
      Offset(x - r * 0.3, y - r * 0.34),
      r * 0.3,
      Paint()..color = Colors.white.withValues(alpha: 0.55 * e),
    );
  }

  /// Quantized cel bands that make the live gel silhouette read as a rounded
  /// 3D gummy rendered with a toon shader. The caller has already clipped to
  /// the exact active body path, including reaction squash, lean, limbs, and
  /// authored shape-shifts.
  static void _paintToonVolume(
    Canvas canvas,
    Rect bodyRect,
    SlopLook look,
    SlopToonDepthPose depthPose,
  ) {
    final codeSkin =
        look.pattern == SlopPattern.slopCode &&
        look.finish != SlopFinish.clearGlass;
    final strengths = switch (look.finish) {
      _ when codeSkin => (
        light: 0.055,
        mid: 0.025,
        shade: 0.150,
        contour: 0.100,
      ),
      // Optically complex finishes already carry strong authored contrast.
      // Their quieter overlay keeps glass transparent and metals crisp.
      SlopFinish.clearGlass => (
        light: 0.035,
        mid: 0.022,
        shade: 0.060,
        contour: 0.040,
      ),
      SlopFinish.chrome => (
        light: 0.055,
        mid: 0.025,
        shade: 0.085,
        contour: 0.060,
      ),
      SlopFinish.gold => (
        light: 0.065,
        mid: 0.040,
        shade: 0.095,
        contour: 0.065,
      ),
      SlopFinish.wildfire => (
        light: 0.042,
        mid: 0.030,
        shade: 0.105,
        contour: 0.055,
      ),
      // Cel Pop authors its own hard color planes. The shared toon shader
      // still supplies the rounded 2.5D light direction, but stays quiet
      // enough that the finish does not turn into a smooth gradient.
      SlopFinish.celPop => (
        light: 0.045,
        mid: 0.028,
        shade: 0.105,
        contour: 0.070,
      ),
      SlopFinish.hologram || SlopFinish.aurora || SlopFinish.tidepool => (
        light: 0.070,
        mid: 0.040,
        shade: 0.105,
        contour: 0.060,
      ),
      SlopFinish.obsidian || SlopFinish.galaxy => (
        light: 0.085,
        mid: 0.050,
        shade: 0.125,
        contour: 0.085,
      ),
      _ => (light: 0.205, mid: 0.105, shade: 0.235, contour: 0.145),
    };
    final clear = look.finish == SlopFinish.clearGlass;
    final p = look.palette;
    final frontCrown = clear
        ? const Color(0xFFDDF9FF)
        : Color.lerp(p.light, p.mid, 0.36)!;
    final frontWarmMid = clear
        ? const Color(0xFF7AC7D6)
        : Color.lerp(p.mid, p.deep, 0.18)!;
    final frontPooled = clear ? const Color(0xFF173743) : p.shade;
    // A back view is the same selected material, not a replacement sprite.
    // Darkening the existing four cel planes preserves every finish/pattern
    // while clearly separating the faceless rear volume from the front cheek.
    final rearWeight = depthPose.backVisibility;
    final crown = Color.lerp(frontCrown, p.deep, rearWeight * 0.28)!;
    final warmMid = Color.lerp(frontWarmMid, p.shade, rearWeight * 0.22)!;
    final pooled = Color.lerp(frontPooled, Colors.black, rearWeight * 0.10)!;

    // A top-left light lobe with duplicated stops is the first unmistakable
    // toon band. The tiny 2% transition keeps anti-aliasing pleasant without
    // turning the band back into an airbrushed gradient.
    canvas.drawRect(
      bodyRect,
      Paint()
        ..shader = RadialGradient(
          center: Alignment(-0.54 + depthPose.lightOffsetX * 0.16, -0.64),
          radius: 0.92,
          colors: [
            crown.withValues(alpha: strengths.light),
            crown.withValues(alpha: strengths.light),
            crown.withValues(alpha: strengths.light * 0.22),
            Colors.transparent,
          ],
          stops: const [0, 0.54, 0.56, 0.58],
        ).createShader(bodyRect),
    );

    // A warm offset mid-plane creates the rounded cheek/face platform. Its
    // duplicated stops form a second deliberate value island rather than an
    // arbitrary spot of smooth light.
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(
          bodyRect.center.dx + bodyRect.width * (0.16 + depthPose.lightOffsetX),
          bodyRect.center.dy + bodyRect.height * 0.05,
        ),
        width: bodyRect.width * 0.92,
        height: bodyRect.height * 0.60,
      ),
      Paint()
        ..shader = RadialGradient(
          center: Alignment(-0.20 + depthPose.lightOffsetX * 0.72, -0.16),
          radius: 0.92,
          colors: [
            warmMid.withValues(alpha: strengths.mid),
            warmMid.withValues(alpha: strengths.mid),
            warmMid.withValues(alpha: strengths.mid * 0.18),
            Colors.transparent,
          ],
          stops: const [0, 0.64, 0.66, 0.69],
        ).createShader(bodyRect),
    );

    // Horizontal shadow steps quantize the lower mass into base, shadow, and
    // underside. Repeated values on either side of each boundary preserve the
    // material underneath while making the band transition clearly readable.
    canvas.drawRect(
      bodyRect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            Colors.transparent,
            pooled.withValues(alpha: strengths.shade * 0.48),
            pooled.withValues(alpha: strengths.shade * 0.48),
            pooled.withValues(alpha: strengths.shade * 0.86),
            pooled.withValues(alpha: strengths.shade * 0.86),
            pooled.withValues(alpha: strengths.shade),
          ],
          stops: const [0, 0.58, 0.60, 0.74, 0.76, 0.90, 1],
        ).createShader(bodyRect),
    );

    // The lower-right contour lobe is the fourth quantized band, turning the
    // gummy volume away from the virtual key light. It never becomes a white
    // rim or a glossy side crescent.
    canvas.drawRect(
      bodyRect,
      Paint()
        ..shader = RadialGradient(
          center: Alignment(0.78 - depthPose.lightOffsetX * 1.35, 0.68),
          radius: 0.96,
          colors: [
            pooled.withValues(alpha: strengths.contour),
            pooled.withValues(alpha: strengths.contour),
            pooled.withValues(alpha: strengths.contour * 0.20),
            Colors.transparent,
          ],
          stops: const [0, 0.52, 0.54, 0.57],
        ).createShader(bodyRect),
    );
  }

  /// Material-specific ramps keep collectible finishes visually meaningful at
  /// every size. The face still uses the owner's palette ink, so even the
  /// loudest legendary skin remains recognizably their Slop.
  /// The canonical color ramp for the equipped physical finish.
  ///
  /// Public because full-screen Slop anatomy (such as Studio's generated-game
  /// mouth) must preserve the exact material instead of falling back to the
  /// owner's palette color.
  static List<Color> materialBodyColors(SlopLook look) {
    if (look.pattern == SlopPattern.slopCode &&
        look.finish != SlopFinish.clearGlass) {
      return const [
        Color(0xFF15251D),
        Color(0xFF09120D),
        Color(0xFF050A07),
        Color(0xFF020503),
        Color(0xFF010201),
      ];
    }
    final p = look.palette;
    return switch (look.finish) {
      SlopFinish.jelly => [p.glow, p.light, p.mid, p.deep, p.shade],
      SlopFinish.gummy => [p.light, p.light, p.mid, p.deep, p.shade],
      SlopFinish.pearl => [
        Color.lerp(p.glow, Colors.white, 0.62)!,
        Color.lerp(p.light, const Color(0xFFFFEAF8), 0.35)!,
        Color.lerp(p.mid, const Color(0xFFB9E9FF), 0.28)!,
        Color.lerp(p.deep, const Color(0xFFD9C5FF), 0.25)!,
        p.shade,
      ],
      SlopFinish.galaxy => const [
        Color(0xFF8D7CFF),
        Color(0xFF493F98),
        Color(0xFF211B55),
        Color(0xFF100D2E),
        Color(0xFF050611),
      ],
      SlopFinish.molten => [
        const Color(0xFFFFF0A3),
        const Color(0xFFFFA324),
        Color.lerp(p.mid, const Color(0xFFF34A16), 0.65)!,
        const Color(0xFF7A160B),
        const Color(0xFF260907),
      ],
      SlopFinish.chrome => const [
        Color(0xFFFFFFFF),
        Color(0xFF8995A8),
        Color(0xFFF5F8FF),
        Color(0xFF4B5568),
        Color(0xFF10151E),
      ],
      SlopFinish.hologram => const [
        Color(0xFFF5FFFF),
        Color(0xFF7BF5DE),
        Color(0xFF8D9BFF),
        Color(0xFFE06BE8),
        Color(0xFF492270),
      ],
      SlopFinish.aurora => const [
        Color(0xFFE8FFF9),
        Color(0xFF62F2C7),
        Color(0xFF4B8BFF),
        Color(0xFF9A54E8),
        Color(0xFF251449),
      ],
      SlopFinish.crystal => const [
        Color(0xFFFFFFFF),
        Color(0xFFBDEEFF),
        Color(0xFF8CB8E8),
        Color(0xFF826FC7),
        Color(0xFF27304F),
      ],
      SlopFinish.obsidian => const [
        Color(0xFFBDA7FF),
        Color(0xFF514371),
        Color(0xFF252035),
        Color(0xFF111019),
        Color(0xFF050509),
      ],
      SlopFinish.firstBatch => const [
        Color(0xFFFFB05A),
        Color(0xFF6E2A88),
        Color(0xFF2B0C45),
        Color(0xFF16051F),
        Color(0xFF050208),
      ],
      SlopFinish.clearGlass => slopClearGlassBodyColors,
      SlopFinish.gold => const [
        Color(0xFFFFF7CF),
        Color(0xFFFFD86C),
        Color(0xFFFFEFA4),
        Color(0xFFB86A0C),
        Color(0xFF4B2604),
      ],
      SlopFinish.wildfire => const [
        Color(0xFFFFD29A),
        Color(0xFFE96427),
        Color(0xFF651F1C),
        Color(0xFF281017),
        Color(0xFF09070B),
      ],
      SlopFinish.celPop => const [
        Color(0xFFFFF2A8),
        Color(0xFFFFB43B),
        Color(0xFFFF5B7F),
        Color(0xFF8B43D6),
        Color(0xFF281744),
      ],
      SlopFinish.tidepool => const [
        Color(0xFFE8FFFA),
        Color(0xFF59E7D1),
        Color(0xFF117F91),
        Color(0xFF163A64),
        Color(0xFF09162F),
      ],
    };
  }

  /// Large reflections, veils, facets, and internal fields sell each finish as
  /// a different physical object instead of a palette swap. Detail scale is
  /// height-clamped: the For You ribbon can be several times wider than a
  /// resting Slop, and width-based strokes used to balloon into worm-like
  /// squiggles across that surface.
  /// Paints the canonical finish details into an already-clipped material
  /// surface. Callers own the silhouette clip; this method owns glass,
  /// chrome, crystal, galaxy, and every other authored finish treatment.
  static void paintMaterialFinish(
    Canvas canvas,
    Rect rect,
    SlopLook look,
    double phase,
    double _,
  ) {
    if (paintSlopSignatureMaterial(canvas, rect, look, phase)) return;
    final detail = slopFinishDetailUnitFor(rect);
    final cycle = phase * math.pi * 2;

    void field({
      required Offset center,
      required double width,
      required double height,
      Color? color,
      Gradient? gradient,
      double rotation = 0,
      double blur = 0,
    }) {
      assert(color != null || gradient != null);
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.rotate(rotation);
      final bounds = Rect.fromCenter(
        center: Offset.zero,
        width: width,
        height: height,
      );
      final paint = Paint();
      if (gradient case final materialGradient?) {
        paint.shader = materialGradient.createShader(bounds);
      } else {
        paint.color = color!;
      }
      if (blur > 0) {
        paint.maskFilter = MaskFilter.blur(BlurStyle.normal, blur);
      }
      canvas.drawOval(bounds, paint);
      canvas.restore();
    }

    switch (look.finish) {
      case SlopFinish.jelly:
        // A pooled inner caustic keeps Living Jelly wet and translucent.
        field(
          center: Offset(
            rect.center.dx - rect.width * 0.08,
            rect.top + rect.height * 0.60,
          ),
          width: rect.width * 0.62,
          height: rect.height * 0.22,
          color: look.palette.glow.withValues(
            alpha: look.pattern == SlopPattern.slopCode ? 0.018 : 0.10,
          ),
          blur: detail * 6,
        );
      case SlopFinish.gummy:
        // Broad matte compression, not Jelly's watery pool or noisy sugar
        // specks. A dense lower field and a few buried granules make the body
        // feel chewy and opaque; the generic wet crescent is suppressed.
        field(
          center: Offset(rect.center.dx, rect.top + rect.height * 0.25),
          width: rect.width * 0.72,
          height: rect.height * 0.31,
          color: Colors.white.withValues(alpha: 0.14),
          blur: detail * 6,
        );
        field(
          center: Offset(rect.center.dx, rect.top + rect.height * 0.76),
          width: rect.width * 0.78,
          height: rect.height * 0.24,
          color: look.palette.shade.withValues(alpha: 0.24),
          blur: detail * 6,
        );
        for (final granule in const [
          (0.20, 0.67, 2.4),
          (0.80, 0.38, 2.0),
          (0.76, 0.76, 1.7),
        ]) {
          canvas.drawCircle(
            Offset(
              rect.left + rect.width * granule.$1,
              rect.top + rect.height * granule.$2,
            ),
            detail * granule.$3,
            Paint()
              ..color = Colors.white.withValues(alpha: 0.11)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 1.4),
          );
        }
      case SlopFinish.pearl:
        final travel = math.sin(phase * math.pi * 2) * rect.width * 0.06;
        field(
          center: rect.center.translate(travel, -rect.height * 0.07),
          width: rect.width * 0.86,
          height: rect.height * 0.48,
          rotation: -0.10,
          blur: detail * 1.8,
          gradient: const LinearGradient(
            colors: [
              Color(0x00FFFFFF),
              Color(0x42A8F4FF),
              Color(0x52FFD0F0),
              Color(0x18FFF4C9),
              Color(0x00FFFFFF),
            ],
            stops: [0, 0.28, 0.53, 0.72, 1],
          ),
        );
      case SlopFinish.galaxy:
        field(
          center: Offset(
            rect.left + rect.width * (0.32 + math.sin(cycle) * 0.015),
            rect.top + rect.height * 0.68,
          ),
          width: rect.width * 0.62,
          height: rect.height * 0.30,
          rotation: -0.18,
          color: const Color(0xFF9D68FF).withValues(alpha: 0.20),
          blur: detail * 10,
        );
        field(
          center: Offset(
            rect.left + rect.width * 0.72,
            rect.top + rect.height * 0.34,
          ),
          width: rect.width * 0.42,
          height: rect.height * 0.22,
          rotation: 0.22,
          color: const Color(0xFF67DDF3).withValues(alpha: 0.12),
          blur: detail * 8,
        );
        const stars = [
          (0.22, 0.31, 1.8),
          (0.76, 0.28, 1.35),
          (0.80, 0.69, 1.65),
          (0.30, 0.79, 1.15),
        ];
        for (final (x, y, radius) in stars) {
          final pulse = 0.68 + 0.32 * math.sin(phase * math.pi * 2 + x * 9);
          _sparkle(
            canvas,
            Offset(rect.left + x * rect.width, rect.top + y * rect.height),
            detail * radius * pulse,
            Paint()..color = Colors.white.withValues(alpha: 0.80 * pulse),
          );
        }
      case SlopFinish.molten:
        field(
          center: Offset(
            rect.center.dx,
            rect.top + rect.height * (0.72 + math.sin(cycle) * 0.012),
          ),
          width: rect.width * 0.72,
          height: rect.height * 0.34,
          color: const Color(0xFFFFB62F).withValues(alpha: 0.30),
          blur: detail * 11,
        );
        field(
          center: Offset(
            rect.left + rect.width * 0.18,
            rect.top + rect.height * 0.60,
          ),
          width: math.min(rect.width * 0.22, rect.height * 0.34),
          height: rect.height * 0.15,
          rotation: -0.25,
          color: const Color(0xFF260907).withValues(alpha: 0.30),
          blur: detail * 4.5,
        );
        field(
          center: Offset(
            rect.left + rect.width * 0.84,
            rect.top + rect.height * 0.72,
          ),
          width: math.min(rect.width * 0.18, rect.height * 0.28),
          height: rect.height * 0.12,
          rotation: 0.18,
          color: const Color(0xFF4A0E08).withValues(alpha: 0.24),
          blur: detail * 4,
        );
      case SlopFinish.chrome:
        field(
          center: Offset(
            rect.left + rect.width * 0.28,
            rect.top + rect.height * 0.43,
          ),
          width: rect.width * 0.28,
          height: rect.height * 1.02,
          rotation: -0.22,
          blur: detail * 2.4,
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0x00FFFFFF), Color(0xA8FFFFFF), Color(0x00FFFFFF)],
            stops: [0, 0.52, 1],
          ),
        );
        field(
          center: Offset(
            rect.left + rect.width * 0.73,
            rect.top + rect.height * 0.63,
          ),
          width: rect.width * 0.22,
          height: rect.height * 0.72,
          rotation: -0.16,
          color: const Color(0xFF08111D).withValues(alpha: 0.30),
          blur: detail * 3,
        );
      case SlopFinish.hologram:
        final sheen = math.sin(cycle) * rect.width * 0.12;
        field(
          center: rect.center.translate(sheen, -rect.height * 0.02),
          width: rect.width * 0.78,
          height: rect.height * 0.28,
          rotation: -0.24,
          blur: detail * 0.9,
          gradient: const LinearGradient(
            colors: [
              Color(0x0076F6DE),
              Color(0x7A9FFFE8),
              Color(0x92D8E5FF),
              Color(0x80FF91EA),
              Color(0x00FF84DF),
            ],
            stops: [0, 0.20, 0.50, 0.80, 1],
          ),
        );
        field(
          center: Offset(
            rect.left + rect.width * 0.34,
            rect.top + rect.height * 0.27,
          ),
          width: rect.width * 0.46,
          height: rect.height * 0.16,
          rotation: -0.18,
          color: Colors.white.withValues(alpha: 0.13),
          blur: detail * 4,
        );
      case SlopFinish.aurora:
        for (final veil in const [
          (0.28, 0.61, 0.64, 0.26, -0.22, Color(0xFF10C9A5)),
          (0.56, 0.46, 0.72, 0.24, 0.14, Color(0xFF7154D8)),
          (0.77, 0.68, 0.58, 0.28, -0.12, Color(0xFFD65CB9)),
        ]) {
          final drift = math.sin(cycle + veil.$1 * 8) * rect.width * 0.025;
          field(
            center: Offset(
              rect.left + rect.width * veil.$1 + drift,
              rect.top + rect.height * veil.$2,
            ),
            width: rect.width * veil.$3,
            height: rect.height * veil.$4,
            rotation: veil.$5,
            color: veil.$6.withValues(alpha: 0.24),
            blur: detail * 7,
          );
        }
      case SlopFinish.crystal:
        // Shared signature surface is painted before this switch.
        break;
      case SlopFinish.obsidian:
        // Shared signature surface is painted before this switch.
        break;
      case SlopFinish.firstBatch:
        // The beta finish has one unforgettable signature: a breathing hot
        // tangerine core inside near-black violet gel, plus a filled batch
        // stamp. No interference waves compete with the face or ribbon form.
        final core = Offset(rect.center.dx, rect.top + rect.height * 0.60);
        final pulse = 0.92 + 0.08 * math.sin(cycle);
        canvas.drawCircle(
          core,
          rect.shortestSide * 0.34 * pulse,
          Paint()
            ..color = const Color(
              0xFFFF6A18,
            ).withValues(alpha: 0.40 + 0.08 * pulse)
            ..maskFilter = MaskFilter.blur(
              BlurStyle.normal,
              rect.shortestSide * 0.14,
            ),
        );
        canvas.drawCircle(
          core,
          rect.shortestSide * 0.18,
          Paint()
            ..color = const Color(
              0xFFFFB22F,
            ).withValues(alpha: 0.26 + 0.08 * pulse)
            ..maskFilter = MaskFilter.blur(
              BlurStyle.normal,
              rect.shortestSide * 0.08,
            ),
        );
        // Three soft batch embers replace the old target rings. They remain a
        // small asymmetric maker's mark instead of becoming a bullseye on the
        // wide ribbon.
        for (final ember in const [
          (0.76, 0.77, 0.050, Color(0xFFFFA24F)),
          (0.84, 0.68, 0.031, Color(0xFF63EED1)),
          (0.68, 0.84, 0.026, Color(0xFFB477FF)),
        ]) {
          canvas.drawCircle(
            Offset(
              rect.left + rect.width * ember.$1,
              rect.top + rect.height * ember.$2,
            ),
            rect.shortestSide * ember.$3,
            Paint()
              ..color = ember.$4.withValues(alpha: 0.34)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 1.8),
          );
        }
      case SlopFinish.clearGlass:
        // Clear Glass contains no cloudy fill or palette tint. Clean edge
        // refraction and a broad pooled caustic communicate lens thickness.
        final leftEdge = Rect.fromLTWH(
          rect.left + rect.width * 0.075,
          rect.top + rect.height * 0.10,
          rect.width * 0.30,
          rect.height * 0.74,
        );
        canvas.drawArc(
          leftEdge,
          math.pi * 0.60,
          math.pi * 0.72,
          false,
          Paint()
            ..color = Colors.white.withValues(alpha: 0.58)
            ..style = PaintingStyle.stroke
            ..strokeWidth = detail * 2.4
            ..strokeCap = StrokeCap.round
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 0.55),
        );
        canvas.drawArc(
          Rect.fromLTWH(
            rect.right - rect.width * 0.27,
            rect.top + rect.height * 0.18,
            rect.width * 0.18,
            rect.height * 0.60,
          ),
          -math.pi * 0.46,
          math.pi * 0.58,
          false,
          Paint()
            ..color = const Color(0xFF9BE8FF).withValues(alpha: 0.34)
            ..style = PaintingStyle.stroke
            ..strokeWidth = detail * 1.7
            ..strokeCap = StrokeCap.round,
        );
        final drift = math.sin(cycle) * rect.width * 0.018;
        field(
          center: Offset(rect.center.dx + drift, rect.top + rect.height * 0.76),
          width: rect.width * 0.62,
          height: rect.height * 0.13,
          rotation: -0.05,
          color: const Color(0xFF8FE9FF).withValues(alpha: 0.12),
          blur: detail * 4.5,
        );
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(
              rect.left + rect.width * 0.73,
              rect.top + rect.height * 0.31,
            ),
            width: detail * 4.8,
            height: detail * 8.4,
          ),
          Paint()..color = Colors.white.withValues(alpha: 0.76),
        );
      case SlopFinish.gold:
        // Shared signature surface is painted before this switch.
        break;
      case SlopFinish.wildfire:
        // Wildfire is a deep gel carrying a few closed flame inclusions. Every
        // lobe is sized from body height so the ribbon gains more breathing
        // room, not one horizontally stretched flame.
        field(
          center: Offset(rect.center.dx, rect.top + rect.height * 0.78),
          width: math.min(rect.width * 0.66, rect.height * 1.05),
          height: rect.height * 0.34,
          color: const Color(0xFFFF6B24).withValues(alpha: 0.24),
          blur: detail * 11,
        );
        final flicker = 0.96 + 0.04 * math.sin(cycle);
        Path flame(Offset center, double size, double lean) => Path()
          ..moveTo(center.dx, center.dy + size * 0.58)
          ..cubicTo(
            center.dx - size * 0.55,
            center.dy + size * 0.24,
            center.dx - size * 0.34,
            center.dy - size * 0.18,
            center.dx + lean * size * 0.12,
            center.dy - size * 0.62,
          )
          ..cubicTo(
            center.dx + size * 0.12,
            center.dy - size * 0.18,
            center.dx + size * 0.54,
            center.dy + size * 0.20,
            center.dx,
            center.dy + size * 0.58,
          )
          ..close();
        for (final ember in const [
          (0.21, 0.63, 0.16, -1.0, Color(0xFFFF8A2B)),
          (0.79, 0.68, 0.19, 1.0, Color(0xFFFFB33F)),
          (0.70, 0.33, 0.11, -0.6, Color(0xFFFF7040)),
        ]) {
          final size = rect.shortestSide * ember.$3 * flicker;
          final shape = flame(
            Offset(
              rect.left + rect.width * ember.$1,
              rect.top + rect.height * ember.$2,
            ),
            size,
            ember.$4,
          );
          canvas.drawPath(
            shape,
            Paint()
              ..color = ember.$5.withValues(alpha: 0.38)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 1.8),
          );
          canvas.drawPath(
            shape,
            Paint()..color = ember.$5.withValues(alpha: 0.22),
          );
        }
      case SlopFinish.celPop:
        // Shared signature surface is painted before this switch.
        break;
      case SlopFinish.tidepool:
        // A deep glass body carrying luminous water-caustic ribbons. The
        // paths travel by only a few detail units, so they stay pristine on a
        // resting Slop and never stretch into stripes in the wide feed ribbon.
        final drift = math.sin(cycle) * detail * 2.1;
        for (final current in const [
          (0.18, 0.30, -0.14, Color(0xFF6FFFF0)),
          (0.50, 0.56, 0.10, Color(0xFF42BFFF)),
          (0.76, 0.74, -0.08, Color(0xFFB57CFF)),
        ]) {
          final y = rect.top + rect.height * current.$2;
          final ribbon = Path()
            ..moveTo(rect.left - detail * 3, y + drift)
            ..cubicTo(
              rect.left + rect.width * 0.28,
              y - rect.height * 0.08 - drift,
              rect.left + rect.width * 0.62,
              y + rect.height * 0.08 + drift,
              rect.right + detail * 3,
              y - rect.height * 0.03 - drift,
            );
          canvas.drawPath(
            ribbon,
            Paint()
              ..color = current.$4.withValues(alpha: 0.30)
              ..style = PaintingStyle.stroke
              ..strokeWidth = detail * 5.2
              ..strokeCap = StrokeCap.round
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 3.2),
          );
          canvas.drawPath(
            ribbon,
            Paint()
              ..color = Colors.white.withValues(alpha: 0.24)
              ..style = PaintingStyle.stroke
              ..strokeWidth = detail * 1.05
              ..strokeCap = StrokeCap.round,
          );
        }
        for (final pearl in const [
          (0.22, 0.72, 2.2),
          (0.71, 0.31, 1.7),
          (0.82, 0.61, 1.15),
        ]) {
          final center = Offset(
            rect.left + rect.width * pearl.$1,
            rect.top + rect.height * pearl.$2,
          );
          canvas.drawCircle(
            center,
            detail * pearl.$3,
            Paint()
              ..shader =
                  RadialGradient(
                    center: const Alignment(-0.38, -0.42),
                    colors: [
                      Colors.white.withValues(alpha: 0.92),
                      const Color(0xFF8FFFEA).withValues(alpha: 0.46),
                      const Color(0xFF124E77).withValues(alpha: 0.18),
                    ],
                  ).createShader(
                    Rect.fromCircle(center: center, radius: detail * pearl.$3),
                  ),
          );
        }
    }
  }

  static void _paintGloss(
    Canvas canvas,
    Rect rect, {
    required double wave,
    required double round,
  }) {
    final detail = slopFinishDetailUnitFor(rect);
    // A short crescent reflection is clearer and more ownable than the old
    // broad airbrushed stripe. It suggests wet jelly without washing out the
    // chosen colour or fighting patterns beneath the skin. Its feature scale
    // follows the shortest side so a wide ribbon does not turn it into a
    // stretched white brushstroke.
    final glossRect = Rect.fromCenter(
      center: Offset(
        rect.left + rect.width * 0.31 + wave * detail * 0.45,
        rect.top + rect.height * (0.22 + round * 0.01),
      ),
      width: math.min(rect.width * 0.22, rect.height * 0.62),
      height: rect.height * (0.18 - round * 0.08).clamp(0.06, 0.18),
    );
    canvas.drawArc(
      glossRect,
      math.pi * 0.92,
      math.pi * 0.72,
      false,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.52)
        ..style = PaintingStyle.stroke
        ..strokeWidth = detail * 3.2
        ..strokeCap = StrokeCap.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 0.8),
    );
    canvas.drawCircle(
      Offset(rect.right - rect.width * 0.22, rect.top + rect.height * 0.20),
      detail * 2.25,
      Paint()..color = Colors.white.withValues(alpha: 0.68),
    );
  }

  /// Keeps every marking in the same deforming body coordinate system.
  ///
  /// The clip is already the exact live silhouette. Applying this one surface
  /// transform beneath that clip makes spots, stripes, suspended candy, and
  /// every future pattern turn with the gel instead of swimming independently
  /// or requiring one pre-rendered sprite for each pose.
  static void _paintTurnedPattern(
    Canvas canvas,
    Rect rect,
    SlopLook look,
    double phase,
    SlopToonDepthPose depthPose,
  ) {
    if (look.pattern == SlopPattern.none) return;
    canvas.save();
    canvas.translate(rect.center.dx, rect.center.dy);
    canvas.translate(rect.width * depthPose.patternOffsetX, 0);
    canvas.scale(depthPose.patternScaleX, 1);
    canvas.translate(-rect.center.dx, -rect.center.dy);
    _paintPattern(canvas, rect, look, phase);
    canvas.restore();
  }

  static void _paintPattern(
    Canvas canvas,
    Rect rect,
    SlopLook look,
    double phase, {
    bool seamlessMotion = false,
  }) {
    final pattern = look.pattern;
    if (pattern == SlopPattern.none) return;
    // Patterns are surface inlays, not stretched wallpaper. Repeat a compact
    // motif field on wide ribbons while preserving the full-width Code rain.
    if (rect.width > rect.height * 1.8 &&
        pattern != SlopPattern.slopCode &&
        pattern != SlopPattern.pixelPetal &&
        pattern != SlopPattern.cloudQuilt) {
      final side = rect.height * 1.25;
      for (var x = rect.left; x < rect.right; x += side) {
        final tile = Rect.fromLTWH(x, rect.top, side, rect.height);
        canvas.save();
        canvas.clipRect(tile.intersect(rect));
        _paintPattern(
          canvas,
          tile,
          look,
          phase,
          seamlessMotion: seamlessMotion,
        );
        canvas.restore();
      }
      return;
    }
    final palette = look.palette;
    final unit = rect.width / 100;
    final tint = Paint()..color = palette.shade.withValues(alpha: 0.22);
    final lightTint = Paint()..color = palette.glow.withValues(alpha: 0.30);

    switch (pattern) {
      case SlopPattern.spots:
        const spots = [
          (0.26, 0.44, 6.5),
          (0.68, 0.34, 4.6),
          (0.76, 0.66, 7.4),
          (0.34, 0.74, 5.2),
          (0.52, 0.86, 4.0),
        ];
        for (final (x, y, r) in spots) {
          canvas.drawCircle(
            Offset(rect.left + rect.width * x, rect.top + rect.height * y),
            r * unit,
            tint,
          );
        }
      case SlopPattern.stripes:
        final stripe = Paint()
          ..color = palette.shade.withValues(alpha: 0.18)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 7;
        for (var i = -2; i < 8; i++) {
          final x = rect.left + rect.width * (i * 0.22);
          canvas.drawLine(
            Offset(x, rect.bottom),
            Offset(x + rect.width * 0.42, rect.top),
            stripe,
          );
        }
      case SlopPattern.stars:
        const stars = [
          (0.28, 0.36, 5.5),
          (0.72, 0.5, 7.0),
          (0.42, 0.78, 4.6),
          (0.66, 0.86, 3.8),
        ];
        for (final (x, y, r) in stars) {
          canvas.drawPath(
            _star(
              Offset(rect.left + rect.width * x, rect.top + rect.height * y),
              r * unit,
            ),
            lightTint,
          );
        }
      case SlopPattern.swirl:
        final swirl = Path();
        for (var i = 0; i <= 90; i++) {
          final t = i / 90;
          final a =
              t * math.pi * 3.4 +
              (seamlessMotion
                  ? .30 * math.sin(phase * math.pi * 2)
                  : phase * .6);
          final r = rect.width * 0.06 + t * rect.width * 0.3;
          final p =
              rect.center + Offset(math.cos(a) * r, math.sin(a) * r * 0.8);
          i == 0 ? swirl.moveTo(p.dx, p.dy) : swirl.lineTo(p.dx, p.dy);
        }
        canvas.drawPath(
          swirl,
          Paint()
            ..color = palette.glow.withValues(alpha: 0.34)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 3
            ..strokeCap = StrokeCap.round,
        );
      case SlopPattern.drips:
        for (var i = 0; i < 4; i++) {
          final x = rect.left + rect.width * (0.2 + i * 0.2);
          final h = rect.height * (0.24 + (i.isEven ? 0.12 : 0.0));
          final w = unit * (7 - i % 2);
          final drip = Path()
            ..moveTo(x - w, rect.top)
            ..lineTo(x + w, rect.top)
            ..cubicTo(
              x + w,
              rect.top + h * 0.7,
              x + w * 0.7,
              rect.top + h,
              x,
              rect.top + h,
            )
            ..cubicTo(
              x - w * 0.7,
              rect.top + h,
              x - w,
              rect.top + h * 0.7,
              x - w,
              rect.top,
            )
            ..close();
          canvas.drawPath(drip, tint);
        }
      case SlopPattern.bubbles:
        const bubbles = [
          (0.27, 0.39, 7.2),
          (0.65, 0.31, 4.4),
          (0.74, 0.61, 8.6),
          (0.34, 0.72, 5.8),
          (0.55, 0.84, 3.7),
        ];
        for (final (x, y, r) in bubbles) {
          final c = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y,
          );
          final radius = r * unit;
          canvas.drawCircle(
            c,
            radius,
            Paint()
              ..shader = RadialGradient(
                center: const Alignment(-0.42, -0.46),
                colors: [
                  Colors.white.withValues(alpha: 0.23),
                  palette.glow.withValues(alpha: 0.09),
                  palette.shade.withValues(alpha: 0.13),
                ],
              ).createShader(Rect.fromCircle(center: c, radius: radius)),
          );
          canvas.drawCircle(
            c,
            radius,
            Paint()
              ..color = palette.glow.withValues(alpha: 0.38)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 1.05,
          );
          canvas.drawCircle(
            c.translate(-radius * 0.28, -radius * 0.30),
            math.max(unit * 0.8, radius * 0.16),
            Paint()..color = Colors.white.withValues(alpha: 0.52),
          );
        }
      case SlopPattern.checker:
        final cell = rect.width * 0.13;
        for (var row = 0; row < 12; row++) {
          for (var col = 0; col < 10; col++) {
            if ((row + col).isOdd) continue;
            canvas.drawRect(
              Rect.fromLTWH(
                rect.left + col * cell,
                rect.top + row * cell,
                cell,
                cell,
              ),
              tint,
            );
          }
        }
      case SlopPattern.sparkles:
        const sparks = [
          (0.30, 0.34, 5.0),
          (0.70, 0.44, 7.0),
          (0.44, 0.62, 4.0),
          (0.64, 0.78, 5.5),
          (0.30, 0.80, 3.4),
        ];
        for (final (x, y, r) in sparks) {
          _sparkle(
            canvas,
            Offset(rect.left + rect.width * x, rect.top + rect.height * y),
            r * unit,
            lightTint,
          );
        }
      case SlopPattern.hearts:
        const hearts = [
          (0.30, 0.40, 6.0),
          (0.70, 0.52, 7.5),
          (0.46, 0.78, 5.0),
        ];
        for (final (x, y, r) in hearts) {
          canvas.drawPath(
            _heart(
              Offset(rect.left + rect.width * x, rect.top + rect.height * y),
              r * unit,
            ),
            Paint()..color = palette.cheek.withValues(alpha: 0.34),
          );
        }
      case SlopPattern.camo:
        const blobs = [
          (0.27, 0.34, 14.0, 9.0),
          (0.68, 0.45, 17.0, 11.0),
          (0.37, 0.68, 13.0, 9.5),
          (0.73, 0.80, 11.0, 7.5),
        ];
        for (var i = 0; i < blobs.length; i++) {
          final (x, y, w, h) = blobs[i];
          final c = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y,
          );
          final hw = w * unit / 2;
          final hh = h * unit / 2;
          final organic = Path()
            ..moveTo(c.dx - hw, c.dy)
            ..quadraticBezierTo(
              c.dx - hw * 0.72,
              c.dy - hh * 1.18,
              c.dx - hw * 0.08,
              c.dy - hh * 0.72,
            )
            ..quadraticBezierTo(
              c.dx + hw * 0.58,
              c.dy - hh * 1.12,
              c.dx + hw,
              c.dy - hh * 0.08,
            )
            ..quadraticBezierTo(
              c.dx + hw * 0.66,
              c.dy + hh * 1.12,
              c.dx + hw * 0.06,
              c.dy + hh * 0.72,
            )
            ..quadraticBezierTo(
              c.dx - hw * 0.70,
              c.dy + hh * 1.04,
              c.dx - hw,
              c.dy,
            )
            ..close();
          canvas.drawPath(
            organic,
            Paint()
              ..color = (i.isEven ? palette.shade : palette.deep).withValues(
                alpha: 0.23,
              ),
          );
          canvas.drawCircle(
            c.translate(hw * 0.12, -hh * 0.04),
            math.min(hw, hh) * 0.28,
            Paint()..color = palette.glow.withValues(alpha: 0.12),
          );
        }
      case SlopPattern.lavaLamp:
        const blobs = <(double, double, double, double)>[
          (0.28, 0.38, 0.18, 0.24),
          (0.68, 0.48, 0.23, 0.19),
          (0.42, 0.76, 0.20, 0.25),
          (0.72, 0.82, 0.12, 0.14),
        ];
        for (var i = 0; i < blobs.length; i++) {
          final (x, y, w, h) = blobs[i];
          final bob = math.sin(phase * math.pi * 2 + i * 1.7) * unit * 2.4;
          final oval = Rect.fromCenter(
            center: Offset(
              rect.left + rect.width * x,
              rect.top + rect.height * y + bob,
            ),
            width: rect.width * w,
            height: rect.height * h,
          );
          canvas.drawOval(
            oval,
            Paint()
              ..shader = RadialGradient(
                center: const Alignment(-0.3, -0.36),
                colors: [
                  palette.glow.withValues(alpha: 0.46),
                  palette.cheek.withValues(alpha: 0.28),
                  palette.deep.withValues(alpha: 0.17),
                ],
              ).createShader(oval),
          );
        }
      case SlopPattern.topographic:
        // Two side-set contour islands keep the face quiet; shorter-side
        // dimensions retain a real map contour on the stretched ribbon.
        for (final spec in const [(.34, .59, .13), (.67, .34, .11)]) {
          for (var ring = 0; ring < 3; ring++) {
            final path = Path();
            final radius = rect.shortestSide * (spec.$3 - ring * .045);
            for (var i = 0; i <= 48; i++) {
              final a = i / 48 * math.pi * 2;
              final ripple =
                  1 + .13 * math.sin(a * 3 + phase * math.pi * 2 + ring * .7);
              final x =
                  rect.left +
                  rect.width * spec.$1 +
                  math.cos(a) * radius * ripple;
              final y =
                  rect.top +
                  rect.height * spec.$2 +
                  math.sin(a) * radius * ripple * 1.2;
              if (i == 0) {
                path.moveTo(x, y);
              } else {
                path.lineTo(x, y);
              }
            }
            canvas.drawPath(
              path..close(),
              Paint()
                ..color = palette.deep.withValues(alpha: .18 + ring * .025)
                ..style = PaintingStyle.stroke
                ..strokeWidth = unit * .8
                ..strokeJoin = StrokeJoin.round,
            );
          }
        }
      case SlopPattern.confetti:
        const bits = <(double, double, double)>[
          (0.24, 0.36, -0.7),
          (0.48, 0.30, 0.4),
          (0.73, 0.42, 1.0),
          (0.33, 0.58, 0.2),
          (0.62, 0.65, -1.1),
          (0.78, 0.78, 0.6),
          (0.43, 0.84, -0.3),
        ];
        const confettiColors = [
          Color(0xFFFFF1A8),
          Color(0xFFFF75A2),
          Color(0xFF6BE8FF),
          Color(0xFFC69AFF),
        ];
        for (var i = 0; i < bits.length; i++) {
          final (x, y, angle) = bits[i];
          final c = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y,
          );
          final delta = Offset(math.cos(angle), math.sin(angle)) * unit * 3.2;
          canvas.drawLine(
            c - delta,
            c + delta,
            Paint()
              ..color = confettiColors[i % confettiColors.length].withValues(
                alpha: 0.64,
              )
              ..strokeWidth = unit * 2.1
              ..strokeCap = StrokeCap.round,
          );
        }
      case SlopPattern.nebula:
        for (final spec in const [
          (0.36, 0.50, 0.34, 0.20, Color(0xFF7E77FF)),
          (0.64, 0.62, 0.30, 0.18, Color(0xFFFF5FA2)),
        ]) {
          final (x, y, w, h, color) = spec;
          final cloud = Rect.fromCenter(
            center: Offset(
              rect.left + rect.width * x,
              rect.top + rect.height * y,
            ),
            width: rect.width * w,
            height: rect.height * h,
          );
          canvas.drawOval(
            cloud,
            Paint()
              ..color = color.withValues(alpha: 0.22)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 5),
          );
        }
        for (final point in const [
          (0.28, 0.42),
          (0.58, 0.39),
          (0.73, 0.59),
          (0.43, 0.73),
        ]) {
          final c = Offset(
            rect.left + rect.width * point.$1,
            rect.top + rect.height * point.$2,
          );
          _sparkle(
            canvas,
            c,
            unit * 2.1,
            Paint()..color = Colors.white.withValues(alpha: 0.72),
          );
        }
      case SlopPattern.kintsugi:
        final crack = Path()
          ..moveTo(rect.left + rect.width * 0.25, rect.top + rect.height * 0.23)
          ..lineTo(rect.left + rect.width * 0.42, rect.top + rect.height * 0.46)
          ..lineTo(rect.left + rect.width * 0.36, rect.top + rect.height * 0.67)
          ..lineTo(rect.left + rect.width * 0.55, rect.top + rect.height * 0.86)
          ..moveTo(rect.left + rect.width * 0.42, rect.top + rect.height * 0.46)
          ..lineTo(rect.left + rect.width * 0.66, rect.top + rect.height * 0.36)
          ..lineTo(rect.left + rect.width * 0.78, rect.top + rect.height * 0.52)
          ..moveTo(rect.left + rect.width * 0.36, rect.top + rect.height * 0.67)
          ..lineTo(
            rect.left + rect.width * 0.22,
            rect.top + rect.height * 0.78,
          );
        canvas.drawPath(
          crack,
          Paint()
            ..color = const Color(0xFFFFD76B).withValues(alpha: 0.72)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.35
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round,
        );
      case SlopPattern.fruitSlices:
        // Fruit wheels live below the glossy skin: translucent flesh, a
        // brighter rind, and radial segments. Their authored positions avoid
        // the face corridor so a pair of slices can never read as extra eyes.
        const slices = <(double, double, double, Color)>[
          (0.24, 0.43, 7.4, Color(0xFFFFB13B)),
          (0.76, 0.39, 6.0, Color(0xFFFF6F91)),
          (0.34, 0.72, 8.1, Color(0xFFB6ED55)),
          (0.70, 0.78, 6.8, Color(0xFFFFD65C)),
        ];
        for (var i = 0; i < slices.length; i++) {
          final (x, y, radiusUnits, color) = slices[i];
          final bob = math.sin(phase * math.pi * 2 + i * 1.73) * unit * 1.15;
          final center = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y + bob,
          );
          final radius = radiusUnits * unit;
          final bounds = Rect.fromCircle(center: center, radius: radius);
          canvas.drawCircle(
            center,
            radius,
            Paint()
              ..shader = RadialGradient(
                center: const Alignment(-0.3, -0.34),
                colors: [
                  Colors.white.withValues(alpha: 0.34),
                  color.withValues(alpha: 0.34),
                  Color.lerp(
                    color,
                    palette.shade,
                    0.34,
                  )!.withValues(alpha: 0.42),
                ],
              ).createShader(bounds),
          );
          canvas.drawCircle(
            center,
            radius,
            Paint()
              ..color = Color.lerp(
                color,
                Colors.white,
                0.30,
              )!.withValues(alpha: 0.62)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 1.15,
          );
          for (var segment = 0; segment < 6; segment++) {
            final angle = segment * math.pi / 3 + i * 0.18;
            final direction = Offset(math.cos(angle), math.sin(angle));
            canvas.drawLine(
              center + direction * unit * 1.5,
              center + direction * (radius - unit * 1.25),
              Paint()
                ..color = Colors.white.withValues(alpha: 0.38)
                ..strokeWidth = unit * 0.72
                ..strokeCap = StrokeCap.round,
            );
          }
          canvas.drawCircle(
            center,
            unit * 1.25,
            Paint()..color = Colors.white.withValues(alpha: 0.42),
          );
        }
      case SlopPattern.gummyWorms:
        // Small suspended candies, not full-width horizontal bands.
        for (var i = 0; i < 4; i++) {
          final spec = const [
            (.35, .35, -.5),
            (.66, .41, .9),
            (.37, .78, .5),
            (.65, .80, -.8),
          ][i];
          final center = Offset(
            rect.left + rect.width * spec.$1,
            rect.top + rect.height * spec.$2,
          );
          final size = rect.shortestSide * .14;
          final wriggle = math.sin(phase * math.pi * 2 + i * 1.7) * size * .17;
          canvas.save();
          canvas.translate(center.dx, center.dy);
          canvas.rotate(spec.$3);
          final path = Path()
            ..moveTo(-size * .65, size * .32)
            ..cubicTo(
              -size * .40,
              -size + wriggle,
              size * .25,
              size - wriggle,
              size * .68,
              -size * .28,
            );
          final color = const [
            Color(0xFFE687A9),
            Color(0xFF70C9B9),
            Color(0xFFF3D475),
            Color(0xFFADA2D6),
          ][i];
          canvas.drawPath(
            path,
            Paint()
              ..color = palette.shade.withValues(alpha: .15)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 5.7
              ..strokeCap = StrokeCap.round,
          );
          canvas.drawPath(
            path,
            Paint()
              ..color = color.withValues(alpha: .82)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 4.6
              ..strokeCap = StrokeCap.round,
          );
          canvas.drawPath(
            path.shift(Offset(-unit * .45, -unit * .4)),
            Paint()
              ..color = Colors.white.withValues(alpha: .30)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * .9
              ..strokeCap = StrokeCap.round,
          );
          canvas.restore();
        }
      case SlopPattern.arcadeBits:
        // Tiny game-control glyphs float below the gel. Alternating D-pads and
        // candy buttons make the product idea visible without turning the
        // Slop into a literal controller or entering the central face lane.
        const bits = <(double, double, bool, Color)>[
          (0.23, 0.39, true, Color(0xFF6BE8FF)),
          (0.77, 0.43, false, Color(0xFFFF7EAB)),
          (0.31, 0.75, false, Color(0xFFFFD65A)),
          (0.70, 0.80, true, Color(0xFFBDA0FF)),
        ];
        for (var i = 0; i < bits.length; i++) {
          final (x, y, isPad, color) = bits[i];
          final clock = phase * math.pi * 2 + i * 1.43;
          final center = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y + math.sin(clock) * unit * 1.3,
          );
          canvas.save();
          canvas.translate(center.dx, center.dy);
          canvas.rotate(math.sin(clock * 0.7) * 0.12);
          final shadow = Paint()
            ..color = palette.shade.withValues(alpha: 0.20)
            ..strokeCap = StrokeCap.round;
          final fill = Paint()
            ..color = color.withValues(alpha: 0.64)
            ..strokeCap = StrokeCap.round;
          if (isPad) {
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: const Offset(0, 0.7),
                  width: unit * 9.2,
                  height: unit * 3.9,
                ),
                Radius.circular(unit * 1.35),
              ),
              shadow,
            );
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: const Offset(0.7, 0),
                  width: unit * 3.9,
                  height: unit * 9.2,
                ),
                Radius.circular(unit * 1.35),
              ),
              shadow,
            );
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: Offset.zero,
                  width: unit * 8.2,
                  height: unit * 3.1,
                ),
                Radius.circular(unit),
              ),
              fill,
            );
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: Offset.zero,
                  width: unit * 3.1,
                  height: unit * 8.2,
                ),
                Radius.circular(unit),
              ),
              fill,
            );
          } else {
            for (final delta in [
              Offset(-unit * 2.8, unit * 1.4),
              Offset(unit * 2.8, -unit * 1.4),
            ]) {
              canvas.drawCircle(delta.translate(0.5, 0.7), unit * 2.55, shadow);
              canvas.drawCircle(delta, unit * 2.2, fill);
              canvas.drawCircle(
                delta.translate(-unit * 0.65, -unit * 0.72),
                unit * 0.48,
                Paint()..color = Colors.white.withValues(alpha: 0.66),
              );
            }
          }
          canvas.restore();
        }
      case SlopPattern.ginghamBloom:
        // Woven translucent ribbons follow the gel rather than becoming a
        // flat checkerboard decal. The small pressed blooms sit away from the
        // eye lane, so this remains readable on a tiny avatar and in Buddy's
        // expanded face.
        final vertical = Paint()
          ..color = const Color(0xFFFFE8F2).withValues(alpha: 0.18)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 7.2
          ..strokeCap = StrokeCap.round;
        final horizontal = Paint()
          ..color = const Color(0xFFFA8FB5).withValues(alpha: 0.15)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 6.2
          ..strokeCap = StrokeCap.round;
        for (final x in const [0.20, 0.40, 0.60, 0.80]) {
          final sway = math.sin(phase * math.pi * 2 + x * 9) * unit * 1.1;
          final path = Path()
            ..moveTo(rect.left + rect.width * x + sway, rect.top)
            ..cubicTo(
              rect.left + rect.width * (x - 0.035),
              rect.top + rect.height * 0.34,
              rect.left + rect.width * (x + 0.035),
              rect.top + rect.height * 0.68,
              rect.left + rect.width * x - sway,
              rect.bottom,
            );
          canvas.drawPath(path, vertical);
        }
        for (final y in const [0.30, 0.49, 0.68, 0.87]) {
          final lift = math.sin(phase * math.pi * 2 + y * 11) * unit * 0.8;
          final path = Path()
            ..moveTo(rect.left, rect.top + rect.height * y + lift)
            ..cubicTo(
              rect.left + rect.width * 0.32,
              rect.top + rect.height * (y - 0.025),
              rect.left + rect.width * 0.68,
              rect.top + rect.height * (y + 0.025),
              rect.right,
              rect.top + rect.height * y - lift,
            );
          canvas.drawPath(path, horizontal);
        }
        for (final bloom in const [
          (0.22, 0.34, Color(0xFFFFC7DA)),
          (0.78, 0.43, Color(0xFFFFE29B)),
          (0.31, 0.77, Color(0xFFD9C3FF)),
          (0.70, 0.82, Color(0xFFC0F0D2)),
        ]) {
          final center = Offset(
            rect.left + rect.width * bloom.$1,
            rect.top + rect.height * bloom.$2,
          );
          for (var petal = 0; petal < 5; petal++) {
            final angle =
                petal * math.pi * 2 / 5 +
                (seamlessMotion
                    ? .08 * math.sin(phase * math.pi * 2)
                    : phase * .16);
            canvas.drawOval(
              Rect.fromCenter(
                center:
                    center +
                    Offset(math.cos(angle), math.sin(angle)) * unit * 2.4,
                width: unit * 3.8,
                height: unit * 2.7,
              ),
              Paint()..color = bloom.$3.withValues(alpha: 0.48),
            );
          }
          canvas.drawCircle(
            center,
            unit * 1.25,
            Paint()..color = const Color(0xFFFFF0A8).withValues(alpha: 0.72),
          );
        }
      case SlopPattern.slopCode:
        paintSlopBinaryCode(canvas, rect, phase);
      case SlopPattern.claimGrid:
        // A tiny competitive territory map suspended under the gel. The four
        // authored cells stay outside the cyclops lane, and this entire layer
        // receives the canonical turned-pattern transform above so flags wrap
        // around Slop's 2.5D body instead of remaining screen-facing decals.
        const claims = <(double, double, Color, int)>[
          (0.23, 0.39, Color(0xFFFFD45F), 3),
          (0.77, 0.43, Color(0xFF66E7D2), 2),
          (0.31, 0.75, Color(0xFFFF6F9F), 4),
          (0.71, 0.79, Color(0xFFBDA0FF), 1),
        ];
        for (var i = 0; i < claims.length; i++) {
          final (x, y, color, pips) = claims[i];
          final flutter = math.sin(phase * math.pi * 2 + i * 1.37);
          final origin = Offset(
            rect.left + rect.width * x,
            rect.top + rect.height * y + flutter * unit * 0.8,
          );
          final tile = RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: origin,
              width: unit * 13.2,
              height: unit * 10.5,
            ),
            Radius.circular(unit * 2.2),
          );
          canvas.drawRRect(
            tile.shift(Offset(unit * 0.8, unit * 1.0)),
            Paint()..color = palette.shade.withValues(alpha: 0.22),
          );
          canvas.drawRRect(
            tile,
            Paint()..color = color.withValues(alpha: 0.42),
          );
          final poleX = origin.dx - unit * 3.3;
          canvas.drawLine(
            Offset(poleX, origin.dy + unit * 3.1),
            Offset(poleX, origin.dy - unit * 3.4),
            Paint()
              ..color = Colors.white.withValues(alpha: 0.62)
              ..strokeWidth = unit * 0.9
              ..strokeCap = StrokeCap.round,
          );
          final flag = Path()
            ..moveTo(poleX, origin.dy - unit * 3.3)
            ..quadraticBezierTo(
              poleX + unit * (3.1 + flutter * 0.35),
              origin.dy - unit * 4.2,
              poleX + unit * 5.2,
              origin.dy - unit * 2.2,
            )
            ..lineTo(poleX, origin.dy - unit * 1.5)
            ..close();
          canvas.drawPath(
            flag,
            Paint()..color = Colors.white.withValues(alpha: 0.72),
          );
          for (var pip = 0; pip < pips; pip++) {
            canvas.drawCircle(
              Offset(
                origin.dx - unit * 3 + pip * unit * 2.05,
                origin.dy + unit * 3.0,
              ),
              unit * 0.65,
              Paint()..color = color.withValues(alpha: 0.88),
            );
          }
        }
      case SlopPattern.cloudQuilt:
        paintSlopCloudQuilt(canvas, rect, phase);
      case SlopPattern.pixelPetal:
        paintSlopPixelPetal(canvas, rect, phase);
      case SlopPattern.itCouldBeWorseRobot:
        final detail = slopFinishDetailUnitFor(rect);
        canvas.drawRect(
          rect,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFF2A66E), Color(0xFFD46D42), Color(0xFF8E3529)],
              stops: [0, .5, 1],
            ).createShader(rect),
        );
        for (final point in const [
          (.17, .26),
          (.83, .26),
          (.15, .68),
          (.85, .68),
          (.30, .86),
          (.70, .86),
        ]) {
          final center = Offset(
            rect.left + rect.width * point.$1,
            rect.top + rect.height * point.$2,
          );
          canvas.drawCircle(
            center,
            detail * 2.15,
            Paint()..color = const Color(0xFF5C2D2D),
          );
          canvas.drawCircle(
            center.translate(-detail * .45, -detail * .55),
            detail * .65,
            Paint()..color = const Color(0xFFFFC18F),
          );
        }
        canvas.drawArc(
          Rect.fromLTWH(
            rect.left + rect.width * .18,
            rect.top + rect.height * .08,
            rect.width * .48,
            rect.height * .26,
          ),
          math.pi * 1.05,
          math.pi * .57,
          false,
          Paint()
            ..color = Colors.white.withValues(alpha: .30)
            ..style = PaintingStyle.stroke
            ..strokeWidth = detail * 3.3
            ..strokeCap = StrokeCap.round,
        );
      case SlopPattern.none:
        break;
    }
  }

  static void _paintItCouldBeWorseRobotAntennas(
    Canvas canvas,
    Rect rect,
    double unit,
    double wave,
  ) {
    final wire = Paint()
      ..color = const Color(0xFF4A2428)
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 1.5
      ..strokeCap = StrokeCap.round;
    for (final side in [-1.0, 1.0]) {
      final root = Offset(
        rect.center.dx + side * rect.width * .17,
        rect.top + unit * 1.5,
      );
      final tip = Offset(
        rect.center.dx + side * rect.width * (.22 + wave * .006),
        rect.top - unit * (10.5 + (side > 0 ? 1.5 : 0)),
      );
      final antenna = Path()
        ..moveTo(root.dx, root.dy)
        ..quadraticBezierTo(
          root.dx + side * unit * 1.7,
          rect.top - unit * 4.5,
          tip.dx,
          tip.dy,
        );
      canvas.drawPath(antenna, wire);
      canvas.drawCircle(
        tip,
        unit * 2.25,
        Paint()..color = const Color(0xFFE98B53),
      );
      canvas.drawCircle(
        tip,
        unit * 2.25,
        Paint()
          ..color = const Color(0xFF4A2428)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * .7,
      );
    }
  }

  /// A four-point twinkle — reads as sparkle where a five-point star reads as
  /// a sticker.
  static void _sparkle(Canvas canvas, Offset c, double r, Paint paint) {
    final path = Path()
      ..moveTo(c.dx, c.dy - r)
      ..quadraticBezierTo(c.dx + r * 0.22, c.dy - r * 0.22, c.dx + r, c.dy)
      ..quadraticBezierTo(c.dx + r * 0.22, c.dy + r * 0.22, c.dx, c.dy + r)
      ..quadraticBezierTo(c.dx - r * 0.22, c.dy + r * 0.22, c.dx - r, c.dy)
      ..quadraticBezierTo(c.dx - r * 0.22, c.dy - r * 0.22, c.dx, c.dy - r)
      ..close();
    canvas.drawPath(path, paint);
  }

  /// Y coordinate of the live body crown at [normalizedX].
  ///
  /// [normalizedX] is measured in body widths, so `0` is the centre and
  /// `0.5` is the right-most edge. This mirrors the ellipse/rounded-panel blend
  /// used by [_bodyPath], including the body's broad crown swell. Topper roots
  /// can therefore be embedded in the actual silhouette instead of guessing
  /// from `rect.top`.
  static double _crownYAt(
    Rect rect, {
    required double normalizedX,
    required SlopBody body,
    required double round,
    required double wave,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    if (reimaginedCharactersEnabled) {
      return slopFormCrownYFor(
        rect,
        body: body,
        normalizedX: normalizedX,
        round: round,
      );
    }
    final silhouetteRound = slopBodySilhouetteRoundFor(body, round);
    final hw = rect.width / 2;
    final hh = rect.height / 2;
    final x = (normalizedX.clamp(-0.499, 0.499) * rect.width);
    final xFromCenter = x.abs();
    final radialX = (x / hw).clamp(-0.998, 0.998);

    final ellipseY =
        rect.center.dy - hh * math.sqrt(math.max(0, 1 - radialX * radialX));

    final corner = _lerp(
      math.min(hw, hh) * 0.90,
      rect.width * 0.09,
      silhouetteRound,
    );
    final ax = math.max(hw - corner, 0.001);
    final ay = math.max(hh - corner, 0.001);
    final roundedY = xFromCenter <= ax
        ? rect.top
        : rect.center.dy -
              ay -
              math.sqrt(
                math.max(0, corner * corner - math.pow(xFromCenter - ax, 2)),
              );

    var y = _lerp(ellipseY, roundedY, silhouetteRound);
    final tipScale = switch (body) {
      SlopBody.classic ||
      SlopBody.triangle ||
      SlopBody.ghost ||
      SlopBody.cloud ||
      SlopBody.star => 1.0,
      SlopBody.tall => 1.45,
      SlopBody.wide || SlopBody.capsule => 0.5,
      SlopBody.droplet || SlopBody.heart => 0.0,
    };
    final angle = -math.acos(radialX);
    final crownSwell =
        0.018 *
        _bump(_angleDelta(angle, -math.pi / 2 + wave * 0.034), 0.94) *
        tipScale *
        (1 - silhouetteRound);
    y = rect.center.dy + (y - rect.center.dy) * (1 + crownSwell);
    if (shift != null && shiftMorph > 0) {
      final shiftedY =
          rect.center.dy +
          slopShiftCrownYFor(shift, normalizedX * 2) * rect.height / 2;
      y = _lerp(y, shiftedY, shiftMorph.clamp(0.0, 1.0));
    }
    return y;
  }

  /// Projects a crown-local point around the body's vertical axis.
  ///
  /// Local x/z values are normalized body-width coordinates. Unlike the face
  /// longitude, the origin never moves: centred headwear stays centred while
  /// its fore/aft thickness becomes the visible width at a side view.
  static _ProjectedCrownPoint _projectCrownPoint(
    Rect rect, {
    required SlopLook look,
    required double round,
    required double wave,
    required SlopToonDepthPose depthPose,
    required double localX,
    required double localZ,
    required double lift,
    required double topperScale,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    final angle = depthPose.orientationAngle;
    final cosine = math.cos(angle);
    final sine = math.sin(angle);
    final projectedX = (localX * cosine + localZ * sine) * topperScale;
    final depth = localZ * cosine - localX * sine;
    final crownY = _crownYAt(
      rect,
      normalizedX: projectedX,
      body: look.body,
      round: round,
      wave: wave,
      shift: shift,
      shiftMorph: shiftMorph,
    );
    return (
      point: Offset(rect.center.dx + rect.width * projectedX, crownY + lift),
      depth: depth,
      normalizedX: projectedX,
    );
  }

  /// Exact crown attachment used by Comet Clip (the persisted ponytail slot).
  ///
  /// Keeping this geometry separate from the tail silhouette is intentional:
  /// the tied root is a point on the head volume, while the short comet trails are
  /// allowed to deform. Tests exercise this contract for every body and yaw so
  /// a future headpiece redraw cannot quietly pin the comet clip to the facial
  /// plane again.
  @visibleForTesting
  static ({
    Offset crownPoint,
    Offset tieRoot,
    double depth,
    double normalizedX,
    double projectedDirection,
    SlopHeadwearDepthPass depthPass,
  })
  ponytailAttachmentFor(
    Rect rect, {
    required SlopLook look,
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    final topperScale = _lerp(1, 0.58, round);
    final shapedCrown =
        look.body == SlopBody.triangle || look.body == SlopBody.heart;
    final rootX = look.body == SlopBody.triangle
        ? .115
        : shapedCrown
        ? .16
        : .18;
    final rootZ = look.body == SlopBody.triangle
        ? -.085
        : shapedCrown
        ? -.12
        : -.14;
    final anchor = _projectCrownPoint(
      rect,
      look: look,
      round: round,
      wave: wave,
      depthPose: depthPose,
      localX: rootX,
      localZ: rootZ,
      lift: unit * 5.8,
      topperScale: topperScale,
      shift: shift,
      shiftMorph: shiftMorph,
    );
    // A sign-only direction jumps from +1 to -1 as the tied root crosses the
    // centre seam. That was the remaining source of the ponytail "teleport"
    // during a turn. Preserve the continuous radial projection instead; the
    // loose strand naturally narrows when it points into the screen.
    final radialLength = math.sqrt(rootX * rootX + rootZ * rootZ);
    final projectedDirection =
        (anchor.normalizedX / (radialLength * topperScale)).clamp(-1.0, 1.0);
    final depthPass = anchor.depth >= 0
        ? SlopHeadwearDepthPass.front
        : SlopHeadwearDepthPass.rear;
    return (
      crownPoint: anchor.point,
      tieRoot: anchor.point.translate(
        projectedDirection * unit * 0.8 * topperScale,
        unit * 2.0 * topperScale,
      ),
      depth: anchor.depth,
      normalizedX: anchor.normalizedX,
      projectedDirection: projectedDirection,
      depthPass: depthPass,
    );
  }

  static void _paintTurnedBeanie(
    Canvas canvas,
    Rect rect,
    SlopLook look, {
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    required SlopHeadwearDepthPass depthPass,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    // The beanie is crown-mounted volume, not a face decal. Its axis stays on
    // the body's crown while yaw changes the visible value planes and knit
    // details. The slightly narrower, deeper cuff is important: the old flat
    // 52%-wide bar overhung the curved crown at both ends and exposed two
    // background wedges, which made an otherwise centred hat read as if it
    // were hovering above the head at three-quarter and side views.
    final topperScale = _lerp(1, 0.58, round);
    final angle = depthPose.orientationAngle;
    final cosine = math.cos(angle);
    final sine = math.sin(angle);
    final edge = sine.abs().clamp(0.0, 1.0);
    final sideModel = edge * edge * (3 - 2 * edge);
    final rearModel = ((1 - cosine) * 0.5).clamp(0.0, 1.0);
    final crownAxis = _projectCrownPoint(
      rect,
      look: look,
      round: round,
      wave: wave,
      depthPose: depthPose,
      localX: 0,
      localZ: 0,
      lift: unit * 2.2,
      topperScale: topperScale,
      shift: shift,
      shiftMorph: shiftMorph,
    );
    final crownCenterY = crownAxis.point.dy - unit * 2.2;
    final top = crownAxis.point.dy;
    final width = rect.width * 0.48 * topperScale;
    final halfWidth = width * 0.5;
    final baseY = top + unit * 5.4 * topperScale;
    final cuffHeight = unit * 9.0 * topperScale;
    final cuffHalfWidth = width * 0.50;

    Path cuffPath({double verticalOffset = 0}) {
      final left = crownAxis.point.dx - cuffHalfWidth;
      final right = crownAxis.point.dx + cuffHalfWidth;
      final upperY = baseY - cuffHeight * 0.50 + verticalOffset;
      final lowerY = baseY + cuffHeight * 0.50 + verticalOffset;
      return Path()
        ..moveTo(left + cuffHeight * 0.28, upperY)
        ..quadraticBezierTo(
          crownAxis.point.dx,
          upperY - cuffHeight * 0.10,
          right - cuffHeight * 0.28,
          upperY,
        )
        ..quadraticBezierTo(right, upperY, right, baseY + verticalOffset)
        ..quadraticBezierTo(right, lowerY, right - cuffHeight * 0.28, lowerY)
        ..quadraticBezierTo(
          crownAxis.point.dx,
          lowerY - cuffHeight * 0.22,
          left + cuffHeight * 0.28,
          lowerY,
        )
        ..quadraticBezierTo(left, lowerY, left, baseY + verticalOffset)
        ..quadraticBezierTo(left, upperY, left + cuffHeight * 0.28, upperY)
        ..close();
    }

    final cuff = cuffPath();

    canvas.save();
    canvas.translate(crownAxis.point.dx, crownCenterY);
    canvas.rotate(wave * 0.008 * (1 - round));
    canvas.translate(-crownAxis.point.dx, -crownCenterY);

    if (depthPass == SlopHeadwearDepthPass.rear) {
      // One opaque far contact belt lives behind the gel. The body hides its
      // middle and lower edge; only the physical wrap at the crown can remain
      // visible. There is no alpha duplicate to ghost at either tangent.
      final farContact = cuffPath(verticalOffset: -cuffHeight * 0.18);
      canvas.drawPath(
        farContact,
        Paint()
          ..color = Color.lerp(
            const Color(0xFF6248AD),
            const Color(0xFF49327E),
            rearModel * 0.46,
          )!,
      );
      canvas.restore();
      return;
    }

    if (depthPass != SlopHeadwearDepthPass.front) {
      canvas.restore();
      return;
    }

    // These are the exact neutral beanie paths after the legacy topper scale.
    // Every angle therefore has the same centred silhouette, cuff overlap and
    // pom height. Only the opaque color planes below respond to yaw.
    final dome = Path()
      ..moveTo(rect.center.dx - halfWidth, baseY)
      ..arcToPoint(
        Offset(rect.center.dx + halfWidth, baseY),
        radius: Radius.circular(width * 0.56),
        clockwise: true,
      )
      ..close();
    const domeBase = Color(0xFF7A5CD8);
    final domeMiddle = Color.lerp(
      domeBase,
      const Color(0xFF59409D),
      rearModel * 0.34,
    )!;
    final domeLight = Color.lerp(
      domeMiddle,
      const Color(0xFFB39AF1),
      sideModel * 0.58,
    )!;
    final domeShade = Color.lerp(
      domeMiddle,
      const Color(0xFF402A78),
      sideModel * 0.68,
    )!;
    canvas.drawPath(
      dome,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment(sine >= 0 ? -1 : 1, -0.35),
          end: Alignment(sine >= 0 ? 1 : -1, 0.45),
          colors: [domeLight, domeMiddle, domeShade],
          stops: const [0, 0.54, 1],
        ).createShader(dome.getBounds()),
    );

    // A bounded side plane provides the visible fore/aft turn at 90/270 while
    // keeping the approved dome outline fixed. At the front seam its color is
    // exactly the underlying middle, so 359/0/1 cannot pop.
    final sideDirection = sine == 0 ? 1.0 : sine.sign;
    final planeEdge = rect.center.dx + sideDirection * halfWidth;
    final planeInner = rect.center.dx + sideDirection * halfWidth * 0.34;
    final sidePlane = Path()
      ..moveTo(planeEdge, baseY)
      ..quadraticBezierTo(
        planeEdge - sideDirection * halfWidth * 0.10,
        top - width * 0.31,
        planeInner,
        top - width * 0.38,
      )
      ..quadraticBezierTo(
        rect.center.dx + sideDirection * halfWidth * 0.58,
        top - width * 0.08,
        planeEdge,
        baseY,
      )
      ..close();
    canvas.save();
    canvas.clipPath(dome);
    canvas.drawPath(
      sidePlane,
      Paint()..color = Color.lerp(domeMiddle, domeShade, sideModel * 0.72)!,
    );
    canvas.restore();

    const cuffBase = Color(0xFF9C82ED);
    final cuffMiddle = Color.lerp(
      cuffBase,
      const Color(0xFF7359BF),
      rearModel * 0.28,
    )!;
    final cuffLight = Color.lerp(
      cuffMiddle,
      const Color(0xFFCCBCFA),
      sideModel * 0.56,
    )!;
    final cuffShade = Color.lerp(
      cuffMiddle,
      const Color(0xFF5A409E),
      sideModel * 0.64,
    )!;
    canvas.drawPath(
      cuff,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment(sine >= 0 ? -1 : 1, 0),
          end: Alignment(sine >= 0 ? 1 : -1, 0),
          colors: [cuffLight, cuffMiddle, cuffShade],
          stops: const [0, 0.56, 1],
        ).createShader(cuff.getBounds()),
    );

    // A single lower fold follows the curved cuff silhouette. It is opaque
    // and clipped to the hat, so no translucent duplicate can reveal the body
    // through the knit at either side tangent.
    final cuffBounds = cuff.getBounds();
    canvas.save();
    canvas.clipPath(cuff);
    canvas.drawArc(
      Rect.fromCenter(
        center: Offset(
          crownAxis.point.dx,
          cuffBounds.bottom - cuffHeight * 0.22,
        ),
        width: cuffBounds.width * 0.92,
        height: cuffHeight * 0.46,
      ),
      0,
      math.pi,
      false,
      Paint()
        ..color = cuffShade.withValues(alpha: 0.42 + sideModel * 0.18)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.82 * topperScale
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();

    // Knit compression follows the near side without adding translucent
    // overlays. At zero yaw the stroke resolves to the cuff's own value.
    if (sideModel > 0.02) {
      final seamX = rect.center.dx + sideDirection * width * 0.20;
      canvas.drawLine(
        Offset(seamX, cuffBounds.top + unit * 0.9 * topperScale),
        Offset(seamX, cuffBounds.bottom - unit * 1.1 * topperScale),
        Paint()
          ..color = Color.lerp(cuffMiddle, cuffShade, sideModel * 0.62)!
          ..strokeWidth = unit * 0.75 * topperScale
          ..strokeCap = StrokeCap.round,
      );
    }

    final pom = Offset(rect.center.dx, top - unit * 15 * topperScale);
    final pomRadius = unit * 5 * topperScale;
    const pomBase = Color(0xFFE8DEFF);
    final pomMiddle = Color.lerp(
      pomBase,
      const Color(0xFFCABBEA),
      rearModel * 0.26,
    )!;
    final pomLight = Color.lerp(
      pomMiddle,
      const Color(0xFFFFFFFF),
      sideModel * 0.58,
    )!;
    final pomShade = Color.lerp(
      pomMiddle,
      const Color(0xFFA896D0),
      sideModel * 0.60,
    )!;
    canvas.drawCircle(
      pom,
      pomRadius,
      Paint()
        ..shader = RadialGradient(
          center: Alignment(-0.34 - sine * 0.18, -0.38),
          colors: [pomLight, pomMiddle, pomShade],
          stops: const [0, 0.58, 1],
        ).createShader(Rect.fromCircle(center: pom, radius: pomRadius)),
    );
    canvas.restore();
  }

  static void _paintTurnedMushroom(
    Canvas canvas,
    Rect rect,
    SlopLook look, {
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    required SlopHeadwearDepthPass depthPass,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    // The mushroom is an axis-centred crown volume. In particular, it must not
    // inherit the face-longitude translation/scale used by flat authored hats:
    // at a side view that path turns a broad cap into a decal stuck to one
    // cheek, and on the rear hemisphere the entire decal can disappear behind
    // the gel. The cap below instead projects independent left/right and
    // fore/aft radii, preserving substantial thickness at both tangents.
    final topperScale = _lerp(1, 0.58, round);
    final angle = depthPose.orientationAngle;
    final cosine = math.cos(angle);
    final sine = math.sin(angle);
    final edge = sine.abs().clamp(0.0, 1.0);
    final sideModel = edge * edge * (3 - 2 * edge);
    final rearModel = ((1 - cosine) * 0.5).clamp(0.0, 1.0);
    final crownAxis = _projectCrownPoint(
      rect,
      look: look,
      round: round,
      wave: wave,
      depthPose: depthPose,
      localX: 0,
      localZ: 0,
      lift: unit * 2.2,
      topperScale: topperScale,
      shift: shift,
      shiftMorph: shiftMorph,
    );
    final crownCenterY = crownAxis.point.dy - unit * 2.2;
    final capRadiusX = rect.width * 0.31 * topperScale;
    final capRadiusZ = rect.width * 0.28 * topperScale;
    final capHalfWidth = math.sqrt(
      math.pow(capRadiusX * cosine, 2) + math.pow(capRadiusZ * sine, 2),
    );
    // The brim is sunk into the live crown. At side/back views the body then
    // occludes the stem and lower underside, leaving one continuous contact
    // seam instead of a background strip between hat and head.
    final brimY = crownCenterY + unit * 2.6 * topperScale;
    final capTop = crownCenterY - unit * 21.0 * topperScale;
    final capHeight = brimY - capTop;
    final undersideDepth = unit * 4.8 * topperScale;

    Path capPath() => Path()
      ..moveTo(rect.center.dx - capHalfWidth, brimY)
      ..cubicTo(
        rect.center.dx - capHalfWidth * 0.94,
        capTop + capHeight * 0.40,
        rect.center.dx - capHalfWidth * 0.46,
        capTop,
        rect.center.dx,
        capTop,
      )
      ..cubicTo(
        rect.center.dx + capHalfWidth * 0.46,
        capTop,
        rect.center.dx + capHalfWidth * 0.94,
        capTop + capHeight * 0.40,
        rect.center.dx + capHalfWidth,
        brimY,
      )
      ..quadraticBezierTo(
        rect.center.dx,
        brimY + undersideDepth,
        rect.center.dx - capHalfWidth,
        brimY,
      )
      ..close();

    final cap = capPath();
    final capBounds = cap.getBounds();
    final stemRadiusX = rect.width * 0.078 * topperScale;
    final stemRadiusZ = rect.width * 0.060 * topperScale;
    final stemHalfWidth = math.sqrt(
      math.pow(stemRadiusX * cosine, 2) + math.pow(stemRadiusZ * sine, 2),
    );
    final stemTop = brimY + undersideDepth * 0.38;
    final stemBottom = crownCenterY + unit * 5.0 * topperScale;
    final stem = Path()
      ..moveTo(rect.center.dx - stemHalfWidth * 0.62, stemTop)
      ..quadraticBezierTo(
        rect.center.dx - stemHalfWidth,
        (stemTop + stemBottom) * 0.5,
        rect.center.dx - stemHalfWidth * 0.84,
        stemBottom,
      )
      ..quadraticBezierTo(
        rect.center.dx,
        stemBottom + unit * 1.0 * topperScale,
        rect.center.dx + stemHalfWidth * 0.84,
        stemBottom,
      )
      ..quadraticBezierTo(
        rect.center.dx + stemHalfWidth,
        (stemTop + stemBottom) * 0.5,
        rect.center.dx + stemHalfWidth * 0.62,
        stemTop,
      )
      ..close();

    canvas.save();
    canvas.translate(rect.center.dx, crownCenterY);
    canvas.rotate(wave * 0.008 * (1 - round));
    canvas.translate(-rect.center.dx, -crownCenterY);

    if (depthPass == SlopHeadwearDepthPass.rear) {
      // The full opaque shell belongs behind the gel. Its broad upper volume
      // remains visible at 135/180/225 degrees while the body naturally hides
      // only the embedded stalk and lower centre of the brim. The near brim is
      // added in the front pass, so the object still reads as one cap rather
      // than a flat oval pasted over the head.
      canvas.drawPath(
        stem,
        Paint()
          ..shader = LinearGradient(
            begin: const Alignment(-1, -0.25),
            end: const Alignment(1, 0.55),
            colors: [
              Color.lerp(
                const Color(0xFFFFE7D2),
                const Color(0xFFD6A98D),
                rearModel * 0.54,
              )!,
              Color.lerp(
                const Color(0xFFF3BEA2),
                const Color(0xFF9B675D),
                rearModel * 0.60,
              )!,
            ],
          ).createShader(stem.getBounds()),
      );

      const frontMiddle = Color(0xFFF34F77);
      final capMiddle = Color.lerp(
        frontMiddle,
        const Color(0xFF9E2851),
        rearModel * 0.72,
      )!;
      final capLight = Color.lerp(
        capMiddle,
        const Color(0xFFFFA8BB),
        0.58 - sideModel * 0.18,
      )!;
      final capShade = Color.lerp(
        capMiddle,
        const Color(0xFF671B3D),
        0.36 + sideModel * 0.42,
      )!;
      canvas.drawPath(
        cap,
        Paint()
          ..color = const Color(0xFF681A3B)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 2.5 * topperScale
          ..strokeJoin = StrokeJoin.round,
      );
      canvas.drawPath(
        cap,
        Paint()
          ..shader = LinearGradient(
            begin: const Alignment(-0.86, -0.72),
            end: const Alignment(0.94, 0.72),
            colors: [capLight, capMiddle, capShade],
            stops: const [0, 0.54, 1],
          ).createShader(capBounds),
      );

      // A bounded opaque side plane provides an actual value change at the
      // tangent. It is clipped to the one shell; there is no translucent copy
      // through which the slime or backdrop can ghost.
      if (sideModel > 0.001) {
        final direction = sine.sign;
        final edgeX = rect.center.dx + direction * capHalfWidth;
        final innerX = rect.center.dx + direction * capHalfWidth * 0.18;
        final sidePlane = Path()
          ..moveTo(edgeX, brimY)
          ..quadraticBezierTo(
            edgeX - direction * capHalfWidth * 0.06,
            capTop + capHeight * 0.40,
            innerX,
            capTop + capHeight * 0.08,
          )
          ..quadraticBezierTo(
            rect.center.dx + direction * capHalfWidth * 0.46,
            capTop + capHeight * 0.58,
            edgeX,
            brimY,
          )
          ..close();
        canvas.save();
        canvas.clipPath(cap);
        canvas.drawPath(
          sidePlane,
          Paint()
            ..color = Color.lerp(
              capMiddle,
              const Color(0xFF581637),
              sideModel * 0.72,
            )!,
        );
        canvas.restore();
      }

      // Spots are points on the cap surface, not screen-space stickers. Each
      // one projects through the same yaw as the shell and contracts to zero
      // as it crosses the horizon; a complementary authored set lives on the
      // rear, so details remain coherent without mirroring or popping.
      const spots = <({double x, double z, double y, double radius})>[
        (x: -0.18, z: 0.13, y: 0.48, radius: 3.0),
        (x: 0.01, z: 0.18, y: 0.30, radius: 3.7),
        (x: 0.19, z: 0.10, y: 0.52, radius: 2.5),
        (x: -0.15, z: -0.13, y: 0.44, radius: 2.8),
        (x: 0.10, z: -0.17, y: 0.31, radius: 3.3),
        (x: 0.22, z: -0.07, y: 0.56, radius: 2.3),
      ];
      canvas.save();
      canvas.clipPath(cap);
      for (final spot in spots) {
        final projectedX = (spot.x * cosine + spot.z * sine) * topperScale;
        final surfaceDepth = spot.z * cosine - spot.x * sine;
        if (surfaceDepth <= 0) continue;
        final foreshortening = (surfaceDepth / 0.24).clamp(0.32, 1.0);
        final spotRadius = unit * spot.radius * topperScale;
        final spotCenter = Offset(
          rect.center.dx + rect.width * projectedX,
          capTop + capHeight * spot.y,
        );
        canvas.save();
        canvas.translate(spotCenter.dx, spotCenter.dy);
        canvas.scale(foreshortening, 1);
        canvas.drawCircle(
          Offset.zero,
          spotRadius,
          Paint()
            ..color = Color.lerp(
              const Color(0xFFFFF4D8),
              const Color(0xFFE9CCB4),
              rearModel * 0.42,
            )!,
        );
        canvas.restore();
      }
      canvas.restore();

      final farBrim = Path()
        ..moveTo(rect.center.dx - capHalfWidth, brimY)
        ..quadraticBezierTo(
          rect.center.dx,
          brimY - unit * 2.5 * topperScale,
          rect.center.dx + capHalfWidth,
          brimY,
        );
      canvas.drawPath(
        farBrim,
        Paint()
          ..color = Color.lerp(
            const Color(0xFFC33A64),
            const Color(0xFF741E43),
            rearModel * 0.64,
          )!
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 2.5 * topperScale
          ..strokeCap = StrokeCap.round,
      );
      canvas.restore();
      return;
    }

    if (depthPass == SlopHeadwearDepthPass.front) {
      // The visible stalk face shrinks away geometrically on the rear half;
      // the rear stalk above remains under the body, preserving a real contact
      // patch without alpha-fading two copies through one another.
      final rawRoot = ((cosine + 0.12) / 1.12).clamp(0.0, 1.0);
      final rootAmount = rawRoot * rawRoot * (3 - 2 * rawRoot);
      if (rootAmount > 0.001) {
        final center = rect.center.dx;
        final nearHalfWidth = stemHalfWidth * rootAmount;
        final nearBottom = stemTop + (stemBottom - stemTop) * rootAmount;
        final nearStem = Path()
          ..moveTo(center - nearHalfWidth * 0.62, stemTop)
          ..quadraticBezierTo(
            center - nearHalfWidth,
            (stemTop + nearBottom) * 0.5,
            center - nearHalfWidth * 0.84,
            nearBottom,
          )
          ..quadraticBezierTo(
            center,
            nearBottom + unit * 0.8 * topperScale * rootAmount,
            center + nearHalfWidth * 0.84,
            nearBottom,
          )
          ..quadraticBezierTo(
            center + nearHalfWidth,
            (stemTop + nearBottom) * 0.5,
            center + nearHalfWidth * 0.62,
            stemTop,
          )
          ..close();
        canvas.drawPath(
          nearStem,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFFFEBD8), Color(0xFFF0B799)],
            ).createShader(nearStem.getBounds()),
        );
      }

      final nearBrim = Path()
        ..moveTo(
          rect.center.dx - capHalfWidth + unit * 1.1 * topperScale,
          brimY + unit * 0.2 * topperScale,
        )
        ..quadraticBezierTo(
          rect.center.dx,
          brimY + undersideDepth,
          rect.center.dx + capHalfWidth - unit * 1.1 * topperScale,
          brimY + unit * 0.2 * topperScale,
        );
      canvas.drawPath(
        nearBrim,
        Paint()
          ..color = Color.lerp(
            const Color(0xFFFFD9C2),
            const Color(0xFFD99A88),
            rearModel * 0.48,
          )!
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 3.6 * topperScale
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.restore();
  }

  static void _paintTurnedHeadwear(
    Canvas canvas,
    Rect rect,
    SlopLook look, {
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    required SlopHeadwearDepthPass depthPass,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    switch (look.hat) {
      case SlopHat.beanie:
        _paintTurnedBeanie(
          canvas,
          rect,
          look,
          round: round,
          wave: wave,
          unit: unit,
          depthPose: depthPose,
          depthPass: depthPass,
          shift: shift,
          shiftMorph: shiftMorph,
        );
      case SlopHat.mushroom:
        _paintTurnedMushroom(
          canvas,
          rect,
          look,
          round: round,
          wave: wave,
          unit: unit,
          depthPose: depthPose,
          depthPass: depthPass,
          shift: shift,
          shiftMorph: shiftMorph,
        );
      default:
        // Phase one deliberately changes only the release-gating equipped
        // beanie. Keep every other authored topper on its established turned
        // path until its own dimensional geometry is approved. Paint that
        // single opaque asset in the depth slot selected by the crown surface
        // so it neither freezes front-on nor appears twice at the tangent.
        final activePass = depthPose.crownSurfaceDepth >= 0
            ? SlopHeadwearDepthPass.front
            : SlopHeadwearDepthPass.rear;
        if (depthPass == activePass) {
          _paintHat(
            canvas,
            rect,
            look,
            round: round,
            wave: wave,
            unit: unit,
            depthPose: depthPose,
            depthPass: SlopHeadwearDepthPass.all,
            shift: shift,
            shiftMorph: shiftMorph,
          );
        }
    }
  }

  /// Headphones wrap around the head's volume. Each cup and band segment
  /// owns a true yaw depth, rather than turning one front-facing decal.
  static void _paintHeadphones(
    Canvas canvas,
    Rect rect,
    SlopLook look, {
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    required SlopHeadwearDepthPass depthPass,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    final scale = _lerp(1, .58, round);
    final angle = depthPose.orientationAngle;
    final cosine = math.cos(angle), sine = math.sin(angle);
    final width = rect.width / depthPose.bodyScaleX.clamp(.2, 1.5);
    double crown(double x) => _crownYAt(
      rect,
      normalizedX: x,
      body: look.body,
      round: round,
      wave: wave,
      shift: shift,
      shiftMorph: shiftMorph,
    );
    final cupY =
        (crown(-.37 * scale) + crown(.37 * scale)) * .5 + unit * 6.2 * scale;
    final top =
        math.min(crown(0), math.min(crown(-.2 * scale), crown(.2 * scale))) -
        unit * 5 * scale;
    bool owns(double z) =>
        depthPass == SlopHeadwearDepthPass.all ||
        (z >= 0
            ? depthPass == SlopHeadwearDepthPass.front
            : depthPass == SlopHeadwearDepthPass.rear);
    ({Offset p, double z}) project(double x, double y, double z) => (
      p: Offset(rect.center.dx + width * (x * cosine + z * sine) * scale, y),
      z: z * cosine - x * sine,
    );
    canvas.save();
    if (depthPass == SlopHeadwearDepthPass.rear &&
        look.finish == SlopFinish.clearGlass) {
      canvas.clipPath(
        Path()
          ..fillType = PathFillType.evenOdd
          ..addRect(rect.inflate(width))
          ..addPath(
            slopFormOutlineFor(rect, body: look.body, round: round, phase: 0),
            Offset.zero,
          ),
      );
    }
    const steps = 36;
    final band = Path();
    var connected = false;
    for (var i = 0; i < steps; i++) {
      final a = i / steps * math.pi, b = (i + 1) / steps * math.pi;
      final p = project(
        .38 * math.cos(a),
        cupY + (top - cupY) * math.sin(a),
        -.025 * math.sin(a),
      );
      final q = project(
        .38 * math.cos(b),
        cupY + (top - cupY) * math.sin(b),
        -.025 * math.sin(b),
      );
      if (!owns((p.z + q.z) * .5)) {
        connected = false;
        continue;
      }
      if (!connected) band.moveTo(p.p.dx, p.p.dy);
      band.lineTo(q.p.dx, q.p.dy);
      connected = true;
    }
    canvas.drawPath(
      band,
      Paint()
        ..color = const Color(0xFF343549)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 5.4 * scale
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawPath(
      band.shift(Offset(0, -unit * .6 * scale)),
      Paint()
        ..color = const Color(0xFFB3B1CE)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 1.6 * scale
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    final cups = [
      for (final side in [-1.0, 1.0])
        (side: side, anchor: project(side * .38, cupY, .02)),
    ]..sort((a, b) => a.anchor.z.compareTo(b.anchor.z));
    for (final cup in cups) {
      if (!owns(cup.anchor.z)) continue;
      final center = cup.anchor.p;
      final cupWidth =
          unit * (14 * cosine.abs() + 20 * sine.abs()).clamp(14, 23) * scale;
      final bounds = Rect.fromCenter(
        center: center,
        width: cupWidth,
        height: unit * 22 * scale,
      );
      final rim = RRect.fromRectAndRadius(
        bounds,
        Radius.circular(unit * 7 * scale),
      );
      canvas.drawRRect(
        rim,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF65627E), Color(0xFF323549)],
          ).createShader(bounds),
      );
      final pad = bounds.deflate(unit * 3.2 * scale);
      canvas.drawRRect(
        RRect.fromRectAndRadius(pad, Radius.circular(unit * 4 * scale)),
        Paint()
          ..color = Color.lerp(
            look.palette.light,
            const Color(0xFFADA3CC),
            .40,
          )!,
      );
      canvas.drawLine(
        center.translate(-cupWidth * .15, -unit * 5 * scale),
        center.translate(cupWidth * .12, -unit * 6 * scale),
        Paint()
          ..color = const Color(0xBFFFFFFF)
          ..strokeWidth = unit * 1.2 * scale
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.restore();
  }

  static void _paintHat(
    Canvas canvas,
    Rect rect,
    SlopLook look, {
    required double round,
    required double wave,
    required double unit,
    required SlopToonDepthPose depthPose,
    SlopHeadwearDepthPass depthPass = SlopHeadwearDepthPass.all,
    SlopShift? shift,
    double shiftMorph = 0,
  }) {
    if (_isSlopHeadpiece(look.hat)) {
      _paintSlopHeadpiece(
        canvas,
        rect,
        look,
        round: round,
        wave: wave,
        unit: unit,
        depthPose: depthPose,
        depthPass: depthPass,
      );
      return;
    }
    if (look.hat == SlopHat.headphones) {
      _paintHeadphones(
        canvas,
        rect,
        look,
        round: round,
        wave: wave,
        unit: unit,
        depthPose: depthPose,
        depthPass: depthPass,
        shift: shift,
        shiftMorph: shiftMorph,
      );
      return;
    }
    if (depthPass != SlopHeadwearDepthPass.all) {
      // Toon beanies and mushroom caps use crown-centred volume models even at
      // exact front. Routing neutral through the same model makes
      // 359°→0°→1° close without swapping to a flat canonical asset.
      // Direct [all] callers below retain the established shop/avatar art.
      if (look.hat == SlopHat.beanie || look.hat == SlopHat.mushroom) {
        _paintTurnedHeadwear(
          canvas,
          rect,
          look,
          round: round,
          wave: wave,
          unit: unit,
          depthPose: depthPose,
          depthPass: depthPass,
          shift: shift,
          shiftMorph: shiftMorph,
        );
        return;
      }
      if (depthPose.isNeutral) {
        if (depthPass == SlopHeadwearDepthPass.rear) return;
      } else {
        _paintTurnedHeadwear(
          canvas,
          rect,
          look,
          round: round,
          wave: wave,
          unit: unit,
          depthPose: depthPose,
          depthPass: depthPass,
          shift: shift,
          shiftMorph: shiftMorph,
        );
        return;
      }
    }
    // The topper shares the same crown math as the slime silhouette. This keeps
    // caps, hair, bows and headphones physically seated while body shape and
    // blob→panel morph change. More importantly, anything attached away from
    // the middle asks for the crown at *its own x position*. A single rect.top
    // baseline can only touch a dome in its centre, which is why horns, bows,
    // curls and headphone cups used to visibly hover at their outer roots.
    double rawCrownY(double x) => _crownYAt(
      rect,
      normalizedX: x,
      body: look.body,
      round: round,
      wave: wave,
      shift: shift,
      shiftMorph: shiftMorph,
    );

    final cx = rect.center.dx;
    final crownCenterY = rawCrownY(0);
    final turnedCrownY = rawCrownY(depthPose.hatOffsetX);
    final crownTravel = Offset(
      rect.width * depthPose.hatOffsetX,
      turnedCrownY - crownCenterY,
    );
    // Put centre-authored toppers a little inside the gel. This overlap is the
    // contact patch: no background-colored hairline can open up while the body
    // breathes or morphs.
    final top = crownCenterY + unit * 2.2;
    // A panel is much wider than the resting blob. Topper geometry is authored
    // in width-based units, so without compensating it balloons into giant hair
    // that reaches the speech bubble. Scale around the attachment point while
    // preserving the exact same art and seated baseline.
    final topperScale = _lerp(1, 0.58, round);
    // Roots authored away from the centre (hair, horns, clips, headphones)
    // need the crown height at their *translated and foreshortened* x, not at
    // their old front-facing x. Invert the topper's vertical scale so the
    // transformed root lands on that live contour after crownTravel is added.
    double crownY(double authoredX) {
      final translatedRootX =
          depthPose.hatOffsetX + authoredX * depthPose.hatScaleX * topperScale;
      final targetY = rawCrownY(translatedRootX);
      return top + (targetY - crownTravel.dy - top) / topperScale;
    }

    canvas.save();
    // Every topper remains live vector art, but its complete crown attachment
    // follows the same yaw as the face. The generous in-gel overlap below is
    // retained through the translation/tilt, preventing a one-pixel z seam at
    // either extreme cheek.
    canvas.translate(crownTravel.dx, crownTravel.dy);
    // Follow the living crown's tiny lean instead of leaving the topper pinned
    // to the canvas while the gel moves underneath it.
    canvas.translate(cx, crownCenterY);
    canvas.rotate(
      wave * 0.008 * (1 - round) + depthPose.hatTilt * (1 - round * 0.35),
    );
    canvas.scale(depthPose.hatScaleX, 1);
    canvas.translate(-cx, -crownCenterY);
    canvas.translate(cx, top);
    canvas.scale(topperScale);
    canvas.translate(-cx, -top);
    final rearHatWeight = (-depthPose.crownSurfaceDepth).clamp(0.0, 1.0);
    if (rearHatWeight > 0.001) {
      // The hat remains the selected live vector asset at every angle, but a
      // rear-facing crown needs its own value plane. Tint the complete topper
      // as one object instead of recolouring its individual details, then tuck
      // its lower contact edge behind the rear gel below.
      canvas.saveLayer(
        rect.inflate(rect.width * 0.7),
        Paint()
          ..colorFilter = ColorFilter.mode(
            Color.lerp(Colors.white, look.palette.deep, rearHatWeight * 0.30)!,
            BlendMode.modulate,
          ),
      );
    }
    const gold = Color(0xFFFFC53D);
    switch (look.hat) {
      case SlopHat.antenna:
        final tip = Offset(cx + wave * unit * 3, top - unit * 20);
        canvas.drawPath(
          Path()
            ..moveTo(cx, top + unit * 2)
            ..quadraticBezierTo(
              cx + wave * unit * 2,
              top - unit * 10,
              tip.dx,
              tip.dy,
            ),
          Paint()
            ..color = look.palette.shade
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawCircle(tip, unit * 4.4, Paint()..color = look.palette.glow);
        canvas.drawCircle(
          tip.translate(-unit * 1.4, -unit * 1.4),
          unit * 1.3,
          Paint()..color = Colors.white.withValues(alpha: 0.9),
        );
      case SlopHat.itCouldBeWorse:
        // A tiny copper robot head adapted from It Could Be Worse. It is
        // intentionally a fitted headpiece: the slime body and ribbon remain
        // fully visible underneath instead of being replaced by a costume.
        final seat = Offset(cx, crownY(0) - unit * 1.2);
        final headRect = Rect.fromCenter(
          center: seat.translate(0, -unit * 7.9),
          width: unit * 42,
          height: unit * 14.4,
        );
        final shadow = RRect.fromRectAndRadius(
          headRect.translate(0, unit * 1.7),
          Radius.circular(unit * 4.6),
        );
        canvas.drawRRect(shadow, Paint()..color = const Color(0x55361619));
        final shellPath = Path()
          ..moveTo(headRect.left + unit * 3.2, headRect.top)
          ..quadraticBezierTo(
            headRect.center.dx,
            headRect.top - unit * .8,
            headRect.right - unit * 3.2,
            headRect.top,
          )
          ..lineTo(headRect.right, headRect.bottom - unit * 3.2)
          ..quadraticBezierTo(
            headRect.right - unit * 1.4,
            headRect.bottom,
            headRect.right - unit * 5.8,
            headRect.bottom,
          )
          ..lineTo(headRect.left + unit * 5.8, headRect.bottom)
          ..quadraticBezierTo(
            headRect.left + unit * 1.4,
            headRect.bottom,
            headRect.left,
            headRect.bottom - unit * 3.2,
          )
          ..close();
        canvas.drawShadow(
          shellPath,
          const Color(0x66361619),
          unit * 2.2,
          false,
        );
        canvas.drawPath(
          shellPath,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFF1A36A), Color(0xFFD06A3F), Color(0xFF8F3528)],
              stops: [0, .5, 1],
            ).createShader(headRect),
        );
        canvas.drawPath(
          shellPath,
          Paint()
            ..color = const Color(0xFF4A2428)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.1
            ..strokeJoin = StrokeJoin.round,
        );
        // Temple seams and a small lower jaw keep the silhouette handmade.
        final seamPaint = Paint()
          ..color = const Color(0xFF7A312C).withValues(alpha: .68)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * .7
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(
          Offset(headRect.left + unit * 4.5, headRect.top + unit * 3.1),
          Offset(headRect.left + unit * 5.0, headRect.bottom - unit * 3.3),
          seamPaint,
        );
        canvas.drawLine(
          Offset(headRect.right - unit * 4.5, headRect.top + unit * 3.1),
          Offset(headRect.right - unit * 5.0, headRect.bottom - unit * 3.3),
          seamPaint,
        );
        for (final side in [-1.0, 1.0]) {
          final eye = Offset(
            headRect.center.dx + side * unit * 7.1,
            headRect.center.dy - unit * 1.3,
          );
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: eye,
                width: unit * 10.4,
                height: unit * 6.8,
              ),
              Radius.circular(unit * 2.1),
            ),
            Paint()..color = const Color(0xFF42272A),
          );
          canvas.drawCircle(
            eye,
            unit * 1.75,
            Paint()
              ..shader = const RadialGradient(
                colors: [
                  Color(0xFFFFE0A0),
                  Color(0xFFFF6A42),
                  Color(0xFF8E2330),
                ],
                stops: [0, .46, 1],
              ).createShader(Rect.fromCircle(center: eye, radius: unit * 2.1)),
          );
          canvas.drawCircle(
            eye.translate(-unit * .65, -unit * .7),
            unit * .55,
            Paint()..color = Colors.white.withValues(alpha: .9),
          );
        }
        // The source robot's mouth is a broad inverted U whose two legs reach
        // the lower edge of the head, not a small zigzag floating in its face.
        final mouthBottom = headRect.bottom - unit * .55;
        final mouthTop = headRect.bottom - unit * 3.65;
        final mouthPath = Path()
          ..moveTo(headRect.center.dx - unit * 5.7, mouthBottom)
          ..cubicTo(
            headRect.center.dx - unit * 5.2,
            mouthTop,
            headRect.center.dx + unit * 5.2,
            mouthTop,
            headRect.center.dx + unit * 5.7,
            mouthBottom,
          );
        canvas.drawPath(
          mouthPath,
          Paint()
            ..color = const Color(0xFF3B2025)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.25
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round,
        );
        // Two slightly crooked antennae match the little reference robot.
        for (final side in [-1.0, 1.0]) {
          final antennaBase = Offset(
            headRect.center.dx + side * unit * 5.2,
            headRect.top + unit * .2,
          );
          final antennaTip = antennaBase.translate(
            side * unit * (side < 0 ? 1.5 : 1.1),
            -unit * (side < 0 ? 6.2 : 5.5),
          );
          canvas.drawLine(
            antennaBase,
            antennaTip,
            Paint()
              ..color = const Color(0xFF4A2428)
              ..strokeWidth = unit * 1.35
              ..strokeCap = StrokeCap.round,
          );
          canvas.drawCircle(
            antennaTip,
            unit * 1.65,
            Paint()..color = const Color(0xFFE78A51),
          );
          canvas.drawCircle(
            antennaTip,
            unit * 1.65,
            Paint()
              ..color = const Color(0xFF4A2428)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * .65,
          );
        }
      case SlopHat.globalChampion:
        // A blue diamond crown reserved for the current global holder. It is
        // deliberately unlike the ordinary gold Crown cosmetic: this one is
        // the live target that moves when another player takes first place.
        // The common topper transform seats the whole piece on every body
        // and carries its back plane around during a full turn.
        final w = rect.width * .38;
        final h = unit * 19;
        final crest = Path()
          ..moveTo(cx - w * .43, top + unit)
          ..lineTo(cx - w * .50, top - h * .61)
          ..quadraticBezierTo(
            cx - w * .53,
            top - h * .89,
            cx - w * .35,
            top - h * .65,
          )
          ..quadraticBezierTo(
            cx - w * .22,
            top - h * .35,
            cx - w * .13,
            top - h * .78,
          )
          ..quadraticBezierTo(cx, top - h * 1.28, cx + w * .13, top - h * .78)
          ..quadraticBezierTo(
            cx + w * .22,
            top - h * .35,
            cx + w * .35,
            top - h * .65,
          )
          ..quadraticBezierTo(
            cx + w * .53,
            top - h * .89,
            cx + w * .50,
            top - h * .61,
          )
          ..lineTo(cx + w * .43, top + unit)
          ..quadraticBezierTo(cx, top + unit * 4, cx - w * .43, top + unit)
          ..close();
        canvas.drawShadow(crest, const Color(0xAA168BFF), unit * 2.2, false);
        canvas.drawPath(
          crest,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFFE9FBFF),
                Color(0xFF62D8FF),
                Color(0xFF3389FF),
                Color(0xFF2444C7),
              ],
            ).createShader(crest.getBounds()),
        );
        canvas.drawPath(
          crest,
          Paint()
            ..color = const Color(0xFF174B9B).withValues(alpha: .82)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * .7,
        );
        final band = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(cx, top),
            width: w * .90,
            height: unit * 5,
          ),
          Radius.circular(unit * 2.5),
        );
        canvas.drawRRect(band, Paint()..color = const Color(0xFF87E6FF));
        final diamond = Path()
          ..moveTo(cx, top - h * .72)
          ..lineTo(cx + unit * 4.8, top - h * .45)
          ..lineTo(cx, top - h * .12)
          ..lineTo(cx - unit * 4.8, top - h * .45)
          ..close();
        canvas.drawPath(
          diamond,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFFFFFFFF),
                Color(0xFF7CEBFF),
                Color(0xFF2477FF),
              ],
            ).createShader(diamond.getBounds()),
        );
        canvas.drawPath(
          diamond,
          Paint()
            ..color = const Color(0xFF164B9E)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * .65,
        );
        for (final x in [-.32, .32]) {
          canvas.drawCircle(
            Offset(cx + w * x, top - unit * .3),
            unit * 1.2,
            Paint()..color = const Color(0xFFE8FBFF),
          );
        }
      case SlopHat.crown:
        final w = rect.width * 0.34;
        final h = unit * 13;
        final crown = Path()
          ..moveTo(cx - w / 2, top)
          ..lineTo(cx - w / 2, top - h * 0.7)
          ..lineTo(cx - w * 0.25, top - h * 0.25)
          ..lineTo(cx, top - h)
          ..lineTo(cx + w * 0.25, top - h * 0.25)
          ..lineTo(cx + w / 2, top - h * 0.7)
          ..lineTo(cx + w / 2, top)
          ..close();
        canvas.drawPath(crown, Paint()..color = gold);
        canvas.drawPath(
          crown,
          Paint()
            ..color = const Color(0xFFB07800)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.1,
        );
      case SlopHat.cap:
        final w = rect.width * (look.body == SlopBody.star ? .36 : .43);
        final leftSeat = crownY(-w / rect.width / 2) + unit * 1.4;
        final rightSeat = crownY(w / rect.width / 2) + unit;
        final cap = Path()
          ..moveTo(cx - w / 2, leftSeat)
          ..cubicTo(
            cx - w * .54,
            top - unit * 15,
            cx + w * .38,
            top - unit * 19,
            cx + w / 2,
            rightSeat,
          )
          ..quadraticBezierTo(cx, top + unit * 4, cx - w / 2, leftSeat)
          ..close();
        canvas.drawPath(
          cap,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFB9C2EC), Color(0xFF7D86BC)],
            ).createShader(cap.getBounds()),
        );
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(cx + w * 0.42, rightSeat + unit * .5),
            width: w * 0.56,
            height: unit * 4.2,
          ),
          Paint()..color = const Color(0xFF666F9F),
        );
        canvas.drawCircle(
          Offset(cx - unit * 3, top - unit * 12),
          unit * 1.7,
          Paint()..color = const Color(0xFFDDE4FA),
        );
      case SlopHat.halo:
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(cx, top - unit * 13 + wave * unit),
            width: rect.width * 0.4,
            height: unit * 8,
          ),
          Paint()
            ..color = const Color(0xFFFFE9A3)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.6
            ..maskFilter = MaskFilter.blur(BlurStyle.solid, unit * 0.8),
        );
      case SlopHat.horns:
        for (final dir in [-1.0, 1.0]) {
          const hornX = 0.19;
          final contactY = crownY(dir * hornX);
          final base = Offset(
            cx + dir * rect.width * hornX,
            contactY + unit * 1.8,
          );
          canvas.drawPath(
            Path()
              ..moveTo(base.dx - unit * 3.2, base.dy)
              ..quadraticBezierTo(
                base.dx + dir * unit * 2,
                base.dy - unit * 12,
                base.dx + dir * unit * 5,
                base.dy - unit * 14,
              )
              ..quadraticBezierTo(
                base.dx + dir * unit * 1.5,
                base.dy - unit * 7,
                base.dx + unit * 3.2,
                base.dy,
              )
              ..close(),
            Paint()..color = const Color(0xFFF2E4CE),
          );
          // The gel socket hides the horn's flat cut and seats it into the
          // live crown across every body and the expanded Buddy morph.
          canvas.drawOval(
            Rect.fromCenter(
              center: Offset(base.dx, contactY + unit * 1.1),
              width: unit * 8.8,
              height: unit * 5.4,
            ),
            Paint()..color = look.palette.mid.withValues(alpha: 0.92),
          );
        }
      case SlopHat.bow:
        const bowX = 0.20;
        final contactY = crownY(bowX);
        final c = Offset(cx + rect.width * bowX, contactY + unit * 1.8);
        // A small contact shadow is enough to make the knot feel cinched into
        // the gel instead of pasted over it.
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(c.dx, contactY + unit * 1.4),
            width: unit * 15,
            height: unit * 4.2,
          ),
          Paint()..color = look.palette.shade.withValues(alpha: 0.24),
        );
        final bow = Paint()..color = const Color(0xFFFF5A8A);
        for (final dir in [-1.0, 1.0]) {
          canvas.drawPath(
            Path()
              ..moveTo(c.dx, c.dy)
              ..lineTo(c.dx + dir * unit * 9, c.dy - unit * 6)
              ..lineTo(c.dx + dir * unit * 9, c.dy + unit * 5)
              ..close(),
            bow,
          );
        }
        canvas.drawCircle(
          c,
          unit * 2.6,
          Paint()..color = const Color(0xFFD93A6C),
        );
      case SlopHat.beanie:
        final w = rect.width * 0.52;
        canvas.drawPath(
          Path()
            ..moveTo(cx - w / 2, top + unit * 4)
            ..arcToPoint(
              Offset(cx + w / 2, top + unit * 4),
              radius: Radius.circular(w * 0.56),
              clockwise: true,
            )
            ..close(),
          Paint()..color = const Color(0xFF7A5CD8),
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(cx, top + unit * 4),
              width: w * 1.04,
              height: unit * 7,
            ),
            Radius.circular(unit * 3.5),
          ),
          Paint()..color = const Color(0xFF9C82ED),
        );
        canvas.drawCircle(
          Offset(cx, top - unit * 15),
          unit * 5,
          Paint()..color = const Color(0xFFE8DEFF),
        );
      case SlopHat.sprout:
        canvas.drawPath(
          Path()
            ..moveTo(cx, top + unit * 3)
            ..quadraticBezierTo(
              cx + wave * unit,
              top - unit * 8,
              cx,
              top - unit * 15,
            ),
          Paint()
            ..color = const Color(0xFF3E8E42)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.2
            ..strokeCap = StrokeCap.round,
        );
        for (final dir in [-1.0, 1.0]) {
          canvas.drawPath(
            Path()
              ..moveTo(cx, top - unit * 11)
              ..quadraticBezierTo(
                cx + dir * unit * 10,
                top - unit * 20,
                cx + dir * unit * 2,
                top - unit * 21,
              )
              ..quadraticBezierTo(
                cx + dir * unit * 1,
                top - unit * 15,
                cx,
                top - unit * 11,
              )
              ..close(),
            Paint()..color = const Color(0xFF64C46A),
          );
        }
      case SlopHat.propeller:
        final w = rect.width * 0.46;
        canvas.drawPath(
          Path()
            ..moveTo(cx - w / 2, top + unit * 2)
            ..arcToPoint(
              Offset(cx + w / 2, top + unit * 2),
              radius: Radius.circular(w / 2),
              clockwise: true,
            )
            ..close(),
          Paint()..color = const Color(0xFFFF5A5A),
        );
        canvas.save();
        canvas.translate(cx, top - unit * 13);
        canvas.rotate(wave * 2.4);
        for (var i = 0; i < 3; i++) {
          canvas.save();
          canvas.rotate(i * math.pi * 2 / 3);
          canvas.drawOval(
            Rect.fromLTWH(0, -unit * 2, unit * 12, unit * 4),
            Paint()..color = const Color(0xFFFFE066),
          );
          canvas.restore();
        }
        canvas.restore();
        canvas.drawCircle(
          Offset(cx, top - unit * 13),
          unit * 2.4,
          Paint()..color = const Color(0xFF3A2A1A),
        );
      case SlopHat.star:
        canvas.save();
        canvas.translate(cx, top - unit * 12 + wave * unit * 1.5);
        canvas.rotate(wave * 0.12);
        canvas.drawPath(_star(Offset.zero, unit * 12), Paint()..color = gold);
        canvas.restore();
      case SlopHat.headphones:
        // Dedicated volume above paints both cups at their individual depth.
        break;
      // ---- hair -------------------------------------------------------
      case SlopHat.tuft:
        // Two soft swept locks, with a wide seated root. A visible curl
        // gives the starter hairstyle character instead of a brown cone.
        final rootY = crownCenterY + unit * 3;
        final tuft = Path()
          ..moveTo(cx - unit * 13, rootY)
          ..cubicTo(
            cx - unit * 14,
            rootY - unit * 11,
            cx - unit * 2,
            rootY - unit * 10,
            cx + unit * 3,
            rootY - unit * 19,
          )
          ..cubicTo(
            cx + unit * 11,
            rootY - unit * 15,
            cx + unit * 3,
            rootY - unit * 9,
            cx + unit * 3,
            rootY - unit * 8,
          )
          ..cubicTo(
            cx + unit * 8,
            rootY - unit * 8,
            cx + unit * 11,
            rootY - unit * 12,
            cx + unit * 12,
            rootY - unit * 13,
          )
          ..cubicTo(
            cx + unit * 20,
            rootY - unit * 4,
            cx + unit * 9,
            rootY + unit * 3,
            cx - unit * 13,
            rootY,
          )
          ..close();
        canvas.drawPath(
          tuft,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF8F7074), Color(0xFF5E4858)],
            ).createShader(tuft.getBounds()),
        );
        canvas.drawPath(
          Path()
            ..moveTo(cx - unit * 7, rootY - unit * 2)
            ..quadraticBezierTo(
              cx - unit * 9,
              rootY - unit * 7,
              cx + unit * 2,
              rootY - unit * 12,
            ),
          Paint()
            ..color = const Color(0xFFBC9291)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.8
            ..strokeCap = StrokeCap.round,
        );
      case SlopHat.mohawk:
      case SlopHat.ponytail:
      case SlopHat.afro:
      case SlopHat.bangs:
      case SlopHat.curls:
        // Legacy storage IDs are rendered by the dimensional headpiece pass.
        break;
      case SlopHat.mushroom:
        // Both brim corners are sampled from the live crown. The cap's lower
        // edge then bows down into the gel, making a broad contact patch that
        // cannot open into a background-coloured gap during a wobble or morph.
        final mushroomGeometry = slopMushroomBrimGeometryFor(
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        );
        final leftRoot = mushroomGeometry.leftRoot;
        final rightRoot = mushroomGeometry.rightRoot;
        final capBottom = mushroomGeometry.capBottom;
        final cap = Path()
          ..moveTo(leftRoot.dx, leftRoot.dy)
          ..cubicTo(
            cx - rect.width * 0.30,
            crownCenterY - unit * 9,
            cx - rect.width * 0.14,
            crownCenterY - unit * 17,
            cx,
            crownCenterY - unit * 20.5,
          )
          ..cubicTo(
            cx + rect.width * 0.14,
            crownCenterY - unit * 17,
            cx + rect.width * 0.30,
            crownCenterY - unit * 9,
            rightRoot.dx,
            rightRoot.dy,
          )
          ..quadraticBezierTo(
            cx,
            capBottom + unit * 2.2,
            leftRoot.dx,
            leftRoot.dy,
          )
          ..close();
        final capBounds = cap.getBounds();
        canvas.drawPath(
          cap,
          Paint()
            ..color = const Color(0xFF5A1734).withValues(alpha: 0.86)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.6
            ..strokeJoin = StrokeJoin.round,
        );
        canvas.drawPath(
          cap,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFFF8DA8), Color(0xFFF34F77), Color(0xFFB52858)],
              stops: [0, 0.56, 1],
            ).createShader(capBounds),
        );
        // The warm underside is visible only along the brim, not as a second
        // floating oval pasted below the cap.
        canvas.drawPath(
          Path()
            ..moveTo(leftRoot.dx + unit * 1.3, leftRoot.dy + unit * 0.2)
            ..quadraticBezierTo(
              cx,
              capBottom + unit * 1.3,
              rightRoot.dx - unit * 1.3,
              rightRoot.dy + unit * 0.2,
            ),
          Paint()
            ..color = const Color(0xFFFFD9C2).withValues(alpha: 0.82)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 3.6
            ..strokeCap = StrokeCap.round,
        );
        for (final spot in const [
          (-0.18, -8.4, 3.0),
          (0.02, -12.5, 3.7),
          (0.20, -7.0, 2.5),
        ]) {
          canvas.drawCircle(
            Offset(cx + rect.width * spot.$1, crownCenterY + unit * spot.$2),
            unit * spot.$3,
            Paint()..color = const Color(0xFFFFF4D8).withValues(alpha: 0.88),
          );
        }
        canvas.drawArc(
          capBounds.deflate(unit * 2.0),
          math.pi * 1.06,
          math.pi * 0.56,
          false,
          Paint()
            ..color = Colors.white.withValues(alpha: 0.40)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.4
            ..strokeCap = StrokeCap.round,
        );
      case SlopHat.chefPuff:
        // One connected toque silhouette sits behind a fitted band. The band
        // follows three live crown samples, so it remains seated on wide,
        // tall, and expanded Buddy bodies instead of hovering horizontally.
        final bandX = look.body == SlopBody.triangle ? .13 : .255;
        final leftY = crownY(-bandX);
        final rightY = crownY(bandX);
        final puffBase = math.max(leftY, rightY) + unit * 2.8;
        final puff = Path()
          ..moveTo(cx - rect.width * bandX, puffBase)
          ..cubicTo(
            cx - rect.width * 0.30,
            crownCenterY - unit * 5,
            cx - rect.width * 0.22,
            crownCenterY - unit * 17,
            cx - rect.width * 0.11,
            crownCenterY - unit * 15,
          )
          ..cubicTo(
            cx - rect.width * 0.10,
            crownCenterY - unit * 25,
            cx + rect.width * 0.04,
            crownCenterY - unit * 28,
            cx + rect.width * 0.08,
            crownCenterY - unit * 17,
          )
          ..cubicTo(
            cx + rect.width * 0.19,
            crownCenterY - unit * 21,
            cx + rect.width * 0.30,
            crownCenterY - unit * 8,
            cx + rect.width * bandX,
            puffBase,
          )
          ..lineTo(cx - rect.width * bandX, puffBase)
          ..close();
        canvas.drawPath(
          puff,
          Paint()
            ..color = look.palette.shade.withValues(alpha: 0.18)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.5),
        );
        canvas.drawPath(
          puff,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFFFFF), Color(0xFFFFF3DD), Color(0xFFE4D2B8)],
            ).createShader(puff.getBounds()),
        );
        final band = Path()
          ..moveTo(cx - rect.width * bandX, leftY + unit * 0.4)
          ..quadraticBezierTo(
            cx,
            crownCenterY + unit * 1.8,
            cx + rect.width * bandX,
            rightY + unit * 0.4,
          )
          ..lineTo(cx + rect.width * bandX, rightY + unit * 7.2)
          ..quadraticBezierTo(
            cx,
            crownCenterY + unit * 8.7,
            cx - rect.width * bandX,
            leftY + unit * 7.2,
          )
          ..close();
        canvas.drawPath(
          band,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFF8EA), Color(0xFFE8D8C2)],
            ).createShader(band.getBounds()),
        );
        canvas.drawPath(
          Path()
            ..moveTo(cx - rect.width * 0.20, leftY + unit * 4.6)
            ..quadraticBezierTo(
              cx,
              crownCenterY + unit * 6.2,
              cx + rect.width * 0.20,
              rightY + unit * 4.6,
            ),
          Paint()
            ..color = const Color(0xFFBCA88E).withValues(alpha: 0.48)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.8
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(cx - rect.width * 0.10, crownCenterY - unit * 13),
            width: unit * 8,
            height: unit * 4,
          ),
          Paint()..color = Colors.white.withValues(alpha: 0.55),
        );
      case SlopHat.ideaWizard:
        // A soft bent maker's cap with a broad, curved contact patch. Both
        // brim roots sample the live crown, so the hat stays physically fused
        // to wide, tall, resting, and panel-shaped Slops.
        const brimX = 0.30;
        final wizardGeometry = slopIdeaWizardBrimGeometryFor(
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        );
        final leftY = wizardGeometry.leftRoot.dy;
        final rightY = wizardGeometry.rightRoot.dy;
        final brim = Path()
          ..moveTo(cx - rect.width * brimX, leftY)
          ..quadraticBezierTo(
            cx,
            crownCenterY + unit * 7.8,
            cx + rect.width * brimX,
            rightY,
          )
          ..quadraticBezierTo(
            cx,
            crownCenterY + unit * 12.2,
            cx - rect.width * brimX,
            leftY,
          )
          ..close();
        final cone = Path()
          ..moveTo(cx - rect.width * 0.22, leftY + unit * 1.4)
          ..cubicTo(
            cx - rect.width * 0.16,
            crownCenterY - unit * 10,
            cx - rect.width * 0.05,
            crownCenterY - unit * 25,
            cx + rect.width * 0.08,
            crownCenterY - unit * 28,
          )
          ..cubicTo(
            cx + rect.width * 0.18,
            crownCenterY - unit * 29,
            cx + rect.width * 0.24,
            crownCenterY - unit * 22,
            cx + rect.width * 0.13 + wave * unit * 1.4,
            crownCenterY - unit * 18,
          )
          ..cubicTo(
            cx + rect.width * 0.20,
            crownCenterY - unit * 7,
            cx + rect.width * 0.23,
            crownCenterY - unit * 1,
            cx + rect.width * 0.22,
            rightY + unit * 1.4,
          )
          ..close();
        const deepViolet = Color(0xFF321153);
        final hatGradient = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFB777FF), Color(0xFF6B2FC8), deepViolet],
          stops: [0, 0.56, 1],
        );
        for (final piece in [cone, brim]) {
          canvas.drawPath(
            piece,
            Paint()
              ..color = const Color(0xFF170823).withValues(alpha: 0.78)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 2.4
              ..strokeJoin = StrokeJoin.round,
          );
          canvas.drawPath(
            piece,
            Paint()..shader = hatGradient.createShader(piece.getBounds()),
          );
        }
        final ideaOrb = Offset(
          cx + rect.width * 0.13 + wave * unit * 1.4,
          crownCenterY - unit * 18.5,
        );
        canvas.drawCircle(
          ideaOrb,
          unit * 3.7,
          Paint()
            ..color = const Color(0xFFFFA52E).withValues(alpha: 0.36)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 2.3),
        );
        canvas.drawCircle(
          ideaOrb,
          unit * 2.45,
          Paint()..color = const Color(0xFFFFC65B),
        );
        canvas.drawCircle(
          ideaOrb.translate(-unit * 0.7, -unit * 0.8),
          unit * 0.7,
          Paint()..color = Colors.white.withValues(alpha: 0.78),
        );
        _sparkle(
          canvas,
          Offset(cx - rect.width * 0.06, crownCenterY - unit * 8),
          unit * 3,
          Paint()..color = const Color(0xFFFFE79A).withValues(alpha: 0.82),
        );
      case SlopHat.satinBow:
        final contact = slopFittedHatContactsFor(
          look.hat,
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        ).single;
        final knot = contact.root.translate(wave * unit * 0.35, -unit * 2.0);
        canvas.drawOval(
          Rect.fromCenter(
            center: contact.root,
            width: unit * 19,
            height: unit * 5.2,
          ),
          Paint()..color = look.palette.shade.withValues(alpha: 0.22),
        );
        final satin = Paint()
          ..shader =
              const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFFFFC7DD),
                  Color(0xFFF46FA2),
                  Color(0xFFB92B67),
                ],
                stops: [0, 0.52, 1],
              ).createShader(
                Rect.fromCenter(
                  center: knot,
                  width: unit * 32,
                  height: unit * 24,
                ),
              );
        for (final dir in [-1.0, 1.0]) {
          final loop = Path()
            ..moveTo(knot.dx, knot.dy)
            ..cubicTo(
              knot.dx + dir * unit * 6,
              knot.dy - unit * 9,
              knot.dx + dir * unit * 16,
              knot.dy - unit * 7,
              knot.dx + dir * unit * 15,
              knot.dy + unit * 1,
            )
            ..cubicTo(
              knot.dx + dir * unit * 14,
              knot.dy + unit * 8,
              knot.dx + dir * unit * 5,
              knot.dy + unit * 7,
              knot.dx,
              knot.dy,
            )
            ..close();
          canvas.drawPath(loop, satin);
          canvas.drawPath(
            Path()
              ..moveTo(knot.dx + dir * unit * 2.3, knot.dy + unit * 2)
              ..quadraticBezierTo(
                knot.dx + dir * unit * 8,
                knot.dy + unit * 11,
                knot.dx + dir * unit * 5.2,
                knot.dy + unit * 14,
              )
              ..lineTo(knot.dx + dir * unit * 0.8, knot.dy + unit * 7.2)
              ..close(),
            satin,
          );
          canvas.drawPath(
            Path()
              ..moveTo(knot.dx + dir * unit * 2.5, knot.dy - unit * 1)
              ..quadraticBezierTo(
                knot.dx + dir * unit * 8,
                knot.dy - unit * 4.5,
                knot.dx + dir * unit * 12.5,
                knot.dy - unit * 1.2,
              ),
            Paint()
              ..color = Colors.white.withValues(alpha: 0.42)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 1.05
              ..strokeCap = StrokeCap.round,
          );
        }
        canvas.drawCircle(
          knot,
          unit * 3.6,
          Paint()
            ..shader = const RadialGradient(
              center: Alignment(-0.35, -0.38),
              colors: [Color(0xFFFFE5EF), Color(0xFFE95690), Color(0xFFAA245C)],
            ).createShader(Rect.fromCircle(center: knot, radius: unit * 3.6)),
        );
      case SlopHat.pearlTiara:
        final contacts = slopFittedHatContactsFor(
          look.hat,
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        );
        final left = contacts.first.root;
        final middle = contacts[1].root;
        final right = contacts.last.root;
        final band = Path()
          ..moveTo(left.dx, left.dy)
          ..quadraticBezierTo(
            middle.dx,
            middle.dy - unit * 4.8,
            right.dx,
            right.dy,
          );
        canvas.drawPath(
          band,
          Paint()
            ..color = const Color(0xFF8E6D98).withValues(alpha: 0.38)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 4.6
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawPath(
          band,
          Paint()
            ..shader = const LinearGradient(
              colors: [Color(0xFFDCC8EE), Color(0xFFFFF0FA), Color(0xFFC9B3DD)],
            ).createShader(Rect.fromPoints(left, right))
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.4
            ..strokeCap = StrokeCap.round,
        );
        for (var i = 0; i < 7; i++) {
          final x = -0.23 + i * (0.46 / 6);
          final localCrown = crownY(x);
          final lift = unit * (2.6 + 6.8 * (1 - (i - 3).abs() / 3));
          final pearl = Offset(cx + rect.width * x, localCrown - lift);
          canvas.drawLine(
            Offset(pearl.dx, localCrown + unit * 1.5),
            pearl.translate(0, unit * 1.4),
            Paint()
              ..color = const Color(0xFFD3B7DC)
              ..strokeWidth = unit * 1.4
              ..strokeCap = StrokeCap.round,
          );
          final radius = unit * (i == 3 ? 3.0 : 2.2);
          canvas.drawCircle(
            pearl,
            radius,
            Paint()
              ..shader = const RadialGradient(
                center: Alignment(-0.36, -0.42),
                colors: [Colors.white, Color(0xFFF6D9EA), Color(0xFFB695C4)],
              ).createShader(Rect.fromCircle(center: pearl, radius: radius)),
          );
        }
      case SlopHat.blossomCrown:
        final contacts = slopFittedHatContactsFor(
          look.hat,
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        );
        final vine = Path()
          ..moveTo(contacts.first.root.dx, contacts.first.root.dy);
        for (var i = 1; i < contacts.length; i++) {
          final previous = contacts[i - 1].root;
          final current = contacts[i].root;
          vine.quadraticBezierTo(
            (previous.dx + current.dx) / 2,
            math.min(previous.dy, current.dy) - unit * 1.2,
            current.dx,
            current.dy,
          );
        }
        canvas.drawPath(
          vine,
          Paint()
            ..color = const Color(0xFF4D8B5D)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.3
            ..strokeCap = StrokeCap.round,
        );
        const flowerColors = [
          Color(0xFFFF9EBC),
          Color(0xFFFFD68A),
          Color(0xFFCEB0FF),
          Color(0xFFFFB6A0),
          Color(0xFFA9E6C2),
        ];
        for (var i = 0; i < contacts.length; i++) {
          final flower = contacts[i].crown.translate(
            0,
            unit * (i.isEven ? 0.3 : -1.1),
          );
          final radius = unit * (i == 2 ? 5.0 : 4.1);
          for (var petal = 0; petal < 5; petal++) {
            final angle = petal * math.pi * 2 / 5 - math.pi / 2;
            final petalCenter =
                flower +
                Offset(math.cos(angle), math.sin(angle)) * radius * 0.62;
            canvas.drawOval(
              Rect.fromCenter(
                center: petalCenter,
                width: radius * 0.95,
                height: radius * 0.72,
              ),
              Paint()..color = flowerColors[i].withValues(alpha: 0.96),
            );
          }
          canvas.drawCircle(
            flower,
            radius * 0.31,
            Paint()..color = const Color(0xFFFFF0A6),
          );
        }
      case SlopHat.butterflyClips:
        final contacts = slopFittedHatContactsFor(
          look.hat,
          rect,
          body: look.body,
          round: round,
          wave: wave,
          shift: shift,
          shiftMorph: shiftMorph,
          renderUnit: unit,
        );
        const wingColors = [Color(0xFFFF8FBC), Color(0xFF9FD6FF)];
        for (var i = 0; i < contacts.length; i++) {
          final side = i == 0 ? -1.0 : 1.0;
          final clasp = contacts[i].root.translate(0, -unit * 1.8);
          canvas.drawOval(
            Rect.fromCenter(
              center: contacts[i].root,
              width: unit * 13,
              height: unit * 4,
            ),
            Paint()..color = look.palette.shade.withValues(alpha: 0.22),
          );
          canvas.save();
          canvas.translate(clasp.dx, clasp.dy);
          canvas.rotate(side * (0.18 + wave * 0.02));
          for (final dir in [-1.0, 1.0]) {
            final wing = Path()
              ..moveTo(0, 0)
              ..cubicTo(
                dir * unit * 3,
                -unit * 7,
                dir * unit * 10,
                -unit * 6,
                dir * unit * 8,
                -unit * 0.6,
              )
              ..cubicTo(
                dir * unit * 7,
                unit * 4.2,
                dir * unit * 2.5,
                unit * 4.3,
                0,
                0,
              )
              ..close();
            canvas.drawPath(
              wing,
              Paint()
                ..shader = LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color.lerp(wingColors[i], Colors.white, 0.42)!,
                    wingColors[i],
                    Color.lerp(wingColors[i], Colors.black, 0.18)!,
                  ],
                ).createShader(wing.getBounds()),
            );
            canvas.drawCircle(
              Offset(dir * unit * 4.1, -unit * 1.4),
              unit * 1.15,
              Paint()..color = Colors.white.withValues(alpha: 0.54),
            );
          }
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset.zero,
                width: unit * 2.5,
                height: unit * 7,
              ),
              Radius.circular(unit * 1.2),
            ),
            Paint()..color = const Color(0xFF6B436D),
          );
          canvas.restore();
        }
      case SlopHat.mintedBeret:
        // Soft mint felt, a fitted band and a tiny gold stitch. The hat uses
        // the shared crown transform rather than flattening a coin on top.
        final contact = Offset(cx, crownY(0) + unit * 1.4);
        final beretCenter = contact.translate(-unit * 1.5, -unit * 8.7);
        canvas.save();
        canvas.translate(beretCenter.dx, beretCenter.dy);
        canvas.rotate(-0.10 + wave * 0.008);
        canvas.translate(-beretCenter.dx, -beretCenter.dy);
        canvas.drawOval(
          Rect.fromCenter(
            center: contact.translate(unit * 0.6, unit * 0.8),
            width: unit * 25,
            height: unit * 7,
          ),
          Paint()..color = look.palette.shade.withValues(alpha: 0.24),
        );
        final band = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: contact.translate(-unit * .5, -unit * 1.8),
            width: unit * 25,
            height: unit * 4.5,
          ),
          Radius.circular(unit * 2),
        );
        canvas.drawRRect(band, Paint()..color = const Color(0xFF477F70));
        canvas.save();
        canvas.translate(beretCenter.dx, beretCenter.dy);
        canvas.scale(unit);
        final felt = Path()
          ..moveTo(-17, 3)
          ..cubicTo(-22, -2, -14, -10, -1, -9)
          ..cubicTo(12, -11, 21, -5, 18, 1)
          ..cubicTo(13, 5, 3, 6, -7, 6)
          ..cubicTo(-11, 6, -15, 4, -17, 3)
          ..close();
        canvas.drawPath(
          felt,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFC5E5C9), Color(0xFF8CBCA1), Color(0xFF568A77)],
              stops: [0, .46, 1],
            ).createShader(const Rect.fromLTRB(-20, -10, 20, 7)),
        );
        canvas.drawPath(
          Path()
            ..moveTo(-2, -9)
            ..quadraticBezierTo(-4, -12, -1, -13),
          Paint()
            ..color = const Color(0xFF679B80)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawPath(
          Path()
            ..moveTo(9, -.8)
            ..lineTo(11, 1.2)
            ..lineTo(9, 3.2)
            ..lineTo(7, 1.2)
            ..close(),
          Paint()..color = const Color(0xFFEFCB7D),
        );
        canvas.restore();
        canvas.restore();
      case SlopHat.none:
        break;
    }
    if (rearHatWeight > 0.001) {
      canvas.restore();
    }
    canvas.restore();
  }

  /// Physical half-width of an authored eye-bound surface group. Profile
  /// projection uses the same value for the socket, its brow and its selected
  /// wearable so those layers cannot separate while crossing the tangent.
  static double _profileEyeSlotHalfWidth({
    required SlopLook look,
    required double direction,
    required double eyeW,
    required double unit,
  }) {
    final isAuthoredSlot = switch (look.accessory) {
      SlopAccessory.monocle || SlopAccessory.sticker => direction > 0,
      SlopAccessory.bandage ||
      SlopAccessory.eyepatch ||
      SlopAccessory.tear => direction < 0,
      _ => false,
    };
    if (!isAuthoredSlot) {
      return switch (look.accessory) {
        SlopAccessory.glasses => eyeW * 0.75 + unit,
        SlopAccessory.shades => eyeW * 0.85,
        SlopAccessory.mask => eyeW * 0.95,
        _ => eyeW * 0.5,
      };
    }
    return switch (look.accessory) {
      SlopAccessory.monocle => eyeW * 0.86 + unit * 1.2,
      SlopAccessory.sticker => math.max(eyeW * 0.5, unit * 24),
      SlopAccessory.bandage => math.max(eyeW * 0.5, unit * 15),
      SlopAccessory.eyepatch => math.max(eyeW * 0.75, unit * 13),
      SlopAccessory.tear => math.max(eyeW * 0.5, unit * 5),
      _ => eyeW * 0.5,
    };
  }

  /// Profile-only paired face wear.
  ///
  /// A front-authored pair cannot be projected as one rigid band at the side:
  /// doing so leaves an empty far frame beside the surviving eye. Each lobe
  /// follows the exact authored socket transform, far first and near last;
  /// only the bridge spans them, where the live body clip turns it into the
  /// short temple segment visible at a tangent.
  static void _paintProfilePairedAccessory(
    Canvas canvas, {
    required Offset center,
    required double eyeY,
    required double gap,
    required double eyeW,
    required double eyeH,
    required double unit,
    required SlopLook look,
    required _SlopProfileFaceContext profileContext,
  }) {
    final directions = <double>[
      profileContext.farDirection,
      profileContext.nearDirection,
    ];
    final transforms = <double, ({double centerX, double localScaleX})>{};
    for (final direction in directions) {
      transforms[direction] = profileContext.transformFor(
        canonicalX: center.dx + direction * gap,
        unit: unit,
        direction: direction,
        canonicalHalfWidth: _profileEyeSlotHalfWidth(
          look: look,
          direction: direction,
          eyeW: eyeW,
          unit: unit,
        ),
        surfaceY: eyeY,
      );
    }
    final leftX = transforms[-1.0]!.centerX;
    final rightX = transforms[1.0]!.centerX;

    switch (look.accessory) {
      case SlopAccessory.glasses:
        final frame = Paint()
          ..color = const Color(0xFF2B2B33)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 1.8;
        canvas.drawLine(
          Offset(leftX + (rightX - leftX) * 0.34, eyeY),
          Offset(leftX + (rightX - leftX) * 0.66, eyeY),
          frame,
        );
        for (final direction in directions) {
          final transform = transforms[direction]!;
          final x = transform.centerX;
          canvas.save();
          canvas.translate(x, eyeY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -eyeY);
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(x, eyeY),
                width: eyeW * 1.5,
                height: eyeH * 1.15,
              ),
              Radius.circular(unit * 5),
            ),
            frame,
          );
          canvas.restore();
        }
      case SlopAccessory.shades:
        final lens = Paint()..color = const Color(0xFF17181F);
        canvas.drawRect(
          Rect.fromCenter(
            center: Offset((leftX + rightX) * 0.5, eyeY - eyeH * 0.16),
            width: (rightX - leftX).abs() * 0.45,
            height: unit * 2.6,
          ),
          lens,
        );
        for (final direction in directions) {
          final transform = transforms[direction]!;
          final x = transform.centerX;
          canvas.save();
          canvas.translate(x, eyeY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -eyeY);
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(x, eyeY),
                width: eyeW * 1.7,
                height: eyeH,
              ),
              Radius.circular(unit * 4),
            ),
            lens,
          );
          canvas.drawLine(
            Offset(x - eyeW * 0.5, eyeY + eyeH * 0.24),
            Offset(x - eyeW * 0.1, eyeY - eyeH * 0.28),
            Paint()
              ..color = Colors.white.withValues(alpha: 0.35)
              ..strokeWidth = unit * 2.2
              ..strokeCap = StrokeCap.round,
          );
          canvas.restore();
        }
      case SlopAccessory.mask:
        final mask = Paint()..color = const Color(0xFF20222A);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTRB(
              leftX,
              eyeY - eyeH * 0.42,
              rightX,
              eyeY + eyeH * 0.42,
            ),
            Radius.circular(eyeH * 0.3),
          ),
          mask,
        );
        for (final direction in directions) {
          final transform = transforms[direction]!;
          final x = transform.centerX;
          canvas.save();
          canvas.translate(x, eyeY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -eyeY);
          final lobe = Path()
            ..addRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: Offset(x, eyeY),
                  width: eyeW * 1.9,
                  height: eyeH * 1.35,
                ),
                Radius.circular(eyeH * 0.6),
              ),
            );
          final hole = Path()
            ..addOval(
              Rect.fromCenter(
                center: Offset(x, eyeY),
                width: eyeW * 1.02,
                height: eyeH * 0.8,
              ),
            );
          canvas.drawPath(
            Path.combine(PathOperation.difference, lobe, hole),
            mask,
          );
          canvas.restore();
        }
      case SlopAccessory.freckles:
        final dot = Paint()..color = look.palette.shade.withValues(alpha: 0.5);
        for (final direction in directions) {
          final transform = transforms[direction]!;
          final x = transform.centerX;
          canvas.save();
          canvas.translate(x, eyeY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -eyeY);
          for (var index = 0; index < 3; index++) {
            canvas.drawCircle(
              Offset(
                x + direction * unit * (7 + index * 4.5),
                eyeY + eyeH * (0.52 + (index.isEven ? 0.12 : 0)),
              ),
              unit * 1.5,
              dot,
            );
          }
          canvas.restore();
        }
      default:
        break;
    }
  }

  /// Worn on the face, over whatever eyes were chosen.
  static void _paintAccessory(
    Canvas canvas, {
    required Offset center,
    required double eyeY,
    required Offset mouthCenter,
    required double gap,
    required double eyeW,
    required double eyeH,
    required double unit,
    required SlopLook look,
  }) {
    final palette = look.palette;
    switch (look.accessory) {
      case SlopAccessory.glasses:
        final frame = Paint()
          ..color = const Color(0xFF2B2B33)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 1.8;
        for (final dir in [-1.0, 1.0]) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(center.dx + dir * gap, eyeY),
                width: eyeW * 1.5,
                height: eyeH * 1.15,
              ),
              Radius.circular(unit * 5),
            ),
            frame,
          );
        }
        canvas.drawLine(
          Offset(center.dx - gap * 0.32, eyeY),
          Offset(center.dx + gap * 0.32, eyeY),
          frame,
        );
      case SlopAccessory.shades:
        final lens = Paint()..color = const Color(0xFF17181F);
        for (final dir in [-1.0, 1.0]) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(center.dx + dir * gap, eyeY),
                width: eyeW * 1.7,
                height: eyeH * 1.0,
              ),
              Radius.circular(unit * 4),
            ),
            lens,
          );
        }
        canvas.drawRect(
          Rect.fromCenter(
            center: Offset(center.dx, eyeY - eyeH * 0.16),
            width: gap * 0.9,
            height: unit * 2.6,
          ),
          lens,
        );
        // One diagonal glint stops them reading as two black holes.
        for (final dir in [-1.0, 1.0]) {
          canvas.drawLine(
            Offset(center.dx + dir * gap - eyeW * 0.5, eyeY + eyeH * 0.24),
            Offset(center.dx + dir * gap - eyeW * 0.1, eyeY - eyeH * 0.28),
            Paint()
              ..color = Colors.white.withValues(alpha: 0.35)
              ..strokeWidth = unit * 2.2
              ..strokeCap = StrokeCap.round,
          );
        }
      case SlopAccessory.freckles:
        final dot = Paint()..color = palette.shade.withValues(alpha: 0.5);
        for (final dir in [-1.0, 1.0]) {
          for (var i = 0; i < 3; i++) {
            canvas.drawCircle(
              Offset(
                center.dx + dir * (gap + unit * (7 + i * 4.5)),
                eyeY + eyeH * (0.52 + (i.isEven ? 0.12 : 0.0)),
              ),
              unit * 1.5,
              dot,
            );
          }
        }
      case SlopAccessory.sticker:
        canvas.save();
        canvas.translate(center.dx + gap + unit * 16, eyeY - eyeH * 0.7);
        canvas.rotate(0.3);
        canvas.drawPath(
          _star(Offset.zero, unit * 8),
          Paint()..color = const Color(0xFFFFD93B),
        );
        canvas.drawPath(
          _star(Offset.zero, unit * 8),
          Paint()
            ..color = const Color(0xFFB98C00)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.1,
        );
        canvas.restore();
      case SlopAccessory.bandage:
        canvas.save();
        canvas.translate(center.dx - gap - unit * 2, eyeY - eyeH * 0.85);
        canvas.rotate(-0.42);
        final rr = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset.zero,
            width: unit * 26,
            height: unit * 9,
          ),
          Radius.circular(unit * 3),
        );
        canvas.drawRRect(rr, Paint()..color = const Color(0xFFF7C9A8));
        canvas.drawRect(
          Rect.fromCenter(
            center: Offset.zero,
            width: unit * 9,
            height: unit * 9,
          ),
          Paint()..color = const Color(0xFFE0A87F),
        );
        canvas.restore();
      case SlopAccessory.monocle:
        final frame = Paint()
          ..color = const Color(0xFFD9B44A)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 2;
        canvas.drawCircle(Offset(center.dx + gap, eyeY), eyeW * 0.86, frame);
        canvas.drawLine(
          Offset(center.dx + gap, eyeY + eyeW * 0.86),
          Offset(center.dx + gap - unit * 4, eyeY + eyeH * 1.5),
          frame,
        );
      case SlopAccessory.eyepatch:
        final patchCenter = Offset(center.dx - gap, eyeY);
        final strap = Paint()
          ..color = const Color(0xFF665269)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 2.2
          ..strokeCap = StrokeCap.round;
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - gap - eyeW, eyeY - eyeH * .5)
            ..quadraticBezierTo(
              center.dx,
              eyeY - eyeH * .97,
              center.dx + gap + eyeW,
              eyeY - eyeH * .76,
            ),
          strap,
        );
        final patch = Path()
          ..moveTo(patchCenter.dx - eyeW * .72, eyeY - eyeH * .50)
          ..quadraticBezierTo(
            patchCenter.dx,
            eyeY - eyeH * .68,
            patchCenter.dx + eyeW * .72,
            eyeY - eyeH * .48,
          )
          ..lineTo(patchCenter.dx + eyeW * .68, eyeY + eyeH * .15)
          ..quadraticBezierTo(
            patchCenter.dx,
            eyeY + eyeH * .88,
            patchCenter.dx - eyeW * .68,
            eyeY + eyeH * .15,
          )
          ..close();
        canvas.drawPath(
          patch,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF79657D), Color(0xFF43374F)],
            ).createShader(patch.getBounds()),
        );
        canvas.drawPath(
          patch,
          Paint()
            ..color = const Color(0xFF332B40)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * .8,
        );
        canvas.drawCircle(
          patchCenter.translate(-eyeW * .38, -eyeH * .25),
          unit * 1.35,
          Paint()..color = const Color(0xFFF4D99D),
        );
      case SlopAccessory.mustache:
        // A moustache belongs to the upper lip, not to the selected eye. Eye
        // families have radically different heights (especially cyclops and
        // squint), so deriving this from [eyeH] used to send it through an eye
        // on one Slop and below the mouth on another. Keep the whole silhouette
        // just above the largest resting mouth that this body can draw.
        final mouthMetrics = slopRestingMouthMetricsFor(look.body);
        final upperLipY =
            mouthCenter.dy - unit * (mouthMetrics.maxHeight * 0.5);
        final m = Paint()..color = palette.ink.withValues(alpha: 0.9);
        for (final dir in [-1.0, 1.0]) {
          canvas.drawPath(
            Path()
              ..moveTo(mouthCenter.dx, upperLipY - unit * 2.2)
              ..cubicTo(
                mouthCenter.dx + dir * unit * 5.5,
                upperLipY - unit * 4.5,
                mouthCenter.dx + dir * unit * 12.5,
                upperLipY - unit * 3.7,
                mouthCenter.dx + dir * unit * 16,
                upperLipY - unit * 1.7,
              )
              ..cubicTo(
                mouthCenter.dx + dir * unit * 13,
                upperLipY - unit * 1.15,
                mouthCenter.dx + dir * unit * 8.5,
                upperLipY - unit * 0.55,
                mouthCenter.dx + dir * unit * 5,
                upperLipY - unit * 1.05,
              )
              ..quadraticBezierTo(
                mouthCenter.dx + dir * unit * 2,
                upperLipY - unit * 1.35,
                mouthCenter.dx,
                upperLipY - unit * 2.2,
              )
              ..close(),
            m,
          );
        }
      case SlopAccessory.tear:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - gap, eyeY + eyeH * 0.5)
            ..quadraticBezierTo(
              center.dx - gap + unit * 5,
              eyeY + eyeH * 0.9,
              center.dx - gap,
              eyeY + eyeH * 1.35,
            )
            ..quadraticBezierTo(
              center.dx - gap - unit * 5,
              eyeY + eyeH * 0.9,
              center.dx - gap,
              eyeY + eyeH * 0.5,
            )
            ..close(),
          Paint()..color = const Color(0xFF7FD4FF).withValues(alpha: 0.9),
        );
      case SlopAccessory.mask:
        // A domino mask across both eyes.
        // Cut the eye holes out of the mask as a path difference. A
        // BlendMode.clear here would punch a hole clean through the body.
        var maskPath = Path()
          ..addRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(center.dx, eyeY),
                width: gap * 2 + eyeW * 1.9,
                height: eyeH * 1.35,
              ),
              Radius.circular(eyeH * 0.6),
            ),
          );
        for (final dir in [-1.0, 1.0]) {
          maskPath = Path.combine(
            PathOperation.difference,
            maskPath,
            Path()..addOval(
              Rect.fromCenter(
                center: Offset(center.dx + dir * gap, eyeY),
                width: eyeW * 1.02,
                height: eyeH * 0.80,
              ),
            ),
          );
        }
        canvas.drawPath(maskPath, Paint()..color = const Color(0xFF20222A));
      case SlopAccessory.none:
        break;
    }
  }

  /// The face. Style comes from the user's [SlopLook]; [emotion] only modulates
  /// it, so customizing your Slop is never overridden by what it is feeling.
  static void _paintFace(
    Canvas canvas, {
    required Offset center,
    required double unit,
    required SlopLook look,
    required SlopEmotion emotion,
    required double phase,
    required Offset gaze,
    required double talk,
    double smirk = 0,
    required double reaction,
    required bool showMouth,
    required double mouthOpacity,
    _SlopProfileFaceContext? profileContext,
    Color? facialLineColor,
  }) {
    final palette = look.palette;
    final lineInk = facialLineColor ?? slopMaterialFacialLineColorFor(look);
    // Pupils can differ from the body's ink so a Slop can have eyes that
    // contrast with its own colour.
    final pupilColor = slopResolvedEyeColorFor(look);
    final pupilDeep = slopEyeDeepToneFor(pupilColor);
    final pupilLight = slopEyeLightToneFor(pupilColor);
    final sclera = Paint()..color = const Color(0xFFFFFDF8);
    final blink = _blink(phase);

    final wide = emotion == SlopEmotion.excited;
    final narrow = emotion == SlopEmotion.thinking;
    final premiumCyclops = look.eyes == SlopEyes.slopCyclops;
    final cyclops = look.eyes == SlopEyes.cyclops || premiumCyclops;
    final three = look.eyes == SlopEyes.three;

    final gap = unit * (cyclops ? 0 : 16.2);
    final eyeY = center.dy;
    final gazeX = gaze.dx.clamp(-1.0, 1.0) * unit * 2.4;
    final gazeY = gaze.dy.clamp(-1.0, 1.0) * unit * 2.4;

    // Eye style sets the resting size; emotion only nudges it.
    final styleW = switch (look.eyes) {
      SlopEyes.wide => 1.22,
      SlopEyes.sleepy => 1.08,
      SlopEyes.star => 1.05,
      SlopEyes.sparkle => 1.18,
      SlopEyes.squint => 1.12,
      SlopEyes.three => 0.84,
      SlopEyes.visor => 1.0,
      SlopEyes.velvetLash => 1.10,
      SlopEyes.orbit => 1.12,
      _ => 1.0,
    };
    final styleH = switch (look.eyes) {
      SlopEyes.wide => 1.26,
      SlopEyes.sleepy => 0.9,
      SlopEyes.sparkle => 1.22,
      SlopEyes.squint => 0.5,
      SlopEyes.three => 0.82,
      SlopEyes.velvetLash => 1.04,
      SlopEyes.orbit => 1.08,
      _ => 1.0,
    };
    final baseW =
        unit *
        (premiumCyclops
            ? 39.0
            : cyclops
            ? 29.5
            : 17.5) *
        styleW *
        (cyclops ? slopCyclopsEyeScale : 1) *
        (wide ? 1.10 : 1.0);
    final baseH =
        unit *
        (premiumCyclops
            ? 35.5
            : cyclops
            ? 31.5
            : 21.5) *
        styleH *
        (cyclops ? slopCyclopsEyeScale : 1) *
        (wide ? 1.14 : 1.0) *
        (narrow ? 0.82 : 1.0);

    if (look.pattern == SlopPattern.itCouldBeWorseRobot) {
      // One vertical shell line sits outside each socket on the reference.
      // Keeping these in the face plane makes them turn with the eyes and
      // avoids the rejected horizontal jaw seam across the whole head.
      final seamPaint = Paint()
        ..color = const Color(0xFF6B3032).withValues(alpha: .82)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 1.25
        ..strokeCap = StrokeCap.round;
      for (final direction in [-1.0, 1.0]) {
        final x = center.dx + direction * unit * 29.2;
        canvas.drawPath(
          Path()
            ..moveTo(x, eyeY - unit * 10.2)
            ..quadraticBezierTo(
              x + direction * unit * .9,
              eyeY,
              x,
              eyeY + unit * 10.4,
            ),
          seamPaint,
        );
      }
      for (final direction in [-1.0, 1.0]) {
        final eye = Offset(
          center.dx + direction * unit * 16.2 + gazeX * .28,
          eyeY + gazeY * .18,
        );
        final socket = RRect.fromRectAndRadius(
          Rect.fromCenter(center: eye, width: unit * 20.5, height: unit * 17.2),
          Radius.circular(unit * 4.2),
        );
        canvas.drawRRect(socket, Paint()..color = const Color(0xFF42272A));
        canvas.drawRRect(
          socket,
          Paint()
            ..color = const Color(0xFF6B3032)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * .85,
        );
        if (blink > .9) {
          canvas.drawLine(
            eye.translate(-unit * 4.4, 0),
            eye.translate(unit * 4.4, 0),
            Paint()
              ..color = const Color(0xFFFF6A42)
              ..strokeWidth = unit * 1.8
              ..strokeCap = StrokeCap.round,
          );
        } else {
          final glowRect = Rect.fromCircle(center: eye, radius: unit * 3.2);
          canvas.drawCircle(
            eye,
            unit * 2.85,
            Paint()
              ..shader = const RadialGradient(
                colors: [
                  Color(0xFFFFE0A0),
                  Color(0xFFFF6A42),
                  Color(0xFF8E2330),
                ],
                stops: [0, .46, 1],
              ).createShader(glowRect),
          );
          canvas.drawCircle(
            eye.translate(-unit * 1.3, -unit * 1.4),
            unit * 1.0,
            Paint()..color = Colors.white.withValues(alpha: .9),
          );
        }
      }
      if (showMouth && mouthOpacity > .001) {
        final mouthMetrics = slopRestingMouthMetricsFor(look.body);
        _paintMouth(
          canvas,
          center: Offset(center.dx, eyeY + unit * mouthMetrics.offsetY),
          unit: unit,
          look: look,
          emotion: emotion,
          talk: talk,
          smirk: smirk,
          reaction: reaction,
          facialLineColor: facialLineColor,
        );
      }
      return;
    }

    if (premiumCyclops) {
      final transform = profileContext?.transformFor(
        canonicalX: center.dx,
        unit: unit,
        direction: 0,
        canonicalHalfWidth: baseW * 0.5,
        surfaceY: eyeY,
        targetScaleX: 0.72,
      );
      final eyeCenter = Offset(transform?.centerX ?? center.dx, eyeY);
      if (transform != null) {
        canvas.save();
        canvas.translate(eyeCenter.dx, eyeCenter.dy);
        canvas.scale(transform.localScaleX, 1);
        canvas.translate(-eyeCenter.dx, -eyeCenter.dy);
      }

      final visibleHeight = math.max(unit * 0.8, baseH * (1 - blink));
      if (blink > 0.9) {
        canvas.drawLine(
          eyeCenter.translate(-baseW * 0.42, 0),
          eyeCenter.translate(baseW * 0.42, 0),
          Paint()
            ..color = lineInk
            ..strokeWidth = unit * 1.7
            ..strokeCap = StrokeCap.round,
        );
      } else {
        final eyeRect = Rect.fromCenter(
          center: eyeCenter,
          width: baseW,
          height: visibleHeight,
        );
        canvas.drawOval(
          eyeRect.shift(Offset(0, unit * 1.2)),
          Paint()
            ..color = Colors.black.withValues(alpha: 0.18)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 2.4),
        );
        canvas.drawOval(
          eyeRect,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFFCEB), Color(0xFFF2D36C)],
            ).createShader(eyeRect),
        );
        canvas.drawOval(
          eyeRect,
          Paint()
            ..color = lineInk
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.25,
        );

        final irisCenter = eyeCenter.translate(gazeX * 1.45, gazeY * 0.72);
        final irisRect = Rect.fromCenter(
          center: irisCenter,
          width: baseW * 0.57,
          height: visibleHeight * 0.52,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(irisRect, Radius.circular(irisRect.height)),
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.34, -0.38),
              radius: 0.92,
              colors: [pupilLight, pupilColor, pupilDeep],
              stops: const [0, 0.48, 1],
            ).createShader(irisRect),
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(irisRect, Radius.circular(irisRect.height)),
          Paint()
            ..color = pupilDeep
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.9,
        );
        paintSlopIrisWordmark(
          canvas,
          irisRect.deflate(unit * .6),
          const Color(0xFFFFF4C6),
        );
        canvas.drawCircle(
          irisCenter.translate(irisRect.width * 0.27, -irisRect.height * 0.23),
          unit * 1.2,
          Paint()..color = Colors.white.withValues(alpha: 0.82),
        );
      }
      if (transform != null) canvas.restore();
      _paintBrowsAndRest(
        canvas,
        center: center,
        eyeY: eyeY,
        gap: 0,
        baseW: baseW,
        baseH: baseH,
        unit: unit,
        look: look,
        emotion: emotion,
        talk: talk,
        smirk: smirk,
        reaction: reaction,
        cyclops: true,
        showMouth: showMouth,
        mouthOpacity: mouthOpacity,
        profileContext: profileContext,
        facialLineColor: facialLineColor,
      );
      return;
    }

    if (look.eyes == SlopEyes.visor) {
      final transform = profileContext?.transformFor(
        canonicalX: center.dx,
        unit: unit,
        direction: 0,
        canonicalHalfWidth: unit * 34,
        surfaceY: eyeY,
        targetScaleX: .72,
      );
      final visorCenter = Offset(transform?.centerX ?? center.dx, eyeY);
      canvas.save();
      canvas.translate(visorCenter.dx, visorCenter.dy);
      canvas.scale(transform?.localScaleX ?? 1, 1);
      paintSlopBubbleVisor(canvas, Offset.zero, unit);
      canvas.restore();
    }

    if (look.eyes == SlopEyes.many) {
      // Ten genuinely independent little eyes: an instantly recognizable
      // mutation that still fits the standard face box and tracks together.
      const positions = slopManyEyeOffsets;
      final manySlots = <({int index, double x, double y, double direction})>[
        for (var i = 0; i < positions.length; i++)
          (
            index: i,
            x: positions[i].$1,
            y: positions[i].$2,
            direction: positions[i].$1.sign,
          ),
      ];
      if (profileContext != null) {
        manySlots.sort((a, b) {
          int rank(double direction) => profileContext.isFar(direction) ? 0 : 1;
          return rank(a.direction).compareTo(rank(b.direction));
        });
      }
      for (final slot in manySlots) {
        final canonicalX = center.dx + unit * slot.x;
        var eyeCenter = Offset(canonicalX, eyeY + unit * slot.y);
        final size = unit * 7.2;
        ({double centerX, double localScaleX})? slotTransform;
        if (profileContext != null) {
          slotTransform = profileContext.transformFor(
            canonicalX: canonicalX,
            unit: unit,
            direction: slot.direction,
            canonicalHalfWidth: size * 0.5,
            surfaceY: eyeCenter.dy,
            targetScaleX: 0.74,
          );
          eyeCenter = Offset(slotTransform.centerX, eyeCenter.dy);
        }
        if (slotTransform != null) {
          canvas.save();
          canvas.translate(eyeCenter.dx, eyeCenter.dy);
          canvas.scale(slotTransform.localScaleX, 1);
          canvas.translate(-eyeCenter.dx, -eyeCenter.dy);
        }
        final eyeRect = Rect.fromCenter(
          center: eyeCenter,
          width: size,
          height: math.max(unit * 0.7, size * (1 - blink)),
        );
        if (blink > 0.88) {
          canvas.drawLine(
            eyeCenter.translate(-size * 0.38, 0),
            eyeCenter.translate(size * 0.38, 0),
            Paint()
              ..color = lineInk
              ..strokeWidth = unit * 1.15
              ..strokeCap = StrokeCap.round,
          );
          if (slotTransform != null) canvas.restore();
          continue;
        }
        canvas.drawOval(eyeRect, sclera);
        final pupil = eyeCenter.translate(gazeX * 0.28, gazeY * 0.28);
        canvas.drawCircle(pupil, size * 0.22, Paint()..color = pupilDeep);
        canvas.drawCircle(pupil, size * 0.17, Paint()..color = pupilColor);
        canvas.drawCircle(
          pupil.translate(-size * 0.07, -size * 0.08),
          size * 0.055,
          Paint()..color = Colors.white.withValues(alpha: 0.9),
        );
        if (slotTransform != null) canvas.restore();
      }
      _paintBrowsAndRest(
        canvas,
        center: center,
        eyeY: eyeY,
        gap: unit * 14,
        baseW: unit * 15,
        baseH: unit * 18,
        unit: unit,
        look: look,
        emotion: emotion,
        talk: talk,
        smirk: smirk,
        reaction: reaction,
        cyclops: false,
        showMouth: showMouth,
        mouthOpacity: mouthOpacity,
        profileContext: profileContext,
        facialLineColor: facialLineColor,
      );
      return;
    }

    final eyes = cyclops ? 1 : (three ? 3 : 2);
    final eyeSlots = <({int index, double direction})>[
      for (var i = 0; i < eyes; i++)
        (
          index: i,
          direction: eyes == 1 ? 0.0 : (i == 0 ? -1.0 : (i == 1 ? 1.0 : 0.0)),
        ),
    ];
    if (profileContext != null) {
      // Body-surface painter order: far authored socket first, center traits,
      // then the near socket. The same order mirrors with the yaw sign, so a
      // near eye can never be overpainted by its receding partner.
      eyeSlots.sort((a, b) {
        int rank(double direction) => profileContext.isFar(direction)
            ? 0
            : profileContext.isNear(direction)
            ? 2
            : 1;
        return rank(a.direction).compareTo(rank(b.direction));
      });
    }
    for (final slot in eyeSlots) {
      final i = slot.index;
      final dir = slot.direction;
      // The smaller middle socket stays in the face, beneath the headwear.
      final canonicalEyeCenter = i == 2
          ? Offset(center.dx, eyeY - unit * 8)
          : Offset(center.dx + dir * gap, eyeY + (three ? unit * 4 : 0));
      var eyeCenter = canonicalEyeCenter;
      ({double centerX, double localScaleX})? eyeTransform;
      if (profileContext != null) {
        eyeTransform = profileContext.transformFor(
          canonicalX: canonicalEyeCenter.dx,
          unit: unit,
          direction: dir,
          canonicalHalfWidth: _profileEyeSlotHalfWidth(
            look: look,
            direction: dir,
            eyeW: baseW,
            unit: unit,
          ),
          surfaceY: canonicalEyeCenter.dy,
        );
        eyeCenter = Offset(eyeTransform.centerX, canonicalEyeCenter.dy);
      }
      if (eyeTransform != null) {
        canvas.save();
        canvas.translate(eyeCenter.dx, eyeCenter.dy);
        canvas.scale(eyeTransform.localScaleX, 1);
        canvas.translate(-eyeCenter.dx, -eyeCenter.dy);
      }
      final winking = look.eyes == SlopEyes.wink && i == 1;
      final lidded = look.eyes == SlopEyes.sleepy
          ? 0.42
          : (emotion == SlopEmotion.proud ? 0.2 : 0.0);
      final closed = look.eyes == SlopEyes.kawaii
          ? 1.0
          : (winking ? math.max(blink, _winkClosure(phase)) : blink);

      // A dot eye is just a bead — no white, no highlight geometry.
      if (look.eyes == SlopEyes.dot) {
        final r = baseW * 0.30 * (1 - blink * 0.85);
        final pupil = eyeCenter.translate(gazeX * 0.5, gazeY * 0.5);
        canvas.drawCircle(pupil, r, Paint()..color = pupilDeep);
        canvas.drawCircle(pupil, r * 0.82, Paint()..color = pupilColor);
        canvas.drawCircle(
          eyeCenter.translate(gazeX * 0.5 - r * 0.3, gazeY * 0.5 - r * 0.35),
          r * 0.3,
          Paint()..color = Colors.white.withValues(alpha: 0.85),
        );
        if (eyeTransform != null) canvas.restore();
        continue;
      }

      if (closed > 0.92) {
        // A closed eye is a happy arc, not a flat line — it keeps the warmth.
        final closedRect = Rect.fromCenter(
          center: eyeCenter,
          width: baseW * 1.05,
          height: baseH * 0.5,
        );
        canvas.drawArc(
          closedRect,
          math.pi,
          math.pi,
          false,
          Paint()
            ..color = lineInk
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 2.4
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawArc(
          closedRect,
          math.pi,
          math.pi,
          false,
          Paint()
            ..color = pupilColor
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.3
            ..strokeCap = StrokeCap.round,
        );
        if (look.eyes == SlopEyes.velvetLash) {
          _paintVelvetLashes(
            canvas,
            eyeRect: closedRect,
            outward: dir,
            ink: lineInk,
            unit: unit,
            closed: true,
          );
        }
        if (eyeTransform != null) canvas.restore();
        continue;
      }

      final h = baseH * (1 - closed) * (1 - lidded * 0.55);
      final eyeRect = Rect.fromCenter(
        center: eyeCenter,
        width: baseW,
        height: h,
      );

      // Lids CUT the eye rather than being painted over it. Painting a flat
      // palette colour on top can never match the body, which is a five-stop
      // gradient — that mismatch is what read as broken layering on sleepy and
      // angry eyes. Removing the covered part lets the real body show through.
      final inner = dir <= 0 ? eyeRect.left : eyeRect.right;
      final outer = dir <= 0 ? eyeRect.right : eyeRect.left;
      var eyeShape = Path()..addOval(eyeRect);
      if (lidded > 0) {
        eyeShape = Path.combine(
          PathOperation.difference,
          eyeShape,
          Path()..addRect(
            Rect.fromLTRB(
              eyeRect.left - unit,
              eyeRect.top - unit,
              eyeRect.right + unit,
              eyeRect.top + h * lidded,
            ),
          ),
        );
      }
      if (look.eyes == SlopEyes.angry) {
        eyeShape = Path.combine(
          PathOperation.difference,
          eyeShape,
          Path()
            ..moveTo(inner, eyeRect.top - unit)
            ..lineTo(outer, eyeRect.top - unit)
            ..lineTo(outer, eyeRect.top + h * 0.16)
            ..lineTo(inner, eyeRect.top + h * 0.62)
            ..close(),
        );
      }

      // The eye socket uses the same heavy ink language as the body rim. This
      // makes the cyclops readable as *the* Slop face instead of a generic
      // anime eye floating on a gradient.
      canvas.drawOval(
        eyeRect.inflate(unit * (cyclops ? 1.7 : 1.25)),
        Paint()..color = palette.ink.withValues(alpha: 0.84),
      );
      canvas.save();
      canvas.clipPath(eyeShape);
      canvas.drawOval(eyeRect, sclera);

      final pupilCenter = eyeCenter.translate(gazeX, gazeY * (1 - closed));
      final pupilW = baseW * (cyclops ? 0.52 : 0.58);
      final pupilH = h * 0.66;

      if (look.eyes == SlopEyes.star) {
        final star = _star(pupilCenter, pupilW * 0.92);
        canvas.save();
        canvas.clipPath(star);
        canvas.drawPath(star, Paint()..color = pupilColor);
        canvas.drawPath(
          star,
          Paint()
            ..color = pupilDeep
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.35
            ..strokeJoin = StrokeJoin.round,
        );
        canvas.restore();
      } else if (look.eyes == SlopEyes.spiral) {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        final spiral = Path();
        for (var k = 0; k <= 70; k++) {
          final f = k / 70;
          final ang = f * math.pi * 5 + phase * math.pi * 2;
          final rad = f * pupilW * 1.15;
          final pt =
              pupilCenter + Offset(math.cos(ang) * rad, math.sin(ang) * rad);
          k == 0 ? spiral.moveTo(pt.dx, pt.dy) : spiral.lineTo(pt.dx, pt.dy);
        }
        canvas.drawPath(
          spiral,
          Paint()
            ..color = pupilDeep
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.9
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawPath(
          spiral,
          Paint()
            ..color = pupilColor
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.05
            ..strokeCap = StrokeCap.round,
        );
        canvas.restore();
      } else if (look.eyes == SlopEyes.heart) {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        final heart = _heart(pupilCenter, pupilW * 1.05);
        canvas.save();
        canvas.clipPath(heart);
        canvas.drawPath(heart, Paint()..color = pupilColor);
        canvas.drawPath(
          heart,
          Paint()
            ..color = pupilDeep
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.35
            ..strokeJoin = StrokeJoin.round,
        );
        canvas.restore();
        canvas.restore();
      } else if (look.eyes == SlopEyes.liquid) {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        // The iris is a single elastic droplet. Its bottom mass lags the idle
        // cycle while the top remains anchored, so it reads as liquid inside
        // the eye rather than a rigid teardrop icon sliding around.
        final lag = math.sin(phase * math.pi * 2 + i * 1.8) * pupilW * 0.10;
        final top = pupilCenter.translate(-lag * 0.20, -pupilH * 0.51);
        final bottom = pupilCenter.translate(lag, pupilH * 0.55);
        final drop = Path()
          ..moveTo(top.dx, top.dy)
          ..cubicTo(
            pupilCenter.dx + pupilW * 0.48,
            pupilCenter.dy - pupilH * 0.30,
            pupilCenter.dx + pupilW * 0.54,
            pupilCenter.dy + pupilH * 0.28,
            bottom.dx,
            bottom.dy,
          )
          ..cubicTo(
            pupilCenter.dx - pupilW * 0.54,
            pupilCenter.dy + pupilH * 0.29,
            pupilCenter.dx - pupilW * 0.48,
            pupilCenter.dy - pupilH * 0.30,
            top.dx,
            top.dy,
          )
          ..close();
        canvas.drawPath(
          drop,
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.36, -0.42),
              colors: [
                Color.lerp(pupilColor, Colors.white, 0.58)!,
                pupilColor,
                Color.lerp(pupilColor, Colors.black, 0.62)!,
              ],
              stops: const [0, 0.52, 1],
            ).createShader(drop.getBounds()),
        );
        canvas.drawOval(
          Rect.fromCenter(
            center: pupilCenter.translate(lag * 0.34, pupilH * 0.10),
            width: pupilW * 0.42,
            height: pupilH * 0.36,
          ),
          Paint()..color = Color.lerp(pupilColor, Colors.black, 0.68)!,
        );
        canvas.drawPath(
          drop,
          Paint()
            ..color = Color.lerp(pupilColor, Colors.black, 0.32)!
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.85,
        );
        canvas.restore();
      } else if (look.eyes == SlopEyes.crescent) {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        final outer = Rect.fromCenter(
          center: pupilCenter,
          width: pupilW * 1.02,
          height: pupilH * 1.06,
        );
        final mirror = i.isEven ? 1.0 : -1.0;
        final phaseDrift = math.sin(phase * math.pi * 2 + i) * unit * 0.32;
        final cutout = Rect.fromCenter(
          center: outer.center.translate(
            mirror * outer.width * 0.30 + phaseDrift,
            -outer.height * 0.08,
          ),
          width: outer.width * 0.86,
          height: outer.height * 0.90,
        );
        final crescent = Path.combine(
          PathOperation.difference,
          Path()..addOval(outer),
          Path()..addOval(cutout),
        );
        canvas.drawPath(
          crescent,
          Paint()
            ..color = pupilColor.withValues(alpha: 0.28)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.7),
        );
        canvas.drawPath(
          crescent,
          Paint()
            ..shader = LinearGradient(
              begin: mirror > 0 ? Alignment.centerLeft : Alignment.centerRight,
              end: mirror > 0 ? Alignment.centerRight : Alignment.centerLeft,
              colors: [
                Color.lerp(pupilColor, Colors.white, 0.54)!,
                pupilColor,
                Color.lerp(pupilColor, Colors.black, 0.36)!,
              ],
            ).createShader(outer),
        );
        _sparkle(
          canvas,
          pupilCenter.translate(-mirror * pupilW * 0.26, -pupilH * 0.27),
          unit * 1.25,
          Paint()..color = Colors.white.withValues(alpha: 0.86),
        );
        canvas.restore();
      } else if (look.eyes == SlopEyes.orbit) {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        final planetRadius = math.min(pupilW, pupilH) * 0.43;
        final planetBounds = Rect.fromCircle(
          center: pupilCenter,
          radius: planetRadius,
        );
        canvas.drawCircle(
          pupilCenter,
          planetRadius * 1.18,
          Paint()
            ..color = pupilColor.withValues(alpha: 0.22)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.8),
        );
        canvas.drawCircle(
          pupilCenter,
          planetRadius,
          Paint()
            ..shader = RadialGradient(
              center: Alignment(-0.40, -0.45),
              colors: [pupilLight, pupilColor, pupilDeep, Colors.black],
              stops: [0, 0.34, 0.72, 1],
            ).createShader(planetBounds),
        );
        canvas.save();
        canvas.translate(pupilCenter.dx, pupilCenter.dy);
        canvas.rotate((i.isEven ? -1 : 1) * 0.42);
        final ring = Rect.fromCenter(
          center: Offset.zero,
          width: planetRadius * 2.75,
          height: planetRadius * 0.82,
        );
        canvas.drawOval(
          ring,
          Paint()
            ..color = pupilLight.withValues(alpha: 0.92)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.05
            ..strokeCap = StrokeCap.round,
        );
        canvas.restore();
        canvas.drawCircle(
          pupilCenter.translate(planetRadius * 1.14, -planetRadius * 0.76),
          unit * 0.82,
          Paint()..color = pupilColor,
        );
        canvas.restore();
      } else {
        canvas.save();
        canvas.clipPath(Path()..addOval(eyeRect));
        // A graphic glass-bead iris: enough depth to feel alive, simplified
        // enough to reproduce in an icon, plush, sticker, or outdoor mark.
        final irisRect = Rect.fromCenter(
          center: pupilCenter,
          width: pupilW,
          height: pupilH,
        );
        canvas.drawOval(
          irisRect,
          Paint()
            ..shader = RadialGradient(
              center: const Alignment(-0.28, -0.34),
              radius: 0.82,
              colors: [
                Color.lerp(pupilColor, Colors.white, 0.44)!,
                pupilColor,
                Color.lerp(pupilColor, Colors.black, 0.58)!,
              ],
              stops: const [0, 0.52, 1],
            ).createShader(irisRect),
        );
        canvas.drawOval(
          irisRect,
          Paint()
            ..color = Color.lerp(pupilColor, Colors.black, 0.45)!
            ..style = PaintingStyle.stroke
            ..strokeWidth = pupilW * 0.10,
        );
        canvas.drawOval(
          Rect.fromCenter(
            center: pupilCenter,
            width: pupilW * 0.52,
            height: pupilH * 0.52,
          ),
          Paint()..color = Color.lerp(pupilColor, Colors.black, 0.72)!,
        );
        canvas.restore();
      }

      // A soft shadow cast by the upper lid, inside the eye. Cheap, and it is
      // most of the difference between a sticker and something with a socket.
      canvas.save();
      canvas.clipPath(Path()..addOval(eyeRect));
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(eyeCenter.dx, eyeRect.top),
          width: eyeRect.width * 1.1,
          height: eyeRect.height * 0.42,
        ),
        Paint()
          ..color = Colors.black.withValues(alpha: 0.16)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.4),
      );
      canvas.restore();

      // Two highlights: a big one for wetness, a small one for life. Crescent
      // eyes own a deliberately sparse sparkle, so generic glints would sit in
      // their negative space and make the cutout look accidental.
      if (look.eyes != SlopEyes.crescent) {
        canvas.drawCircle(
          pupilCenter.translate(-pupilW * 0.24, -pupilH * 0.26),
          unit * (cyclops ? 3.4 : 2.1) * (1 - closed),
          Paint()..color = Colors.white.withValues(alpha: 0.96),
        );
        canvas.drawCircle(
          pupilCenter.translate(pupilW * 0.2, pupilH * 0.24),
          unit * (cyclops ? 1.6 : 1.0) * (1 - closed),
          Paint()..color = Colors.white.withValues(alpha: 0.7),
        );
      }

      if (look.eyes == SlopEyes.sparkle) {
        for (final o in const [(0.34, 0.30, 0.16), (-0.36, 0.34, 0.13)]) {
          canvas.drawCircle(
            pupilCenter.translate(pupilW * o.$1, pupilH * o.$2),
            pupilW * o.$3 * (1 - closed),
            Paint()..color = Colors.white.withValues(alpha: 0.85),
          );
        }
      }
      canvas.restore();

      // Lash lines sit ON the cut edge, so the lid reads as an eyelid rather
      // than as a shape floating above the eye.
      if (look.eyes == SlopEyes.angry) {
        canvas.drawLine(
          Offset(inner, eyeRect.top + h * 0.62),
          Offset(outer, eyeRect.top + h * 0.16),
          Paint()
            ..color = lineInk
            ..strokeWidth = unit * 2
            ..strokeCap = StrokeCap.round,
        );
      }
      if (lidded > 0) {
        canvas.drawLine(
          Offset(eyeRect.left, eyeRect.top + h * lidded),
          Offset(eyeRect.right, eyeRect.top + h * lidded),
          Paint()
            ..color = lineInk.withValues(alpha: 0.7)
            ..strokeWidth = unit * 1.4
            ..strokeCap = StrokeCap.round,
        );
      }
      if (look.eyes == SlopEyes.velvetLash) {
        _paintVelvetLashes(
          canvas,
          eyeRect: eyeRect,
          outward: dir,
          ink: lineInk,
          unit: unit,
        );
      }
      if (eyeTransform != null) canvas.restore();
    }

    _paintBrowsAndRest(
      canvas,
      center: center,
      eyeY: eyeY,
      gap: gap,
      baseW: baseW,
      baseH: baseH,
      unit: unit,
      look: look,
      emotion: emotion,
      talk: talk,
      smirk: smirk,
      reaction: reaction,
      cyclops: cyclops,
      showMouth: showMouth,
      mouthOpacity: mouthOpacity,
      profileContext: profileContext,
      facialLineColor: facialLineColor,
    );
  }

  static void _paintVelvetLashes(
    Canvas canvas, {
    required Rect eyeRect,
    required double outward,
    required Color ink,
    required double unit,
    bool closed = false,
  }) {
    final lashPaint = Paint()
      ..color = ink.withValues(alpha: 0.92)
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * (closed ? 1.45 : 1.25)
      ..strokeCap = StrokeCap.round;
    if (!closed) {
      canvas.drawArc(
        eyeRect.inflate(unit * 0.45),
        math.pi * 1.08,
        math.pi * 0.84,
        false,
        Paint()
          ..color = ink.withValues(alpha: 0.88)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 1.7
          ..strokeCap = StrokeCap.round,
      );
    }
    final outerX = outward < 0 ? eyeRect.left : eyeRect.right;
    for (var lash = 0; lash < 3; lash++) {
      final inset = unit * (1.4 + lash * 2.0);
      final root = Offset(
        outerX - outward * inset,
        eyeRect.top + eyeRect.height * (0.30 - lash * 0.055),
      );
      final length = unit * (4.7 - lash * 0.7);
      canvas.drawLine(
        root,
        root.translate(outward * length, -unit * (3.7 - lash * 0.75)),
        lashPaint,
      );
    }
  }

  /// Brows, blush and mouth. Split out so eye styles that replace the eyes
  /// entirely (the visor) still get the rest of the face.
  static void _paintBrowsAndRest(
    Canvas canvas, {
    required Offset center,
    required double eyeY,
    required double gap,
    required double baseW,
    required double baseH,
    required double unit,
    required SlopLook look,
    required SlopEmotion emotion,
    required double talk,
    double smirk = 0,
    required double reaction,
    required bool cyclops,
    required bool showMouth,
    required double mouthOpacity,
    _SlopProfileFaceContext? profileContext,
    Color? facialLineColor,
  }) {
    final palette = look.palette;
    final lineInk = facialLineColor ?? palette.ink;
    // Brows are punctuation, not another facial feature. Eye families that
    // already express themselves through their lids do not get a second set
    // of heavy lines fighting for the same space.
    final brow = Paint()
      ..color = lineInk.withValues(alpha: 0.78)
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 1.4
      ..strokeCap = StrokeCap.round;
    const lidLedEyes = {
      SlopEyes.sleepy,
      SlopEyes.kawaii,
      SlopEyes.angry,
      SlopEyes.visor,
      SlopEyes.squint,
      SlopEyes.many,
      SlopEyes.three,
    };
    if (!lidLedEyes.contains(look.eyes)) {
      final browY = eyeY - baseH * 0.94;
      if (profileContext == null && cyclops) {
        // A Cyclops has one eye and therefore one brow. The old two-brow math
        // stacked both marks at the same center, creating an accidental X.
        switch (emotion) {
          case SlopEmotion.happy:
          case SlopEmotion.curious:
          case SlopEmotion.excited:
            canvas.drawArc(
              Rect.fromCenter(
                center: Offset(center.dx, browY),
                width: unit * 12,
                height: unit * 5.5,
              ),
              math.pi,
              math.pi,
              false,
              brow,
            );
          case SlopEmotion.proud:
            canvas.drawLine(
              Offset(center.dx - unit * 5.5, browY + unit),
              Offset(center.dx + unit * 5.5, browY - unit * 0.7),
              brow,
            );
          case SlopEmotion.thinking:
            canvas.drawLine(
              Offset(center.dx - unit * 5.5, browY - unit * 0.7),
              Offset(center.dx + unit * 5.5, browY + unit),
              brow,
            );
        }
      } else if (profileContext == null) {
        const halfWidth = 4.4;
        switch (emotion) {
          case SlopEmotion.happy:
          case SlopEmotion.curious:
            canvas.drawLine(
              Offset(center.dx - gap - unit * halfWidth, browY + unit * 0.5),
              Offset(center.dx - gap + unit * halfWidth, browY + unit),
              brow,
            );
            canvas.drawArc(
              Rect.fromCenter(
                center: Offset(center.dx + gap, browY - unit * 0.4),
                width: unit * 9,
                height: unit * 4.5,
              ),
              math.pi,
              math.pi,
              false,
              brow,
            );
          case SlopEmotion.proud:
            canvas.drawLine(
              Offset(center.dx - gap - unit * halfWidth, browY + unit),
              Offset(center.dx - gap + unit * halfWidth, browY),
              brow,
            );
            canvas.drawLine(
              Offset(center.dx + gap - unit * halfWidth, browY),
              Offset(center.dx + gap + unit * halfWidth, browY + unit),
              brow,
            );
          case SlopEmotion.thinking:
            canvas.drawLine(
              Offset(center.dx - gap - unit * halfWidth, browY),
              Offset(center.dx - gap + unit * halfWidth, browY + unit * 1.2),
              brow,
            );
            canvas.drawLine(
              Offset(center.dx + gap - unit * halfWidth, browY + unit * 1.2),
              Offset(center.dx + gap + unit * halfWidth, browY - unit * 0.3),
              brow,
            );
          case SlopEmotion.excited:
            for (final dir in [-1.0, 1.0]) {
              canvas.drawArc(
                Rect.fromCenter(
                  center: Offset(center.dx + dir * gap, browY),
                  width: unit * 9,
                  height: unit * 5,
                ),
                math.pi,
                math.pi,
                false,
                brow,
              );
            }
        }
      } else {
        const halfWidth = 4.4;
        final browSlots = cyclops
            ? const <double>[0]
            : <double>[
                profileContext.farDirection,
                profileContext.nearDirection,
              ];
        for (final dir in browSlots) {
          final authoredX = center.dx + dir * gap;
          final transform = profileContext.transformFor(
            canonicalX: authoredX,
            unit: unit,
            direction: dir,
            canonicalHalfWidth: _profileEyeSlotHalfWidth(
              look: look,
              direction: dir,
              eyeW: baseW,
              unit: unit,
            ),
            surfaceY: eyeY,
          );
          final x = transform.centerX;
          canvas.save();
          canvas.translate(x, browY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -browY);
          switch (emotion) {
            case SlopEmotion.happy:
            case SlopEmotion.curious:
              if (cyclops || dir > 0) {
                canvas.drawArc(
                  Rect.fromCenter(
                    center: Offset(x, browY - (cyclops ? 0 : unit * 0.4)),
                    width: unit * (cyclops ? 12 : 9),
                    height: unit * (cyclops ? 5.5 : 4.5),
                  ),
                  math.pi,
                  math.pi,
                  false,
                  brow,
                );
              } else {
                canvas.drawLine(
                  Offset(x - unit * halfWidth, browY + unit * 0.5),
                  Offset(x + unit * halfWidth, browY + unit),
                  brow,
                );
              }
            case SlopEmotion.proud:
              if (cyclops) {
                canvas.drawLine(
                  Offset(x - unit * 5.5, browY + unit),
                  Offset(x + unit * 5.5, browY - unit * 0.7),
                  brow,
                );
              } else {
                canvas.drawLine(
                  Offset(x - unit * halfWidth, browY + (dir < 0 ? unit : 0)),
                  Offset(x + unit * halfWidth, browY + (dir > 0 ? unit : 0)),
                  brow,
                );
              }
            case SlopEmotion.thinking:
              if (cyclops) {
                canvas.drawLine(
                  Offset(x - unit * 5.5, browY - unit * 0.7),
                  Offset(x + unit * 5.5, browY + unit),
                  brow,
                );
              } else {
                canvas.drawLine(
                  Offset(
                    x - unit * halfWidth,
                    browY + (dir > 0 ? unit * 1.2 : 0),
                  ),
                  Offset(
                    x + unit * halfWidth,
                    browY + (dir < 0 ? unit * 1.2 : 0),
                  ),
                  brow,
                );
              }
            case SlopEmotion.excited:
              canvas.drawArc(
                Rect.fromCenter(
                  center: Offset(x, browY),
                  width: unit * (cyclops ? 12 : 9),
                  height: unit * (cyclops ? 5.5 : 5),
                ),
                math.pi,
                math.pi,
                false,
                brow,
              );
          }
          canvas.restore();
        }
      }
    }

    if (look.blush) {
      final blushPaint = Paint()
        ..color = slopMaterialCheekColorFor(look).withValues(alpha: 0.42)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 2);
      final blushSlots = profileContext == null
          ? const <double>[-1, 1]
          : <double>[profileContext.farDirection, profileContext.nearDirection];
      for (final dir in blushSlots) {
        final authoredX = center.dx + dir * unit * (cyclops ? 24 : 25);
        final blushY = eyeY + baseH * 0.62;
        final transform = profileContext?.transformFor(
          canonicalX: authoredX,
          unit: unit,
          direction: dir,
          canonicalHalfWidth: unit * 5.5,
          surfaceY: blushY,
        );
        final x = transform?.centerX ?? authoredX;
        if (transform != null) {
          canvas.save();
          canvas.translate(x, blushY);
          canvas.scale(transform.localScaleX, 1);
          canvas.translate(-x, -blushY);
        }
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(x, blushY),
            width: unit * 11,
            height: unit * 6,
          ),
          blushPaint,
        );
        if (transform != null) canvas.restore();
      }
    }

    final mouthMetrics = slopRestingMouthMetricsFor(look.body);
    if (profileContext == null) {
      final mouthCenter = Offset(center.dx, eyeY + unit * mouthMetrics.offsetY);
      if (look.accessory != SlopAccessory.none) {
        _paintAccessory(
          canvas,
          center: center,
          eyeY: eyeY,
          mouthCenter: mouthCenter,
          gap: gap,
          eyeW: baseW,
          eyeH: baseH,
          unit: unit,
          look: look,
        );
      }
      if (showMouth) {
        final effectiveMouthOpacity = mouthOpacity.clamp(0.0, 1.0);
        if (effectiveMouthOpacity <= 0.001) return;
        if (effectiveMouthOpacity < 0.999) {
          canvas.saveLayer(
            Rect.fromCenter(
              center: mouthCenter,
              width: unit * 46,
              height: unit * 36,
            ),
            Paint()
              ..color = Colors.white.withValues(alpha: effectiveMouthOpacity),
          );
        }
        _paintMouth(
          canvas,
          center: mouthCenter,
          unit: unit,
          look: look,
          emotion: emotion,
          talk: talk,
          smirk: smirk,
          reaction: reaction,
          facialLineColor: facialLineColor,
        );
        if (effectiveMouthOpacity < 0.999) canvas.restore();
      }
      return;
    }
    final canonicalMouthCenter = Offset(
      center.dx,
      eyeY + unit * mouthMetrics.offsetY,
    );
    final mouthTransform = profileContext.transformFor(
      canonicalX: canonicalMouthCenter.dx,
      unit: unit,
      direction: 0,
      canonicalHalfWidth: unit * mouthMetrics.maxWidth * 0.5,
      surfaceY: canonicalMouthCenter.dy,
    );
    final mouthCenter = Offset(mouthTransform.centerX, canonicalMouthCenter.dy);

    if (look.accessory != SlopAccessory.none) {
      final paired = switch (look.accessory) {
        SlopAccessory.glasses ||
        SlopAccessory.shades ||
        SlopAccessory.freckles ||
        SlopAccessory.mask => true,
        _ => false,
      };
      if (paired) {
        _paintProfilePairedAccessory(
          canvas,
          center: center,
          eyeY: eyeY,
          gap: gap,
          eyeW: baseW,
          eyeH: baseH,
          unit: unit,
          look: look,
          profileContext: profileContext,
        );
      } else {
        final authoredDirection = switch (look.accessory) {
          SlopAccessory.monocle || SlopAccessory.sticker => 1.0,
          SlopAccessory.bandage ||
          SlopAccessory.eyepatch ||
          SlopAccessory.tear => -1.0,
          _ => 0.0,
        };
        final eyeBound = authoredDirection != 0;
        final mouthBound = look.accessory == SlopAccessory.mustache;
        final canonicalAnchorX = eyeBound
            ? center.dx + authoredDirection * gap
            : mouthBound
            ? canonicalMouthCenter.dx
            : center.dx;
        final accessoryHalfWidth = mouthBound
            ? unit * 16
            : _profileEyeSlotHalfWidth(
                look: look,
                direction: authoredDirection,
                eyeW: baseW,
                unit: unit,
              );
        final accessoryTransform = mouthBound
            ? mouthTransform
            : profileContext.transformFor(
                canonicalX: canonicalAnchorX,
                unit: unit,
                direction: authoredDirection,
                canonicalHalfWidth: accessoryHalfWidth,
                surfaceY: eyeY,
                targetScaleX: eyeBound ? 0.82 : 0.72,
              );
        final accessoryDelta = accessoryTransform.centerX - canonicalAnchorX;
        final accessoryPivotY = mouthBound ? canonicalMouthCenter.dy : eyeY;
        canvas.save();
        canvas.translate(accessoryTransform.centerX, accessoryPivotY);
        canvas.scale(accessoryTransform.localScaleX, 1);
        canvas.translate(-accessoryTransform.centerX, -accessoryPivotY);
        _paintAccessory(
          canvas,
          center: center.translate(accessoryDelta, 0),
          eyeY: eyeY,
          mouthCenter: canonicalMouthCenter.translate(accessoryDelta, 0),
          gap: gap,
          eyeW: baseW,
          eyeH: baseH,
          unit: unit,
          look: look,
        );
        canvas.restore();
      }
    }

    if (showMouth) {
      final effectiveMouthOpacity = mouthOpacity.clamp(0.0, 1.0);
      if (effectiveMouthOpacity <= 0.001) return;
      canvas.save();
      canvas.translate(mouthCenter.dx, mouthCenter.dy);
      canvas.scale(mouthTransform.localScaleX, 1);
      canvas.translate(-mouthCenter.dx, -mouthCenter.dy);
      if (effectiveMouthOpacity < 0.999) {
        canvas.saveLayer(
          Rect.fromCenter(
            center: mouthCenter,
            width: unit * 46,
            height: unit * 36,
          ),
          Paint()
            ..color = Colors.white.withValues(alpha: effectiveMouthOpacity),
        );
      }
      _paintMouth(
        canvas,
        center: mouthCenter,
        unit: unit,
        look: look,
        emotion: emotion,
        talk: talk,
        smirk: smirk,
        reaction: reaction,
        facialLineColor: facialLineColor,
      );
      if (effectiveMouthOpacity < 0.999) canvas.restore();
      canvas.restore();
    }
  }

  static void _paintMouth(
    Canvas canvas, {
    required Offset center,
    required double unit,
    required SlopLook look,
    required SlopEmotion emotion,
    required double talk,
    double smirk = 0,
    required double reaction,
    Color? facialLineColor,
  }) {
    final palette = look.palette;
    final lineInk = facialLineColor ?? palette.ink;
    final stroke = Paint()
      ..color = lineInk
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 2.7
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    // Open cavities need the same material-aware contrast as one-line mouths.
    // Keep them deeper than the linework so the tongue/teeth retain dimension.
    final fill = Paint()
      ..color = look.finish == SlopFinish.clearGlass
          ? const Color(0xFF087FA8)
          : look.pattern == SlopPattern.slopCode
          ? const Color(0xFF14723C)
          : palette.ink;
    final tongueFill = Paint()..color = const Color(0xFFFF759A);
    final tongueLine = Paint()
      ..color = const Color(0xFFD94B78)
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 0.9
      ..strokeCap = StrokeCap.round;

    // Every expression lives in the same small facial box. Talking may open
    // that box, but it never changes the mouth's anchor or makes it jump down.
    final open =
        (talk * 0.9 +
                (emotion == SlopEmotion.excited ? 0.6 : 0) +
                reaction * 0.5)
            .clamp(0.0, 1.0);
    final metrics = slopRestingMouthMetricsFor(look.body);
    final w = unit * metrics.maxWidth;

    if (look.pattern == SlopPattern.itCouldBeWorseRobot) {
      // The source face is defined by a deep inverted arch, not a tiny seam.
      // Its legs land at the bottom of the robot's face while the crown rises
      // between the large eye sockets, matching the fitted headgear reward.
      final bottom = center.dy + unit * metrics.maxHeight * .58;
      final top = center.dy - unit * metrics.maxHeight * .68;
      canvas.drawPath(
        Path()
          ..moveTo(center.dx - w * .62, bottom)
          ..cubicTo(
            center.dx - w * .58,
            top,
            center.dx + w * .58,
            top,
            center.dx + w * .62,
            bottom,
          ),
        stroke..strokeWidth = unit * 2.8,
      );
      return;
    }

    RRect cavityRect({double width = 1, double height = 10, double dy = 0}) {
      final rect = Rect.fromCenter(
        center: center.translate(0, unit * dy),
        width: w * width,
        height: unit * math.min(height, metrics.maxHeight),
      );
      return RRect.fromRectAndRadius(
        rect,
        Radius.circular(math.min(rect.height * 0.48, unit * 5.5)),
      );
    }

    void drawInnerTongue(RRect cavity, {double x = 0}) {
      canvas.save();
      canvas.clipRRect(cavity);
      final tongue = Rect.fromCenter(
        center: Offset(
          cavity.center.dx + unit * x,
          cavity.bottom - cavity.height * 0.03,
        ),
        width: cavity.width * 0.58,
        height: cavity.height * 0.62,
      );
      canvas.drawOval(tongue, tongueFill);
      canvas.drawLine(
        Offset(tongue.center.dx, tongue.center.dy + tongue.height * 0.12),
        Offset(tongue.center.dx, tongue.bottom),
        tongueLine,
      );
      canvas.restore();
    }

    void drawCavity(RRect cavity, {bool tongue = false, bool teeth = false}) {
      canvas.drawRRect(cavity, fill);
      if (teeth) {
        canvas.save();
        canvas.clipRRect(cavity);
        final bandHeight = cavity.height * 0.36;
        canvas.drawRect(
          Rect.fromLTWH(cavity.left, cavity.top, cavity.width, bandHeight),
          Paint()..color = const Color(0xFFFFFDF8),
        );
        for (var i = 1; i < 5; i++) {
          final x = cavity.left + cavity.width * i / 5;
          canvas.drawLine(
            Offset(x, cavity.top),
            Offset(x, cavity.top + bandHeight),
            Paint()
              ..color = palette.ink.withValues(alpha: 0.28)
              ..strokeWidth = unit * 0.55,
          );
        }
        canvas.restore();
      }
      if (tongue) drawInnerTongue(cavity);
      // A tiny top glint gives every open mouth the same soft, inset edge.
      canvas.drawArc(
        cavity.outerRect.deflate(unit * 0.7),
        math.pi * 1.08,
        math.pi * 0.84,
        false,
        Paint()
          ..color = palette.light.withValues(alpha: 0.16)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.75
          ..strokeCap = StrokeCap.round,
      );
    }

    const keepsShape = {
      SlopMouth.cat,
      SlopMouth.wavy,
      SlopMouth.tongueOut,
      SlopMouth.gasp,
      SlopMouth.jellyBean,
      SlopMouth.nibble,
      SlopMouth.gooberBite,
    };
    if (open > 0.14 && !keepsShape.contains(look.mouth)) {
      final mouth = cavityRect(
        width: 0.78 + open * 0.18,
        height: 5 + open * 9,
        dy: 0.8,
      );
      drawCavity(mouth, tongue: open > 0.48);
      return;
    }

    switch (look.mouth) {
      case SlopMouth.smile:
        final lift = smirk.isFinite ? smirk.clamp(0.0, 1.0) : 0.0;
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.42, center.dy - unit * 1.2)
            ..quadraticBezierTo(
              center.dx,
              center.dy + unit * 4.8,
              center.dx + w * 0.42,
              center.dy - unit * (1.2 + lift * 3.2),
            ),
          stroke,
        );
      case SlopMouth.glossySmile:
        final lip = Path()
          ..moveTo(center.dx - w * 0.40, center.dy - unit * 0.5)
          ..quadraticBezierTo(
            center.dx,
            center.dy + unit * 5.4,
            center.dx + w * 0.40,
            center.dy - unit * 0.5,
          )
          ..quadraticBezierTo(
            center.dx,
            center.dy + unit * 1.35,
            center.dx - w * 0.40,
            center.dy - unit * 0.5,
          )
          ..close();
        canvas.drawPath(
          lip,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFF9FBA), Color(0xFFE75888), Color(0xFFB92E65)],
            ).createShader(lip.getBounds()),
        );
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.40, center.dy - unit * 0.5)
            ..quadraticBezierTo(
              center.dx,
              center.dy + unit * 1.9,
              center.dx + w * 0.40,
              center.dy - unit * 0.5,
            ),
          Paint()
            ..color = lineInk.withValues(alpha: 0.92)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.8
            ..strokeCap = StrokeCap.round,
        );
        canvas.drawPath(
          Path()
            ..moveTo(center.dx + w * 0.04, center.dy + unit * 2.8)
            ..quadraticBezierTo(
              center.dx + w * 0.18,
              center.dy + unit * 3.3,
              center.dx + w * 0.29,
              center.dy + unit * 1.7,
            ),
          Paint()
            ..color = Colors.white.withValues(alpha: 0.55)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.85
            ..strokeCap = StrokeCap.round,
        );
      case SlopMouth.grin:
        drawCavity(
          cavityRect(width: 0.96, height: 10.5, dy: 0.6),
          tongue: true,
        );
      case SlopMouth.cat:
        final p = Path()
          ..moveTo(center.dx - w * 0.40, center.dy - unit * 0.8)
          ..quadraticBezierTo(
            center.dx - w * 0.20,
            center.dy + unit * 3.8,
            center.dx,
            center.dy - unit * 0.3,
          )
          ..quadraticBezierTo(
            center.dx + w * 0.20,
            center.dy + unit * 3.8,
            center.dx + w * 0.40,
            center.dy - unit * 0.8,
          );
        canvas.drawPath(p, stroke);
      case SlopMouth.smirk:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.36, center.dy + unit * 0.5)
            ..quadraticBezierTo(
              center.dx + w * 0.08,
              center.dy + unit * 4.3,
              center.dx + w * 0.40,
              center.dy - unit * 2.1,
            ),
          stroke,
        );
      case SlopMouth.oh:
        drawCavity(cavityRect(width: 0.36, height: 10.5, dy: 0.5));
      case SlopMouth.teeth:
        drawCavity(cavityRect(width: 0.96, height: 11, dy: 0.6), teeth: true);
      case SlopMouth.kiss:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - unit * 4.2, center.dy)
            ..quadraticBezierTo(
              center.dx,
              center.dy - unit * 3.6,
              center.dx + unit * 4.2,
              center.dy,
            )
            ..quadraticBezierTo(
              center.dx,
              center.dy + unit * 4.8,
              center.dx - unit * 4.2,
              center.dy,
            )
            ..close(),
          fill,
        );
      case SlopMouth.zigzag:
        final zig = Path()..moveTo(center.dx - w * 0.36, center.dy);
        for (var i = 1; i <= 4; i++) {
          zig.lineTo(
            center.dx - w * 0.36 + w * 0.18 * i,
            center.dy + (i.isOdd ? unit * 2.8 : -unit * 1.2),
          );
        }
        canvas.drawPath(zig, stroke);
      case SlopMouth.drool:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.35, center.dy - unit)
            ..quadraticBezierTo(
              center.dx,
              center.dy + unit * 4.4,
              center.dx + w * 0.35,
              center.dy - unit,
            ),
          stroke,
        );
        // The bead begins at the lip corner, so it cannot float below it.
        canvas.drawPath(
          Path()
            ..moveTo(center.dx + w * 0.29, center.dy + unit * 0.4)
            ..quadraticBezierTo(
              center.dx + w * 0.35,
              center.dy + unit * 5.4,
              center.dx + w * 0.29,
              center.dy + unit * 7.4,
            )
            ..quadraticBezierTo(
              center.dx + w * 0.23,
              center.dy + unit * 5.2,
              center.dx + w * 0.26,
              center.dy + unit * 0.5,
            )
            ..close(),
          Paint()..color = const Color(0xFF9BE8FF).withValues(alpha: 0.85),
        );
      case SlopMouth.flat:
        canvas.drawLine(
          Offset(center.dx - w * 0.28, center.dy + unit * 0.5),
          Offset(center.dx + w * 0.28, center.dy + unit * 0.5),
          stroke,
        );
      case SlopMouth.wavy:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.36, center.dy)
            ..quadraticBezierTo(
              center.dx - w * 0.18,
              center.dy - unit * 2.6,
              center.dx,
              center.dy,
            )
            ..quadraticBezierTo(
              center.dx + w * 0.18,
              center.dy + unit * 2.6,
              center.dx + w * 0.36,
              center.dy,
            ),
          stroke,
        );
      case SlopMouth.tongueOut:
        final mouth = cavityRect(width: 0.82, height: 7.5, dy: -0.2);
        drawCavity(mouth);
        final tongueTop = mouth.center.dy - unit * 0.3;
        final tongueBottom = mouth.bottom + unit * 4.2;
        final tongue = Path()
          ..moveTo(mouth.center.dx - unit * 4.3, tongueTop)
          ..cubicTo(
            mouth.center.dx - unit * 4.5,
            tongueBottom,
            mouth.center.dx - unit * 2.5,
            tongueBottom + unit * 1.7,
            mouth.center.dx,
            tongueBottom + unit * 1.7,
          )
          ..cubicTo(
            mouth.center.dx + unit * 2.5,
            tongueBottom + unit * 1.7,
            mouth.center.dx + unit * 4.5,
            tongueBottom,
            mouth.center.dx + unit * 4.3,
            tongueTop,
          )
          ..quadraticBezierTo(
            mouth.center.dx,
            tongueTop + unit * 2.2,
            mouth.center.dx - unit * 4.3,
            tongueTop,
          )
          ..close();
        canvas.drawPath(tongue, tongueFill);
        canvas.drawLine(
          Offset(mouth.center.dx, tongueBottom - unit * 0.4),
          Offset(mouth.center.dx, tongueBottom + unit * 1.1),
          tongueLine,
        );
      case SlopMouth.gasp:
        drawCavity(cavityRect(width: 0.48, height: 14, dy: 0.6), tongue: true);
      case SlopMouth.fang:
        final mouth = cavityRect(width: 0.90, height: 8.5, dy: 0.4);
        drawCavity(mouth);
        canvas.drawPath(
          Path()
            ..moveTo(mouth.center.dx + w * 0.12, mouth.top)
            ..lineTo(mouth.center.dx + w * 0.29, mouth.top)
            ..lineTo(mouth.center.dx + w * 0.22, mouth.top + unit * 5.2)
            ..close(),
          Paint()..color = const Color(0xFFFFFDF8),
        );
      case SlopMouth.laugh:
        final mouth = cavityRect(width: 0.94, height: 14, dy: 0.8);
        drawCavity(mouth, tongue: true);
        canvas.drawArc(
          mouth.outerRect.inflate(unit * 1.2),
          math.pi * 1.12,
          math.pi * 0.76,
          false,
          stroke,
        );
      case SlopMouth.tinyFangs:
        final mouth = cavityRect(width: 0.86, height: 8.8, dy: 0.2);
        drawCavity(mouth);
        for (final x in [-0.20, 0.20]) {
          canvas.drawPath(
            Path()
              ..moveTo(mouth.center.dx + mouth.width * x - unit * 2, mouth.top)
              ..lineTo(mouth.center.dx + mouth.width * x + unit * 2, mouth.top)
              ..lineTo(
                mouth.center.dx + mouth.width * x,
                mouth.top + unit * 4.7,
              )
              ..close(),
            Paint()..color = const Color(0xFFFFFDF8),
          );
        }
      case SlopMouth.uwu:
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - w * 0.38, center.dy)
            ..quadraticBezierTo(
              center.dx - w * 0.19,
              center.dy + unit * 4.3,
              center.dx,
              center.dy,
            )
            ..quadraticBezierTo(
              center.dx + w * 0.19,
              center.dy + unit * 4.3,
              center.dx + w * 0.38,
              center.dy,
            ),
          stroke,
        );
      case SlopMouth.bubble:
        canvas.drawCircle(
          center.translate(unit * 1.5, unit * 1.2),
          unit * 6.2,
          Paint()
            ..shader =
                RadialGradient(
                  center: const Alignment(-0.38, -0.42),
                  colors: [
                    Colors.white.withValues(alpha: 0.62),
                    const Color(0xFFFF8EB1).withValues(alpha: 0.85),
                    const Color(0xFFD94B78).withValues(alpha: 0.94),
                  ],
                ).createShader(
                  Rect.fromCircle(
                    center: center.translate(unit * 1.5, unit * 1.2),
                    radius: unit * 6.2,
                  ),
                ),
        );
      case SlopMouth.jellyBean:
        // An asymmetric bean cavity stays recognizable while talking instead
        // of snapping to the generic rounded mouth. The lower pink crescent is
        // clipped inside the same path, so it reads as living inner mouth—not
        // a second sticker floating below it.
        final beanWidth = w * (0.80 + open * 0.10);
        final beanHeight = unit * math.min(8.8 + open * 5.0, metrics.maxHeight);
        final beanCenter = center.translate(unit * 0.5, unit * (0.5 + open));
        final bean = Path()
          ..moveTo(
            beanCenter.dx - beanWidth * 0.48,
            beanCenter.dy - beanHeight * 0.08,
          )
          ..cubicTo(
            beanCenter.dx - beanWidth * 0.43,
            beanCenter.dy - beanHeight * 0.60,
            beanCenter.dx + beanWidth * 0.20,
            beanCenter.dy - beanHeight * 0.56,
            beanCenter.dx + beanWidth * 0.48,
            beanCenter.dy - beanHeight * 0.12,
          )
          ..cubicTo(
            beanCenter.dx + beanWidth * 0.42,
            beanCenter.dy + beanHeight * 0.52,
            beanCenter.dx - beanWidth * 0.24,
            beanCenter.dy + beanHeight * 0.62,
            beanCenter.dx - beanWidth * 0.48,
            beanCenter.dy - beanHeight * 0.08,
          )
          ..close();
        canvas.drawPath(
          bean,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                palette.ink,
                Color.lerp(palette.ink, Colors.black, 0.48)!,
              ],
            ).createShader(bean.getBounds()),
        );
        canvas.save();
        canvas.clipPath(bean);
        final gum = Rect.fromCenter(
          center: beanCenter.translate(beanWidth * 0.07, beanHeight * 0.42),
          width: beanWidth * 0.72,
          height: beanHeight * (0.46 + open * 0.12),
        );
        canvas.drawOval(
          gum,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFF9DB5), Color(0xFFED5F88)],
            ).createShader(gum),
        );
        canvas.drawArc(
          gum.deflate(unit * 0.8),
          math.pi * 1.08,
          math.pi * 0.56,
          false,
          Paint()
            ..color = Colors.white.withValues(alpha: 0.28)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.8
            ..strokeCap = StrokeCap.round,
        );
        canvas.restore();
        canvas.drawPath(
          bean,
          Paint()
            ..color = lineInk.withValues(alpha: 0.72)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 0.9
            ..strokeJoin = StrokeJoin.round,
        );
      case SlopMouth.nibble:
        // One small upper tooth, rooted behind the cavity's upper rim. It is
        // clipped to the mouth and never crosses a tongue, avoiding the
        // floating-teeth anatomy that made earlier expressions feel broken.
        final mouth = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: center.translate(-unit * 0.8, unit * (0.6 + open * 0.8)),
            width: w * (0.68 + open * 0.12),
            height: unit * math.min(7.0 + open * 5.0, metrics.maxHeight),
          ),
          Radius.circular(unit * 4.2),
        );
        drawCavity(mouth);
        canvas.save();
        canvas.clipRRect(mouth);
        final toothWidth = unit * 4.1;
        final toothHeight = math.min(unit * 4.2, mouth.height * 0.52);
        final tooth = RRect.fromRectAndCorners(
          Rect.fromLTWH(
            mouth.center.dx + mouth.width * 0.10,
            mouth.top - unit * 0.6,
            toothWidth,
            toothHeight + unit * 0.6,
          ),
          bottomLeft: Radius.circular(unit * 1.2),
          bottomRight: Radius.circular(unit * 1.2),
        );
        canvas.drawRRect(
          tooth,
          Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFFFFF), Color(0xFFFFE9CF)],
            ).createShader(tooth.outerRect),
        );
        canvas.drawLine(
          Offset(tooth.left + unit * 0.8, tooth.bottom - unit * 0.8),
          Offset(tooth.right - unit * 0.8, tooth.bottom - unit * 0.8),
          Paint()
            ..color = const Color(0xFFD8BFA0).withValues(alpha: 0.42)
            ..strokeWidth = unit * 0.55
            ..strokeCap = StrokeCap.round,
        );
        canvas.restore();
      case SlopMouth.gooberBite:
        // An intentionally lopsided little cavity with two oversized front
        // teeth and a tongue escaping one corner. Every part shares the same
        // lip boundary, so it remains funny without looking anatomically torn.
        final mouth = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: center.translate(unit * 0.8, unit * (0.8 + open * 0.8)),
            width: w * (0.82 + open * 0.08),
            height: unit * math.min(8.8 + open * 4.6, metrics.maxHeight),
          ),
          Radius.circular(unit * 4.8),
        );
        drawCavity(mouth);
        canvas.save();
        canvas.clipRRect(mouth);
        for (final x in const [-0.11, 0.11]) {
          final tooth = RRect.fromRectAndCorners(
            Rect.fromLTWH(
              mouth.center.dx + mouth.width * x - unit * 2.25,
              mouth.top - unit * 0.55,
              unit * 4.5,
              unit * 5.1,
            ),
            bottomLeft: Radius.circular(unit * 1.25),
            bottomRight: Radius.circular(unit * 1.25),
          );
          canvas.drawRRect(
            tooth,
            Paint()
              ..shader = const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFFFFFFF), Color(0xFFFFE7BD)],
              ).createShader(tooth.outerRect),
          );
          canvas.drawRRect(
            tooth,
            Paint()
              ..color = lineInk.withValues(alpha: 0.22)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 0.45,
          );
        }
        canvas.restore();
        final tongue = RRect.fromRectAndCorners(
          Rect.fromCenter(
            center: Offset(
              mouth.center.dx + mouth.width * 0.23,
              mouth.bottom + unit * 1.6,
            ),
            width: unit * 7.6,
            height: unit * 6.8,
          ),
          bottomLeft: Radius.circular(unit * 3.8),
          bottomRight: Radius.circular(unit * 3.8),
          topLeft: Radius.circular(unit * 1.4),
          topRight: Radius.circular(unit * 1.4),
        );
        canvas.drawRRect(tongue, tongueFill);
        canvas.drawLine(
          Offset(tongue.center.dx, tongue.center.dy + unit * 0.3),
          Offset(tongue.center.dx, tongue.bottom - unit * 0.8),
          tongueLine,
        );
    }
  }

  /// Little bubbles rising off the body. Cheap, and it makes a static frame
  /// feel alive even before anything is animating.
  static void _paintFinishAtmosphere(Canvas canvas, Rect rect, double phase) {
    final detail = slopFinishDetailUnitFor(rect);
    // Two quiet smoke puffs sit behind the shoulders. They are gated by the
    // caller's ambient flag and never overpaint anatomy, headwear, or face.
    for (final puff in const [
      (0.04, 0.22, 0.15, 0.09, 0.0),
      (0.96, 0.16, 0.13, 0.08, 1.7),
    ]) {
      final drift = math.sin(phase * math.pi * 2 + puff.$5);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(
            rect.left + rect.width * puff.$1 + drift * detail * 2.2,
            rect.top + rect.height * puff.$2 - drift * detail,
          ),
          width: rect.shortestSide * puff.$3,
          height: rect.shortestSide * puff.$4,
        ),
        Paint()
          ..color = const Color(0xFF766D79).withValues(alpha: 0.18)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, detail * 4.5),
      );
    }
  }

  static void _paintAmbient(
    Canvas canvas,
    Rect rect,
    SlopLook look,
    double phase,
    double reaction, {
    required SlopToonDepthPose depthPose,
    required SlopAuraDepthPass depthPass,
  }) {
    final palette = look.palette;
    final unit = rect.shortestSide / 100;
    final dimensionalAura =
        depthPass != SlopAuraDepthPass.all || !depthPose.isNeutral;
    double auraScale(double depth) =>
        dimensionalAura ? depthPose.auraScaleForDepth(depth) : 1;
    double auraOpacity(double depth) =>
        dimensionalAura ? depthPose.auraOpacityForDepth(depth) : 1;
    canvas.save();
    canvas.translate(rect.width * depthPose.auraOrbitOffsetX, 0);
    // Echo silhouettes are entirely behind the body. A hemisphere clip would
    // cut away their lower contours even though no front pass draws them.
    if (depthPass != SlopAuraDepthPass.all &&
        look.aura != SlopAura.echoTrail &&
        look.aura != SlopAura.sloplings) {
      canvas.clipPath(
        slopAuraDepthClipPathFor(
          bodyRect: rect,
          aura: look.aura,
          pass: depthPass,
          depthPose: depthPose,
        ),
        doAntiAlias: false,
      );
    }
    switch (look.aura) {
      case SlopAura.none:
        break;
      case SlopAura.bubbles:
        // Bubbles rise off the shoulders, not the face centerline. Centered
        // rings above a cyclops read as stray extra eyes.
        const bubbleX = [-.055, -.025, 1.025, 1.055];
        for (var i = 0; i < 4; i++) {
          final t = (phase + i / 4) % 1;
          final x = rect.left + rect.width * bubbleX[i];
          final y = rect.top + rect.height * (.12 + (1 - t) * .72);
          final fade = math.sin(t * math.pi).clamp(0.0, 1.0);
          canvas.drawCircle(
            Offset(x + math.sin(t * math.pi * 3 + i) * unit * 2, y),
            unit * (1.2 + i * 0.34) * fade,
            Paint()
              ..color = const Color(0xFF7AACAD).withValues(alpha: .82 * fade)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 0.8,
          );
        }
      case SlopAura.stardust:
        for (var i = 0; i < 7; i++) {
          final a = phase * math.pi * 2 + i * math.pi * 2 / 7;
          final radius = rect.width * (0.54 + (i % 2) * 0.06);
          final depth = depthPose.orbitDepthFor(a);
          final depthScale = auraScale(depth);
          final p =
              rect.center +
              Offset(
                    math.cos(a),
                    math.sin(a) * rect.height / rect.width * .90,
                  ) *
                  radius;
          _sparkle(
            canvas,
            p,
            unit * (1.8 + (i % 3)) * depthScale,
            Paint()
              ..color = const Color(
                0xFFFFF2A8,
              ).withValues(alpha: 0.82 * auraOpacity(depth)),
          );
        }
      case SlopAura.embers:
        for (var i = 0; i < 8; i++) {
          final t = (phase + i / 8) % 1;
          final x =
              rect.center.dx +
              (i.isEven ? -1 : 1) *
                  rect.width *
                  (.53 + .04 * math.sin(t * math.pi));
          final y = rect.bottom - rect.height * t * 1.1;
          canvas.drawCircle(
            Offset(x + math.sin(t * 9 + i) * unit * 3, y),
            unit * (1.5 + (i % 3) * .45) * math.sin(t * math.pi),
            Paint()..color = const Color(0xFFE7A362).withValues(alpha: 0.86),
          );
        }
      case SlopAura.hearts:
        for (var i = 0; i < 4; i++) {
          final t = (phase + i / 4) % 1;
          final side = i.isEven ? -1.0 : 1.0;
          final p = Offset(
            rect.center.dx +
                side * rect.width * (.54 + .045 * math.sin(t * math.pi)),
            rect.bottom - rect.height * t * 0.92,
          );
          canvas.drawPath(
            _heart(p, unit * (2.5 + i % 2) * math.sin(t * math.pi)),
            Paint()..color = const Color(0xFFFF6D9D).withValues(alpha: 0.72),
          );
        }
      case SlopAura.glitch:
        for (var i = 0; i < 6; i++) {
          final t = (phase * 2 + i * .31) % 1;
          final side = i.isEven ? rect.left : rect.right;
          final y = rect.top + rect.height * (0.12 + t * 0.76);
          canvas.drawRect(
            Rect.fromCenter(
              center: Offset(side + (i.isEven ? -1 : 1) * unit * 4, y),
              width: unit * (4 + i % 3 * 3),
              height: unit * 2,
            ),
            Paint()
              ..color =
                  (i.isEven ? const Color(0xFF38F5DC) : const Color(0xFFFF4FA3))
                      .withValues(alpha: .80 * math.sin(t * math.pi)),
          );
        }
      case SlopAura.orbit:
        canvas.drawOval(
          Rect.fromCenter(
            center: rect.center,
            width: rect.width * 1.22,
            height: rect.height * .88,
          ),
          Paint()
            ..color = palette.glow.withValues(alpha: 0.25)
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit,
        );
        for (var i = 0; i < 3; i++) {
          final a = phase * math.pi * 2 + i * math.pi * 2 / 3;
          final depth = depthPose.orbitDepthFor(a);
          canvas.drawCircle(
            rect.center +
                Offset(
                  math.cos(a) * rect.width * 0.61,
                  math.sin(a) * rect.height * .44,
                ),
            unit * (2.4 + i) * auraScale(depth),
            Paint()
              ..color = [
                const Color(0xFFFFD66B),
                const Color(0xFF79E8FF),
                const Color(0xFFC590FF),
              ][i].withValues(alpha: auraOpacity(depth)),
          );
        }
      case SlopAura.fireflies:
        for (var i = 0; i < 9; i++) {
          final a = phase * math.pi * 2 * (i.isEven ? 1 : -1) + i * 2.17;
          final depth = depthPose.orbitDepthFor(a);
          final depthScale = auraScale(depth);
          final depthOpacity = auraOpacity(depth);
          final radius = rect.width * (.56 + (i % 3) * .035);
          final p =
              rect.center +
              Offset(math.cos(a) * radius, math.sin(a) * rect.height * .53);
          final pulse = 0.45 + 0.55 * math.sin(phase * math.pi * 4 + i).abs();
          canvas.drawCircle(
            p,
            unit * (1.0 + pulse) * depthScale,
            Paint()
              ..color = const Color(
                0xFFFFF08A,
              ).withValues(alpha: 0.78 * pulse * depthOpacity)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.8),
          );
          canvas.drawCircle(
            p,
            unit * 0.65 * depthScale,
            Paint()
              ..color = const Color(0xFFFFF7BF).withValues(alpha: depthOpacity),
          );
        }
      case SlopAura.lightning:
        for (final side in [-1.0, 1.0]) {
          final x = side < 0 ? rect.left - unit * 5 : rect.right + unit * 5;
          final bolt = Path()
            ..moveTo(x, rect.top + rect.height * 0.28)
            ..lineTo(x - side * unit * 5, rect.top + rect.height * 0.45)
            ..lineTo(x + side * unit * 1.5, rect.top + rect.height * 0.44)
            ..lineTo(x - side * unit * 4.5, rect.top + rect.height * 0.68);
          canvas.drawPath(
            bolt,
            Paint()
              ..color = const Color(
                0xFF74B8BF,
              ).withValues(alpha: .72 + .15 * math.sin(phase * math.pi * 2))
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 2.2
              ..strokeJoin = StrokeJoin.round
              ..maskFilter = MaskFilter.blur(BlurStyle.solid, unit * 1.2),
          );
        }
      case SlopAura.portal:
        final portal = Rect.fromCenter(
          center: Offset(rect.center.dx, rect.bottom - unit * 2),
          width: rect.width * (1.14 + .025 * math.sin(phase * math.pi * 2)),
          height: rect.height * 0.20,
        );
        for (var i = 0; i < 3; i++) {
          canvas.drawOval(
            portal.inflate(unit * i * 2.5),
            Paint()
              ..color = [
                const Color(0xFF5CF0D2),
                const Color(0xFF8D7CFF),
                const Color(0xFFFF6AA7),
              ][i].withValues(alpha: 0.48 - i * 0.08)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * (2.4 - i * 0.4),
          );
        }
      case SlopAura.prismatic:
        const colors = [
          Color(0xFFFF6B8D),
          Color(0xFFFFD36E),
          Color(0xFF62E5C5),
          Color(0xFF72B7FF),
          Color(0xFFC889FF),
        ];
        for (var i = 0; i < colors.length; i++) {
          final bounds = rect.inflate(unit * (5 + i * 1.3));
          canvas.drawArc(
            bounds,
            phase * math.pi * 2 + i * 0.42,
            math.pi * 0.48,
            false,
            Paint()
              ..color = colors[i].withValues(alpha: .67)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 1.35
              ..strokeCap = StrokeCap.round,
          );
        }
      case SlopAura.sloplings:
        // A branded aura instead of generic particles: three genuinely tiny
        // one-eyed Slops hover around the shoulders and pooled base. Their
        // paths never enter the central face corridor.
        const crew = <(double, double, double, Color)>[
          (-0.60, -0.08, 9.2, Color(0xFFFF7EA6)),
          (0.60, 0.10, 8.3, Color(0xFF70E4D0)),
          (0.30, 0.53, 7.6, Color(0xFFFFC85C)),
        ];
        for (var i = 0; i < crew.length; i++) {
          final (x, y, radiusUnits, color) = crew[i];
          final clock = phase * math.pi * 2 + i * math.pi * 0.73;
          final center = Offset(
            rect.center.dx + rect.width * x + math.cos(clock) * unit * 1.8,
            rect.center.dy + rect.height * y + math.sin(clock) * unit * 2.8,
          );
          final front = center.dy >= rect.center.dy;
          if (depthPass != SlopAuraDepthPass.all &&
              front != (depthPass == SlopAuraDepthPass.front)) {
            continue;
          }
          _paintSlopling(
            canvas,
            center: center,
            radius: unit * radiusUnits,
            color: color,
            ink: Color.lerp(color, Colors.black, 0.74)!,
            phase: phase + i / crew.length,
          );
        }
      case SlopAura.petals:
        // Two loose streams travel beside the body. Alternating direction and
        // size keeps them organic while their x positions remain outside the
        // face, including in compact avatars.
        const petalColors = [
          Color(0xFFFFA8C1),
          Color(0xFFFFE2A8),
          Color(0xFFC7F2CE),
          Color(0xFFDCC8FF),
        ];
        for (var i = 0; i < 8; i++) {
          final t = (phase + i / 8) % 1;
          final side = i.isEven ? -1.0 : 1.0;
          final center = Offset(
            rect.center.dx +
                side *
                    rect.width *
                    (0.54 + 0.055 * math.sin(t * math.pi * 2 + i)),
            rect.top + rect.height * (0.05 + t * 0.92),
          );
          final radius = unit * (2.8 + (i % 3) * 0.65);
          final petal = Path()
            ..moveTo(0, -radius)
            ..cubicTo(
              radius * 0.70,
              -radius * 0.42,
              radius * 0.62,
              radius * 0.45,
              0,
              radius,
            )
            ..cubicTo(
              -radius * 0.62,
              radius * 0.45,
              -radius * 0.70,
              -radius * 0.42,
              0,
              -radius,
            )
            ..close();
          canvas.save();
          canvas.translate(center.dx, center.dy);
          canvas.rotate(t * math.pi * 3 + i * 0.83);
          canvas.drawPath(
            petal,
            Paint()
              ..color = petalColors[i % petalColors.length].withValues(
                alpha: .84 * math.sin(t * math.pi),
              ),
          );
          canvas.drawPath(
            Path()
              ..moveTo(0, -radius * 0.58)
              ..quadraticBezierTo(radius * 0.12, 0, 0, radius * 0.56),
            Paint()
              ..color = Colors.white.withValues(
                alpha: .42 * math.sin(t * math.pi),
              )
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 0.58
              ..strokeCap = StrokeCap.round,
          );
          canvas.restore();
        }
      case SlopAura.ideaComets:
        // Three bright ideas orbit as tiny gel comets. Long translucent tails
        // sit outside the face corridor and make the aura legible in motion,
        // while the warm heads tie back to Slop's tangerine brand core.
        const cometColors = [
          Color(0xFFFFB13B),
          Color(0xFF6BE8FF),
          Color(0xFFC99BFF),
        ];
        for (var i = 0; i < 3; i++) {
          final angle =
              phase * math.pi * 2 * (i == 1 ? -1 : 1) + i * math.pi * 0.72;
          final depth = depthPose.orbitDepthFor(angle);
          final depthScale = auraScale(depth);
          final depthOpacity = auraOpacity(depth);
          final radiusX = rect.width * (0.58 + i * 0.025);
          final radiusY = rect.height * (0.42 + (i % 2) * 0.045);
          final head =
              rect.center +
              Offset(math.cos(angle) * radiusX, math.sin(angle) * radiusY);
          final tangent = Offset(
            -math.sin(angle) * radiusX,
            math.cos(angle) * radiusY,
          );
          final direction = tangent / math.max(tangent.distance, 0.001);
          final tail = Path()
            ..moveTo(head.dx, head.dy)
            ..quadraticBezierTo(
              head.dx - direction.dx * unit * 7 + math.cos(angle) * unit * 2,
              head.dy - direction.dy * unit * 7 + math.sin(angle) * unit * 2,
              head.dx - direction.dx * unit * 15,
              head.dy - direction.dy * unit * 15,
            );
          canvas.drawPath(
            tail,
            Paint()
              ..shader = LinearGradient(
                colors: [
                  cometColors[i].withValues(alpha: 0.70 * depthOpacity),
                  cometColors[i].withValues(alpha: 0),
                ],
              ).createShader(tail.getBounds().inflate(unit * 2))
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 3.2
              ..strokeCap = StrokeCap.round
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.0),
          );
          canvas.drawCircle(
            head,
            unit * 3.8 * depthScale,
            Paint()
              ..color = cometColors[i].withValues(alpha: 0.28 * depthOpacity)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 2.8),
          );
          canvas.drawCircle(
            head,
            unit * 2.15 * depthScale,
            Paint()..color = cometColors[i].withValues(alpha: depthOpacity),
          );
          canvas.drawCircle(
            head.translate(-unit * 0.62, -unit * 0.72),
            unit * 0.62 * depthScale,
            Paint()
              ..color = Colors.white.withValues(alpha: 0.82 * depthOpacity),
          );
        }
      case SlopAura.soundRings:
        // Stereo gel waves breathe from both shoulders. The paired arcs are a
        // readable collectible silhouette at avatar size, not generic dots.
        for (final side in [-1.0, 1.0]) {
          for (var ring = 0; ring < 3; ring++) {
            final t = (phase + ring / 3) % 1;
            final center = Offset(
              side < 0 ? rect.left - unit * 3.5 : rect.right + unit * 3.5,
              rect.top +
                  rect.height * (0.47 + math.sin(phase * math.pi * 2) * 0.02),
            );
            final waveRect = Rect.fromCenter(
              center: center,
              width: unit * (7 + 13 * t),
              height: rect.height * (0.24 + 0.24 * t),
            );
            canvas.drawArc(
              waveRect,
              side < 0 ? -math.pi / 2 : math.pi / 2,
              side < 0 ? -math.pi : math.pi,
              false,
              Paint()
                ..shader = LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF62F3D0).withValues(alpha: 0.64 * (1 - t)),
                    const Color(0xFFB77BFF).withValues(alpha: 0.48 * (1 - t)),
                    const Color(0xFFFF6FAE).withValues(alpha: 0.58 * (1 - t)),
                  ],
                ).createShader(waveRect)
                ..style = PaintingStyle.stroke
                ..strokeWidth = unit * (1.8 - t * 0.65)
                ..strokeCap = StrokeCap.round,
            );
          }
        }
      case SlopAura.echoTrail:
        if (depthPass == SlopAuraDepthPass.front) break;
        // Full-size liquid afterimages lag behind the pet. Clip away the live
        // body corridor so the translucent echoes never wash over its face.
        final protected = Path.combine(
          PathOperation.union,
          slopFormOutlineFor(
            rect.inflate(unit * 1.5),
            body: look.body,
            phase: phase,
          ),
          Path()..addRect(
            Rect.fromCenter(
              center: rect.center,
              width: rect.width * .40,
              height: rect.height * .50,
            ),
          ),
        );
        final outsideMask = Path.combine(
          PathOperation.difference,
          Path()..addRect(rect.inflate(rect.width * .42)),
          protected,
        );
        canvas.save();
        canvas.clipPath(outsideMask);
        for (var echo = 3; echo >= 1; echo--) {
          final drift =
              math.sin(phase * math.pi * 2 - echo * 0.56) *
              rect.width *
              (.04 + echo * .010);
          final echoRect = rect
              .shift(Offset(drift, unit * echo * .4))
              .deflate(unit * echo * 0.8);
          final echoPath = slopFormOutlineFor(
            echoRect,
            body: look.body,
            phase: phase - echo * .08,
          );
          canvas.drawPath(
            echoPath,
            Paint()
              ..color = [
                const Color(0xFF6EF2D2),
                const Color(0xFF8E9CFF),
                const Color(0xFFFF70AE),
              ][echo - 1].withValues(alpha: 0.30 - echo * 0.040)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * (3.6 - echo * 0.45)
              ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.2),
          );
        }
        canvas.restore();
      case SlopAura.ribbonTrail:
        // Tapered satin has a visible folded edge and a light fabric centre.
        // Bounded polylines follow two loose side loops, rather than drawing
        // uniform neon brackets directly on the character's cheeks.
        for (var sideIndex = 0; sideIndex < 2; sideIndex++) {
          final side = sideIndex == 0 ? -1.0 : 1.0;
          final clock = phase * math.pi * 2 + sideIndex * math.pi;
          final left = <Offset>[], right = <Offset>[];
          final seam = Path();
          for (var step = 0; step <= 28; step++) {
            final t = step / 28;
            final wave = t * math.pi * 2 + clock;
            final center = Offset(
              rect.center.dx +
                  side * (rect.width * .565 + unit * (4 + 5 * math.sin(wave))),
              rect.top + rect.height * (.05 + t * .99),
            );
            final tangent = Offset(
              side * unit * 10 * math.pi * math.cos(wave),
              rect.height * .99,
            );
            final normal = Offset(-tangent.dy, tangent.dx) / tangent.distance;
            final halfWidth = unit * (.35 + 2.05 * math.sin(t * math.pi));
            left.add(center + normal * halfWidth);
            right.add(center - normal * halfWidth);
            if (step == 0) {
              seam.moveTo(center.dx, center.dy);
            } else {
              seam.lineTo(center.dx, center.dy);
            }
          }
          final ribbon = Path()..addPolygon([...left, ...right.reversed], true);
          final color = sideIndex == 0
              ? const Color(0xFFE493AF)
              : const Color(0xFFB7A0D5);
          canvas.drawPath(
            ribbon,
            Paint()
              ..shader = LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.lerp(color, Colors.white, .55)!,
                  color,
                  Color.lerp(color, const Color(0xFF765F82), .38)!,
                ],
              ).createShader(ribbon.getBounds()),
          );
          canvas.drawPath(
            ribbon,
            Paint()
              ..color = const Color(0xFF8F708E).withValues(alpha: .48)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * .55,
          );
          canvas.drawPath(
            seam,
            Paint()
              ..color = Colors.white.withValues(alpha: .58)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * .65,
          );
        }
      case SlopAura.coinChorus:
        for (var i = 0; i < 4; i++) {
          final angle = phase * math.pi * 2 + i * math.pi / 2;
          final depth = depthPose.orbitDepthFor(angle);
          final center =
              rect.center +
              Offset(
                math.cos(angle) * rect.width * .61,
                rect.height * (.08 + math.sin(angle) * .51),
              );
          final side = unit * (i.isEven ? 14 : 11.5) * auraScale(depth);
          SlopCoinPainter.paintCoin(
            canvas,
            Rect.fromCenter(center: center, width: side, height: side),
            turn: phase * math.pi * 4 + i * .91,
            opacity: auraOpacity(depth),
          );
        }
      case SlopAura.dewdrops:
      case SlopAura.moonMotes:
        // Six small companions stay at the silhouette's sides. The fitted
        // body transform and existing rear/front passes own their placement;
        // their gentle bob never sends a particle across the face.
        for (var i = 0; i < 6; i++) {
          final clock = phase * math.pi * 2 + i * 1.31;
          final side = i.isEven ? -1.0 : 1.0;
          final depth = depthPose.orbitDepthFor(clock);
          final opacity = auraOpacity(depth);
          final moon = look.aura == SlopAura.moonMotes;
          final accent = moon && i >= 4;
          final center =
              rect.center +
              Offset(
                side * rect.width * (.50 + .005 * math.sin(clock)),
                rect.height * (-.32 + (i ~/ 2) * .31 + .018 * math.cos(clock)),
              );
          final radius =
              unit *
              (moon ? (accent ? 1.5 : 3.5) : 2.5 + i % 3 * .3) *
              auraScale(depth);
          canvas.save();
          canvas.translate(center.dx, center.dy);
          canvas.rotate(side * .24 + math.sin(clock) * .14);
          final shape = moon && !accent
              ? (Path()
                  ..moveTo(radius * .48, -radius * .93)
                  ..cubicTo(
                    -radius * 1.04,
                    -radius * 1.18,
                    -radius * 1.25,
                    radius * .68,
                    -radius * .13,
                    radius,
                  )
                  ..cubicTo(
                    radius * .23,
                    radius * 1.1,
                    radius * .68,
                    radius * .83,
                    radius * .86,
                    radius * .56,
                  )
                  ..cubicTo(
                    -radius * .4,
                    radius * .85,
                    -radius * .61,
                    -radius * .65,
                    radius * .48,
                    -radius * .93,
                  )
                  ..close())
              : (Path()..addOval(
                  Rect.fromCenter(
                    center: Offset.zero,
                    width: radius * 1.8,
                    height: radius * 2.1,
                  ),
                ));
          final shade = moon
              ? const Color(0xFF9A87BB)
              : const Color(0xFF84ADB2);
          canvas.drawPath(
            shape.shift(Offset(unit * .45, unit * .6)),
            Paint()..color = shade.withValues(alpha: .24 * opacity),
          );
          canvas.drawPath(
            shape,
            Paint()
              ..shader =
                  RadialGradient(
                    center: const Alignment(-.55, -.65),
                    radius: 1.15,
                    colors: [
                      Colors.white.withValues(alpha: .98 * opacity),
                      (moon ? const Color(0xFFE3D3FC) : const Color(0xFFD7EEE5))
                          .withValues(alpha: .96 * opacity),
                      shade.withValues(alpha: .90 * opacity),
                    ],
                    stops: const [0, .52, 1],
                  ).createShader(
                    Rect.fromCircle(center: Offset.zero, radius: radius),
                  ),
          );
          canvas.drawPath(
            shape,
            Paint()
              ..color = shade.withValues(alpha: .64 * opacity)
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * .52,
          );
          if (!moon) {
            canvas.drawOval(
              Rect.fromCenter(
                center: Offset(-radius * .30, -radius * .42),
                width: radius * .52,
                height: radius * .72,
              ),
              Paint()..color = Colors.white.withValues(alpha: .88 * opacity),
            );
          }
          canvas.restore();
        }
    }
    // A tap flings sparkles outward.
    if (reaction > 0.02) {
      final burst = math.sin(reaction * math.pi);
      for (var i = 0; i < 7; i++) {
        final a = i / 7 * math.pi * 2 - 0.4;
        final d = rect.width * (0.42 + reaction * 0.3);
        canvas.drawCircle(
          rect.center + Offset(math.cos(a) * d, math.sin(a) * d * 0.8),
          unit * 2.4 * burst,
          Paint()..color = palette.glow.withValues(alpha: 0.75 * burst),
        );
      }
    }
    canvas.restore();
  }

  /// A tiny satellite Slop used by the Tiny Slops aura. Keeping this as a
  /// reduced version of the same pooled dome/one-eye grammar makes the aura
  /// feel like part of the brand rather than three unrelated circular pets.
  static void _paintSlopling(
    Canvas canvas, {
    required Offset center,
    required double radius,
    required Color color,
    required Color ink,
    required double phase,
  }) {
    final sway = math.sin(phase * math.pi * 2);
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(sway * 0.09);

    final body = slopFormOutlineFor(
      Rect.fromCenter(
        center: Offset.zero,
        width: radius * 2,
        height: radius * 2,
      ),
      body: SlopBody.ghost,
      phase: phase,
    );
    canvas.drawPath(
      body,
      Paint()
        ..color = color.withValues(alpha: 0.26)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, radius * 0.45),
    );
    canvas.drawPath(
      body,
      Paint()
        ..color = ink.withValues(alpha: 0.82)
        ..style = PaintingStyle.stroke
        ..strokeWidth = radius * 0.14
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawPath(
      body,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(color, Colors.white, .62)!,
            color,
            Color.lerp(color, ink, .24)!,
          ],
          stops: const [0, 0.58, 1],
        ).createShader(body.getBounds()),
    );

    final eyeCenter = Offset(sway * radius * 0.08, -radius * 0.18);
    final eye = Rect.fromCenter(
      center: eyeCenter,
      width: radius * 0.72,
      height: radius * 0.76,
    );
    canvas.drawOval(
      eye.inflate(radius * 0.06),
      Paint()..color = ink.withValues(alpha: 0.80),
    );
    canvas.drawOval(eye, Paint()..color = const Color(0xFFFFFDF8));
    final pupil = eyeCenter.translate(sway * radius * 0.08, 0);
    canvas.drawCircle(pupil, radius * 0.19, Paint()..color = ink);
    canvas.drawCircle(
      pupil.translate(-radius * 0.06, -radius * 0.07),
      radius * 0.06,
      Paint()..color = Colors.white.withValues(alpha: 0.94),
    );
    canvas.drawArc(
      Rect.fromCenter(
        center: Offset(-radius * 0.26, -radius * 0.50),
        width: radius * 0.34,
        height: radius * 0.22,
      ),
      math.pi * 0.96,
      math.pi * 0.62,
      false,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.48)
        ..style = PaintingStyle.stroke
        ..strokeWidth = radius * 0.08
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();
  }

  static Path _heart(Offset c, double r) {
    final path = Path()..moveTo(c.dx, c.dy + r * 0.72);
    path.cubicTo(
      c.dx - r * 1.3,
      c.dy - r * 0.15,
      c.dx - r * 0.52,
      c.dy - r * 1.05,
      c.dx,
      c.dy - r * 0.36,
    );
    path.cubicTo(
      c.dx + r * 0.52,
      c.dy - r * 1.05,
      c.dx + r * 1.3,
      c.dy - r * 0.15,
      c.dx,
      c.dy + r * 0.72,
    );
    return path..close();
  }

  /// Small droplets echo the completed silhouette during the held heartbeat.
  /// Their motion is derived only from [shiftT], so recording/replaying the
  /// animation is deterministic and there is no timer-driven particle jitter.
  static void _paintHeartShiftAccents(
    Canvas canvas,
    Rect rect,
    SlopPalette palette,
    double shiftT,
    double visibility,
    double unit,
  ) {
    const seeds = [
      (-0.44, 0.24, 0.00, 4.0),
      (0.44, 0.18, 0.035, 3.4),
      (-0.38, -0.12, 0.07, 2.7),
      (0.40, -0.17, 0.10, 2.9),
    ];
    for (var i = 0; i < seeds.length; i++) {
      final (x, y, delay, radius) = seeds[i];
      final travel = ((shiftT - 0.20 - delay) / 0.62).clamp(0.0, 1.0);
      final life = math.sin(travel * math.pi) * visibility;
      if (life <= 0.01) continue;
      final center = Offset(
        rect.center.dx + rect.width * x + math.sin(travel * math.pi * 2) * unit,
        rect.center.dy + rect.height * y - rect.height * 0.16 * travel,
      );
      final path = _heart(center, unit * radius * (0.72 + 0.28 * life));
      canvas.drawPath(
        path,
        Paint()
          ..color = palette.glow.withValues(alpha: 0.20 * life)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 2.6),
      );
      canvas.drawPath(
        path,
        Paint()..color = palette.light.withValues(alpha: 0.84 * life),
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = palette.shade.withValues(alpha: 0.22 * life)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.65,
      );
    }
  }

  static Path _star(Offset c, double r) {
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final a = -math.pi / 2 + i * math.pi / 5;
      final rad = i.isEven ? r : r * 0.44;
      final p = c + Offset(math.cos(a) * rad, math.sin(a) * rad);
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    return path..close();
  }

  /// Two blinks per idle cycle, eased so the lid drops fast and opens slow.
  static double _blink(double phase) {
    var v = 0.0;
    for (final at in const [0.58, 0.90]) {
      final d = (phase - at).abs();
      if (d < 0.032) v = math.max(v, 1 - d / 0.032);
    }
    return Curves.easeOutQuad.transform(v.clamp(0.0, 1.0));
  }

  /// A wink is a pose, not a missing eye. It spends most of the idle loop
  /// closed, peeks open with a soft lid motion, then returns to the wink.
  static double _winkClosure(double phase) {
    final t = phase % 1.0;
    if (t < 0.62 || t > 0.88) return 1;
    final peek = ((t - 0.62) / 0.26).clamp(0.0, 1.0);
    return 1 - math.sin(peek * math.pi);
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  /// The point a limb reaches, on the same ellipse the blob outline uses.
  static Offset _limbTip(Rect rect, double angle, double length) {
    final hw = rect.width / 2;
    final hh = rect.height / 2;
    final c = math.cos(angle);
    final sn = math.sin(angle);
    final r = math.sqrt(hw * hw * c * c + hh * hh * sn * sn);
    return rect.center + Offset(c, sn) * r * (1 + length);
  }

  /// Shortest signed distance between two angles, so a bulge centred near the
  /// top of the outline doesn't tear where the sample loop wraps.
  static double _angleDelta(double a, double b) {
    var d = (a - b) % (math.pi * 2);
    if (d > math.pi) d -= math.pi * 2;
    if (d < -math.pi) d += math.pi * 2;
    return d;
  }

  /// A soft gaussian falloff — used to grow the crown tip out of the outline.
  static double _bump(double delta, double width) =>
      math.exp(-(delta * delta) / (2 * width * width));
}

/// The friendly face of the Slop Agent.
///
/// Static instances stay calm. Agent-facing instances can opt into a soft idle
/// wobble, blinking, talking, and a springy tap response without needing a
/// heavyweight animation asset. Pass [look] to draw a specific Slop; omit it
/// and the widget follows the user's own saved Slop live.
class SlopCharacter extends StatefulWidget {
  const SlopCharacter({
    super.key,
    this.size = 92,
    this.thinking = false,
    this.animated = false,
    this.talking = false,
    this.gaze = Offset.zero,
    this.emotion = SlopEmotion.happy,
    this.look,
    this.showEffects = true,
    this.facialLineColor,
    this.onTap,
  });

  final double size;
  final bool thinking;
  final bool animated;
  final bool talking;
  final Offset gaze;
  final SlopEmotion emotion;

  /// Contact shadow + rising bubbles. Turn off at small sizes (nav bar,
  /// swatches) where they only add noise.
  final bool showEffects;

  /// Optional surface-specific contrast for brows and closed-mouth linework.
  /// Eye/pupil colors and dark mouth cavities remain authored by [look]. Null
  /// preserves the canonical Slop renderer exactly.
  final Color? facialLineColor;

  /// A specific Slop to draw. When null the widget renders the user's own
  /// saved Slop and repaints whenever they customize it.
  final SlopLook? look;
  final VoidCallback? onTap;

  @override
  State<SlopCharacter> createState() => _SlopCharacterState();
}

class _SlopCharacterState extends State<SlopCharacter>
    with TickerProviderStateMixin {
  late final AnimationController _idle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3400),
    value: 0.12,
  );
  late final AnimationController _bounce = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 620),
  );

  /// The occasional shape-shift. It plays a 0→1 pass and then Slop is a plain
  /// armless dome again until the next one is scheduled.
  late final AnimationController _shiftCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  SlopShift? _shift;
  Timer? _shiftTimer;
  final _rng = math.Random();
  int _tapOrdinal = 0;

  /// How long each shift takes to grow and be reabsorbed.
  static const _shiftMs = {
    SlopShift.wave: 2600,
    SlopShift.stretch: 1500,
    SlopShift.wobble: 1100,
    SlopShift.droplet: 2200,
    SlopShift.lean: 1600,
    SlopShift.melt: 1900,
    SlopShift.hop: 950,
    SlopShift.eyeStalk: 2700,
    SlopShift.heart: 2100,
    SlopShift.square: 1900,
    SlopShift.triangle: 2050,
    SlopShift.star: 2050,
    SlopShift.cloud: 2200,
    SlopShift.flower: 2150,
    SlopShift.cheer: 1500,
    SlopShift.reach: 2200,
  };

  // Ambient performances are deliberately curated. The full shift vocabulary
  // remains available for authored moments, but random idle time should never
  // choose a frantic/glitchy gesture that makes the mascot feel unfinished.
  bool get _shouldMove => widget.animated || widget.talking;

  @override
  void initState() {
    super.initState();
    if (_shouldMove) {
      _idle.repeat();
      _scheduleShift();
    }
  }

  /// Wait a while, change shape once, then wait again. The gap is deliberately
  /// long and jittered — a slime that morphs constantly is noise, and the
  /// surprise is the whole charm.
  void _scheduleShift() {
    _shiftTimer?.cancel();
    if (widget.size < 72) return;
    _shiftTimer = Timer(Duration(milliseconds: 5000 + _rng.nextInt(9000)), () {
      if (!mounted || !_shouldMove) return;
      _playShift(
        slopAmbientShiftDeck[_rng.nextInt(slopAmbientShiftDeck.length)],
      );
    });
  }

  void _playShift(SlopShift shift) {
    if (!mounted) return;
    setState(() => _shift = shift);
    _shiftCtrl
      ..duration = Duration(milliseconds: _shiftMs[shift] ?? 1800)
      ..forward(from: 0).whenComplete(() {
        if (!mounted) return;
        setState(() => _shift = null);
        _scheduleShift();
      });
  }

  @override
  void didUpdateWidget(covariant SlopCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_shouldMove && !_idle.isAnimating) {
      _idle.repeat();
      _scheduleShift();
    } else if (!_shouldMove && _idle.isAnimating) {
      _idle.stop();
      _shiftTimer?.cancel();
    }
  }

  @override
  void dispose() {
    _shiftTimer?.cancel();
    _shiftCtrl.dispose();
    _idle.dispose();
    _bounce.dispose();
    super.dispose();
  }

  void _react() {
    HapticFeedback.lightImpact();
    _bounce.forward(from: 0);
    if (_shouldMove && _shift == null) {
      final response = slopTapReactionFor(_tapOrdinal++);
      _playShift(response);
    }
    widget.onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    final character = ListenableBuilder(
      listenable: Listenable.merge([
        _idle,
        _bounce,
        _shiftCtrl,
        SlopLookStore.instance,
      ]),
      builder: (context, _) {
        final look = widget.look ?? SlopLookStore.instance.look;
        final wave = math.sin(_idle.value * math.pi * 2);
        final reaction = _bounce.value;
        final idleGaze = Offset(
          math.sin(_idle.value * math.pi * 2) * 0.28,
          math.cos(_idle.value * math.pi * 2) * 0.10 + 0.08,
        );
        // External pointing directs the eyes but never freezes them. A small
        // living micro-saccade remains present on feed, shop, and profile.
        final effectiveGaze = Offset(
          (widget.gaze.dx + idleGaze.dx * 0.72).clamp(-1.0, 1.0),
          (widget.gaze.dy + idleGaze.dy * 0.60).clamp(-1.0, 1.0),
        );
        return SizedBox.square(
          dimension: widget.size,
          child: CustomPaint(
            painter: _SlopCharacterPainter(
              look: look,
              emotion: widget.thinking ? SlopEmotion.thinking : widget.emotion,
              phase: _idle.value,
              reaction: reaction,
              gaze: effectiveGaze,
              talk: widget.talking
                  ? math.sin(_idle.value * math.pi * 22).abs()
                  : 0,
              // A gentle float; the renderer owns squash so this is only the
              // vertical drift.
              float: -wave * widget.size * 0.018,
              effects: widget.showEffects,
              facialLineColor: widget.facialLineColor,
              shift: _shift,
              shiftT: _shiftCtrl.value,
            ),
          ),
        );
      },
    );

    return Semantics(
      image: widget.onTap == null,
      button: widget.onTap != null,
      label: widget.thinking
          ? 'Slop is making your game'
          : widget.talking
          ? 'Slop is talking'
          : 'Your Slop',
      child: widget.onTap == null
          ? character
          : GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _react,
              child: character,
            ),
    );
  }
}

double _lerpD(double a, double b, double t) => a + (b - a) * t;

class _SlopCharacterPainter extends CustomPainter {
  _SlopCharacterPainter({
    required this.look,
    required this.emotion,
    required this.phase,
    required this.reaction,
    required this.gaze,
    required this.talk,
    required this.float,
    required this.effects,
    required this.facialLineColor,
    required this.shift,
    required this.shiftT,
  }) : super(repaint: SlopChampionStore.instance);

  final SlopLook look;
  final SlopEmotion emotion;
  final double phase;
  final double reaction;
  final Offset gaze;
  final double talk;
  final double float;
  final bool effects;
  final Color? facialLineColor;
  final SlopShift? shift;
  final double shiftT;

  @override
  void paint(Canvas canvas, Size size) {
    // Leave headroom for hats/drips above and the contact shadow below.
    // Conservation of slime: while a limb is extended the body draws back into
    // itself. That is where the limb's material comes from — and it is also
    // what keeps a fully extended limb inside the widget instead of clipped.
    final reach =
        reimaginedCharactersEnabled || shift == null || shift == SlopShift.heart
        ? 0.0
        : math.sin(shiftT.clamp(0.0, 1.0) * math.pi);
    final w = _lerpD(0.84, 0.56, reach);
    final h = _lerpD(reimaginedCharactersEnabled ? 0.74 : 0.62, 0.46, reach);
    final baseRect = Rect.fromLTWH(
      size.width * (1 - w) / 2,
      size.height *
              ((reimaginedCharactersEnabled ? 0.17 : 0.25) +
                  ((reimaginedCharactersEnabled ? 0.74 : 0.62) - h) * 0.5) +
          float,
      size.width * w,
      size.height * h,
    );
    final breath = math.sin(phase * math.pi * 2);
    final rect = Rect.fromCenter(
      center: baseRect.center,
      width: baseRect.width * (1 + breath * 0.014),
      height: baseRect.height * (1 - breath * 0.010),
    );
    SlopRenderer.paint(
      canvas,
      rect: rect,
      look: look,
      emotion: emotion,
      phase: phase,
      reaction: reaction,
      gaze: gaze,
      talk: talk,
      faceAnchor: 0.44,
      shadow: effects,
      ambient: effects,
      // Compact Workshop/profile previews share the hero's body lighting;
      // hiding decorative effects must not flatten the character material.
      surfaceStyle: reimaginedCharactersEnabled
          ? SlopSurfaceStyle.toon
          : SlopSurfaceStyle.standard,
      facialLineColor: facialLineColor,
      shift: shift,
      shiftT: shiftT,
    );

    if (emotion == SlopEmotion.thinking) {
      final unit = size.width / 100;
      final bubble = Paint()..color = S.wh.withValues(alpha: 0.92);
      final drift = math.sin(phase * math.pi * 2) * unit;
      canvas.drawCircle(Offset(unit * 80, unit * 24 + drift), unit * 3, bubble);
      canvas.drawCircle(
        Offset(unit * 88, unit * 14 + drift * 1.4),
        unit * 4.6,
        bubble,
      );
      canvas.drawCircle(
        Offset(unit * 96, unit * 4 + drift * 1.8),
        unit * 6,
        bubble,
      );
    }
  }

  @override
  bool shouldRepaint(_SlopCharacterPainter old) =>
      old.look != look ||
      old.emotion != emotion ||
      old.phase != phase ||
      old.reaction != reaction ||
      old.gaze != gaze ||
      old.talk != talk ||
      old.float != float ||
      old.effects != effects ||
      old.facialLineColor != facialLineColor ||
      old.shift != shift ||
      old.shiftT != shiftT;
}

/// A Slop used as an identity badge — comments, leaderboards, feed cards.
///
/// Deliberately stateless with no controllers: these appear dozens at a time in
/// scrolling lists, where a StatefulWidget per row would mean dozens of live
/// animation controllers. [SlopCharacter] stays the animated one.
class SlopAvatar extends StatelessWidget {
  const SlopAvatar({
    super.key,
    required this.look,
    this.size = 44,
    this.ring,
    this.ringWidth = 0,
  });

  final SlopLook look;
  final double size;
  final Color? ring;
  final double ringWidth;

  @override
  Widget build(BuildContext context) {
    final palette = look.palette;
    return SizedBox.square(
      dimension: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          // A soft wash of the Slop's own colour so a light Slop still reads
          // against a light row, and a dark one against a dark row.
          color: palette.mid.withValues(alpha: 0.20),
          border: ringWidth > 0
              ? Border.all(color: ring ?? palette.light, width: ringWidth)
              : null,
        ),
        child: CustomPaint(painter: _SlopAvatarPainter(look), isComplex: false),
      ),
    );
  }
}

class _SlopAvatarPainter extends CustomPainter {
  _SlopAvatarPainter(this.look) : super(repaint: SlopChampionStore.instance);
  final SlopLook look;

  @override
  void paint(Canvas canvas, Size size) {
    // Clipped to the disc so a tall topper (afro, mohawk) can't spill over the
    // row it sits in.
    canvas.save();
    canvas.clipPath(
      Path()..addOval(Rect.fromLTWH(0, 0, size.width, size.height)),
    );
    SlopRenderer.paint(
      canvas,
      rect: Rect.fromLTWH(
        size.width * 0.14,
        size.height * 0.20,
        size.width * 0.72,
        size.height * 0.72,
      ),
      look: look,
      emotion: SlopEmotion.happy,
      phase: 0.12,
      faceAnchor: 0.46,
      shadow: false,
      ambient: false,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_SlopAvatarPainter old) => old.look != look;
}
