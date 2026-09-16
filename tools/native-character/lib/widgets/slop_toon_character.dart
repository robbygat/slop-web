import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../data/slop_look_store.dart';
import '../l10n/localized_text.dart' show localizedUiText;
import '../models/slop_look.dart';
import '../services/slop_champion_authority.dart';
import 'slop_character.dart';
import '../config/product_features.dart';
import 'slop_toon_parts_atlas.dart';

/// One deterministic pose in the interactive 2.5D Slop performance.
///
/// The painter deliberately consumes plain values rather than owning physics.
/// Studio, tests, and future recorded performances can therefore ask for the
/// exact same frame without depending on wall-clock timing.
typedef SlopToonFrame = ({
  double scaleX,
  double scaleY,
  double lean,
  double leanStrength,
  double bodyTravel,
  double verticalLift,
  double turn,
  Offset faceLag,
  Offset livingGaze,
  double faceTilt,
  double shadowScale,
  double shadowOpacity,
});

/// The reference cadence for Slop's compact profile/Buddy performance.
///
/// This is the material/blink clock rather than a finite pose loop. The seeded
/// personality beats below never reset at this boundary, but exposing the
/// cadence keeps Profile and Studio from silently drifting into different
/// apparent animation speeds.
const slopToonIdleDuration = Duration(milliseconds: 6400);

/// One deterministic sample from Slop's open-ended personality timeline.
///
/// [phase] is the canonical renderer clock (blink, material, and aura motion),
/// while [frame] owns the planted 2.5D performance. The clocks are deliberately
/// separate: cosmetics stay live, but the body no longer repeats one obvious
/// left/centre/right pass. Studio can sample this same source at any absolute
/// time without creating timers or depending on a widget lifecycle.
typedef SlopToonPersonalitySample = ({
  double phase,
  SlopToonFrame frame,
  SlopToonExpression expression,
  double smilePulse,
  int beatIndex,
  double beatProgress,
  double orientationAngle,
  bool fullTurnActive,
});

/// One deterministic sample from the rare full-orientation performance.
///
/// The angle is expressed in radians and can be passed directly to
/// [slopToonDepthPoseForAngle]. Exactly one bounded turn event is scheduled in
/// each four-block group, so Slop occasionally shows its back without
/// becoming a continuously spinning product viewer.
typedef SlopToonOrientationSample = ({
  double angle,
  bool active,
  double progress,
});

typedef _SlopToonPersonalityTarget = ({
  double turn,
  double gazeX,
  double gazeY,
  double lean,
  double travel,
  double faceX,
  double faceY,
  double faceTilt,
});

const _slopToonPersonalityPairSeconds = 6.4;

int _fnv1a32(String value) {
  var hash = 0x811C9DC5;
  for (final unit in value.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash & 0x7FFFFFFF;
}

/// Produces a stable motion seed without relying on Dart's process-local
/// [Object.hashCode]. When an account/profile [identity] is available it wins,
/// so changing clothes does not change that Slop's temperament. Otherwise the
/// exact equipped look is the stable fallback.
int slopToonPersonalitySeedFor(SlopLook look, {String? identity}) {
  final stableIdentity = identity?.trim().toLowerCase();
  if (stableIdentity != null && stableIdentity.isNotEmpty) {
    return _fnv1a32('slop-personality-v1:identity:$stableIdentity');
  }
  return _fnv1a32(
    'slop-personality-v1:look:'
    '${look.paletteId}|${look.eyes.name}|${look.eyeColor.name}|'
    '${look.mouth.name}|${look.hat.name}|${look.pattern.name}|'
    '${look.finish.name}|${look.aura.name}|${look.body.name}|'
    '${look.accessory.name}|${look.blush}|${look.name.trim().toLowerCase()}',
  );
}

int _personalityBits(int seed, int index, int channel) {
  var value =
      (seed ^ ((index + 0x51ED) * 0x9E3779B9) ^ ((channel + 1) * 0x85EBCA6B)) &
      0xFFFFFFFF;
  value ^= value >>> 16;
  value = (value * 0x7FEB352D) & 0xFFFFFFFF;
  value ^= value >>> 15;
  value = (value * 0x846CA68B) & 0xFFFFFFFF;
  value ^= value >>> 16;
  return value & 0x7FFFFFFF;
}

double _personalityUnit(int seed, int index, int channel) =>
    _personalityBits(seed, index, channel) / 0x7FFFFFFF;

double _personalitySigned(int seed, int index, int channel) =>
    _personalityUnit(seed, index, channel) * 2 - 1;

double _personalityTrack(
  double progress,
  List<(double time, double value)> keys,
) {
  final p = progress.isFinite ? progress.clamp(0.0, 1.0) : 0.0;
  for (var index = 0; index < keys.length - 1; index++) {
    final from = keys[index];
    final to = keys[index + 1];
    if (p > to.$1) continue;
    final span = to.$1 - from.$1;
    final local = span <= 0 ? 0.0 : ((p - from.$1) / span).clamp(0.0, 1.0);
    final smooth = _smootherStep(local);
    return _personalityLerp(from.$2, to.$2, smooth);
  }
  return keys.last.$2;
}

/// Samples the sparse automatic 360-degree performance independently of body
/// breathing and glance beats.
///
/// Each event eases through a side, pauses briefly at the faceless back, then
/// completes the same-direction turn. Its 0/2pi endpoints are exact and have
/// zero velocity, making block and renderer seams continuous.
SlopToonOrientationSample slopToonOrientationFrameFor({
  required double elapsedSeconds,
  required int seed,
  bool reducedMotion = false,
}) {
  if (reducedMotion) return (angle: 0, active: false, progress: 0);
  final seconds = elapsedSeconds.isFinite ? math.max(0.0, elapsedSeconds) : 0.0;
  const blockSeconds = 18.0;
  final block = (seconds / blockSeconds).floor();
  final group = block ~/ 4;
  final scheduledSlot = _personalityBits(seed, group, 73) % 4;
  if (block % 4 != scheduledSlot) {
    return (angle: 0, active: false, progress: 0);
  }
  final local = seconds - block * blockSeconds;
  final start = 2.8 + _personalityUnit(seed, group, 74) * 1.6;
  final duration = 4.1 + _personalityUnit(seed, group, 75) * 0.4;
  final raw = (local - start) / duration;
  if (raw < 0 || raw > 1) {
    return (angle: 0, active: false, progress: raw.clamp(0.0, 1.0));
  }
  final turn = _personalityTrack(raw, const [
    (0.00, 0.00),
    (0.12, 0.03),
    (0.33, 0.25),
    (0.52, 0.50),
    (0.65, 0.50),
    (0.84, 0.76),
    (1.00, 1.00),
  ]);
  final direction = _personalityBits(seed, group, 76).isEven ? 1.0 : -1.0;
  return (
    angle: direction * math.pi * 2 * turn,
    active: true,
    progress: raw.clamp(0.0, 1.0),
  );
}

/// Minimum horizontal travel that should win over a tap-to-open gesture.
const slopToonRotationDragThreshold = 5.0;

/// Fraction of the visible stage a finger travels for one complete turn.
/// 0.62 keeps the character directly controllable with a thumb on a phone
/// without making small tap jitter fling it through a side view.
const slopToonRotationDragRevolutionFraction = 0.62;

/// Whether one pointer delta is an intentional turn rather than tap jitter or
/// vertical page scrolling.
bool slopToonIsMeaningfulHorizontalDrag(
  Offset delta, {
  double threshold = slopToonRotationDragThreshold,
}) {
  if (!delta.dx.isFinite || !delta.dy.isFinite || !threshold.isFinite) {
    return false;
  }
  final minimum = math.max(0.0, threshold);
  return delta.dx.abs() >= minimum && delta.dx.abs() > delta.dy.abs() * 1.02;
}

/// Converts direct horizontal travel into one continuous orientation.
///
/// A comfortable thumb sweep across 62% of the stage produces one full turn.
/// The result is normalized at the 0/2pi seam, so painter-based Studio anatomy
/// and the standalone widget use exactly the same interaction math.
double slopToonOrientationAfterHorizontalDrag({
  required double startingAngle,
  required double deltaX,
  required double stageWidth,
  bool reducedMotion = false,
}) {
  // Reduced Motion disables autonomous turns and animated return—not direct
  // spatial manipulation. Explicit drag remains an immediate finger-following
  // orientation change with no inertial continuation.
  final width = stageWidth.isFinite ? stageWidth.abs() : 0.0;
  final delta = deltaX.isFinite ? deltaX : 0.0;
  if (width < 1) return slopToonNormalizeOrientation(startingAngle);
  return slopToonNormalizeOrientation(
    startingAngle +
        delta / (width * slopToonRotationDragRevolutionFraction) * math.pi * 2,
  );
}

/// Short accessibility value for the same radians-based orientation consumed
/// by the painter. Keeping this pure lets live semantics and visual tests
/// verify they describe the exact same sampled frame.
String slopToonOrientationSemanticValueFor(double angle) {
  final degrees = slopToonNormalizeOrientation(angle) * 180 / math.pi;
  if (degrees.abs() < 23) return 'Front view';
  if (degrees.abs() > 157) return 'Back view';
  return degrees > 0 ? 'Right side view' : 'Left side view';
}

double _smootherStep(double value) {
  final t = value.clamp(0.0, 1.0);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

double _personalityLerp(double from, double to, double t) =>
    from + (to - from) * t;

({int index, double progress}) _personalityBeatAt(
  double elapsedSeconds,
  int seed,
) {
  final safe = elapsedSeconds.isFinite ? math.max(0.0, elapsedSeconds) : 0.0;
  // Each pair has an exact total, so locating an arbitrarily late sample is
  // O(1). The seeded split makes its two beats variable (2.1–4.3 seconds)
  // without eventually falling back to a finite shuffled deck. The previous
  // 3.4–6.0 second range spent too long near the zero-velocity ends of the
  // smoother-step curve and read as low frame-rate motion on compact profiles.
  final pair = (safe / _slopToonPersonalityPairSeconds).floor();
  final local = safe - pair * _slopToonPersonalityPairSeconds;
  final firstDuration = 2.1 + _personalityUnit(seed, pair, 29) * 1.6;
  if (local < firstDuration) {
    return (index: pair * 2, progress: local / firstDuration);
  }
  final secondDuration = _slopToonPersonalityPairSeconds - firstDuration;
  return (
    index: pair * 2 + 1,
    progress: (local - firstDuration) / secondDuration,
  );
}

/// Small look-and-hold glances use the existing monotonic personality clock.
/// Variable holds and a short eased arrival feel observant, without a pupil
/// orbit or an extra ticker. No movement is authored for reduced motion.
Offset slopToonIdleGazeFor({
  required double elapsedSeconds,
  required int seed,
  bool reducedMotion = false,
}) {
  if (reducedMotion) return Offset.zero;
  final beat = _personalityBeatAt(elapsedSeconds, seed ^ 0x61AD);
  Offset target(int index) {
    final centered = _personalityBits(seed, index, 63) % 4 == 0;
    return Offset(
      _personalitySigned(seed, index, 64) * (centered ? .10 : .60),
      _personalitySigned(seed, index, 65) * (centered ? .05 : .27),
    );
  }

  final from = target(beat.index), to = target(beat.index + 1);
  // Hold the previous interest, then travel for roughly half a second.
  final arrival = _smootherStep((beat.progress - .69) / .22);
  return Offset.lerp(from, to, arrival)!;
}

_SlopToonPersonalityTarget _personalityTargetFor(int seed, int index) {
  final variation = _personalitySigned(seed, index, 2);
  final vertical = _personalitySigned(seed, index, 3);
  final kind = _personalityBits(seed, index, 1) % 10;
  // These are authored attitudes, not independent random channels. A beat
  // reads as a glance, a curious lift, or a calm centre hold, and every trait
  // remains attached to the same shared turn.
  return switch (kind) {
    0 || 1 => (
      turn: variation * 0.08,
      gazeX: variation * 0.14,
      gazeY: vertical * 0.08,
      lean: variation * 0.004,
      travel: variation * 0.006,
      faceX: variation * 0.010,
      faceY: vertical * 0.003,
      faceTilt: variation * 0.003,
    ),
    2 || 3 => (
      turn: 0.48 + variation * 0.25,
      gazeX: 0.48 + variation * 0.18,
      gazeY: vertical * 0.12,
      lean: 0.008 + variation * 0.004,
      travel: 0.030 + variation * 0.014,
      faceX: 0.074 + variation * 0.026,
      faceY: vertical * 0.004,
      faceTilt: -0.006 + variation * 0.003,
    ),
    4 || 5 => (
      turn: -0.48 + variation * 0.25,
      gazeX: -0.48 + variation * 0.18,
      gazeY: vertical * 0.12,
      lean: -0.008 + variation * 0.004,
      travel: -0.025 + variation * 0.012,
      faceX: -0.074 + variation * 0.026,
      faceY: vertical * 0.004,
      faceTilt: 0.006 + variation * 0.003,
    ),
    6 => (
      turn: variation * 0.32,
      gazeX: variation * 0.30,
      gazeY: -0.34 + vertical * 0.08,
      lean: variation * 0.007,
      travel: variation * 0.018,
      faceX: variation * 0.044,
      faceY: -0.008,
      faceTilt: variation * -0.010,
    ),
    7 => (
      turn: variation * 0.22,
      gazeX: variation * 0.24,
      gazeY: 0.22 + vertical * 0.07,
      lean: variation * 0.005,
      travel: variation * 0.012,
      faceX: variation * 0.032,
      faceY: 0.006,
      faceTilt: variation * 0.006,
    ),
    8 => (
      turn: 0.24 + variation * 0.20,
      gazeX: 0.30 + variation * 0.16,
      gazeY: -0.20 + vertical * 0.08,
      lean: 0.006 + variation * 0.004,
      travel: 0.018 + variation * 0.010,
      faceX: 0.046 + variation * 0.020,
      faceY: -0.006,
      faceTilt: -0.008 + variation * 0.004,
    ),
    _ => (
      turn: -0.18 + variation * 0.16,
      gazeX: -0.24 + variation * 0.14,
      gazeY: -0.10 + vertical * 0.10,
      lean: -0.004 + variation * 0.003,
      travel: -0.012 + variation * 0.008,
      faceX: -0.034 + variation * 0.018,
      faceY: -0.003,
      faceTilt: 0.006 + variation * 0.003,
    ),
  };
}

_SlopToonPersonalityTarget _blendPersonalityTargets(
  _SlopToonPersonalityTarget from,
  _SlopToonPersonalityTarget to,
  double t,
) => (
  turn: _personalityLerp(from.turn, to.turn, t),
  gazeX: _personalityLerp(from.gazeX, to.gazeX, t),
  gazeY: _personalityLerp(from.gazeY, to.gazeY, t),
  lean: _personalityLerp(from.lean, to.lean, t),
  travel: _personalityLerp(from.travel, to.travel, t),
  faceX: _personalityLerp(from.faceX, to.faceX, t),
  faceY: _personalityLerp(from.faceY, to.faceY, t),
  faceTilt: _personalityLerp(from.faceTilt, to.faceTilt, t),
);

Offset _boundedToonOffset(Offset value) {
  final safe = Offset(
    value.dx.isFinite ? value.dx : 0,
    value.dy.isFinite ? value.dy : 0,
  );
  final length = safe.distance;
  if (length <= 1 || length == 0) return safe;
  return safe / length;
}

double _finiteUnit(double value) {
  if (!value.isFinite) return 0;
  return value.clamp(0.0, 1.0);
}

double _authoredToonLoop(double phase, List<(double time, double value)> keys) {
  final wrapped = phase.isFinite ? phase - phase.floorToDouble() : 0.0;
  for (var index = 0; index < keys.length - 1; index++) {
    final from = keys[index];
    final to = keys[index + 1];
    if (wrapped > to.$1) continue;
    final span = to.$1 - from.$1;
    final raw = span <= 0 ? 0.0 : (wrapped - from.$1) / span;
    final t = raw.clamp(0.0, 1.0);
    final smooth = t * t * (3 - 2 * t);
    return from.$2 + (to.$2 - from.$2) * smooth;
  }
  return keys.last.$2;
}

const _slopToonBodyTravelKeys = <(double, double)>[
  (0.00, 0.000),
  (0.10, 0.040),
  (0.24, 0.115),
  (0.38, 0.095),
  (0.55, 0.005),
  (0.70, -0.068),
  (0.84, -0.050),
  (1.00, 0.000),
];

const _slopToonFaceTravelKeys = <(double, double)>[
  (0.00, 0.000),
  (0.10, 0.110),
  (0.24, 0.200),
  (0.39, 0.140),
  (0.55, -0.035),
  (0.69, -0.200),
  (0.84, -0.130),
  (1.00, 0.000),
];

/// Authored lateral travel in local body widths for a normalized idle phase.
///
/// The rightward exploration is deliberately broader than the return to the
/// left, matching the reference performance rather than mirroring a sine wave.
({double body, double face}) slopToonIdleTravelFor(double phase) => (
  body: _authoredToonLoop(phase, _slopToonBodyTravelKeys),
  face: _authoredToonLoop(phase, _slopToonFaceTravelKeys),
);

/// The large Buddy stage leaves crown, aura, travel, and contact-shadow room.
///
/// Classic and Square keep the dominant reference scale. Tall is fitted by
/// height rather than becoming a clipped giant, Wide reserves lateral travel,
/// and the exceptionally broad Idea Wizard is the only hat that caps the
/// presentation at 60% stage width.
Rect slopToonPresentationRectFor(
  Size size, {
  SlopLook look = const SlopLook(),
}) {
  final base = switch (look.body) {
    SlopBody.classic ||
    SlopBody.triangle ||
    SlopBody.ghost ||
    SlopBody.cloud ||
    SlopBody.star ||
    SlopBody.droplet ||
    SlopBody.heart => (width: 0.70, height: 0.710, centerY: 0.555),
    SlopBody.tall => (width: 0.70, height: 0.710, centerY: 0.555),
    SlopBody.wide ||
    SlopBody.capsule => (width: 0.63, height: 0.710, centerY: 0.555),
  };
  final oversizedHat = look.hat == SlopHat.ideaWizard;
  final width = oversizedHat ? math.min(base.width, 0.60) : base.width;
  final proportionalHeight = base.height * width / base.width;
  return Rect.fromCenter(
    center: Offset(size.width * 0.5, size.height * base.centerY),
    width: size.width * width,
    height: size.height * proportionalHeight,
  );
}

/// Peripheral aura fit for the dominant standalone Buddy stage.
///
/// The body and worn cosmetics keep their full reference-scale silhouette.
/// Only the widest orbiting particles are drawn slightly closer to the Slop,
/// which preserves the equipped effect without shrinking the hero character.
({double x, double y}) slopToonAmbientScaleFor(SlopLook look) =>
    switch (look.aura) {
      SlopAura.portal => (x: 0.78, y: 0.88),
      SlopAura.ribbonTrail => (x: 0.82, y: 0.90),
      SlopAura.lightning => (x: 0.86, y: 0.90),
      SlopAura.stardust => (x: 0.84, y: 0.88),
      SlopAura.orbit => (x: 0.80, y: 0.88),
      SlopAura.sloplings => (x: 0.70, y: 0.80),
      SlopAura.ideaComets => (x: 0.78, y: 0.86),
      // These effects attach to the real shoulders/silhouette. Scaling the
      // whole aura pulls them underneath the opaque body and hides the owned
      // trait; their painter instead bounds the outward wave/echo distance.
      SlopAura.soundRings ||
      SlopAura.echoTrail ||
      SlopAura.dewdrops ||
      SlopAura.moonMotes => (x: 1.0, y: 1.0),
      SlopAura.none => (x: 1.0, y: 1.0),
      // Every remaining ambient is deliberately kept inside the stage's
      // interaction boundary at its widest side/back orientation. The aura
      // still uses full authored particles; only the orbit radius tightens.
      _ => (x: 0.88, y: 0.92),
    };

/// Resolves the planted, spring-driven pose for a normalized animation frame.
///
/// [phase] wraps, while [reaction] is a one-shot 0→1 gesture clock. [drag] is
/// normalized to the character bounds. The base never needs a compensating
/// vertical translation because [scaleY] is applied around the floor contact
/// point by [_SlopToonPainter]. This is a supported production helper for
/// composers such as Studio that need the same deterministic pose while
/// keeping external mouth anatomy registered.
SlopToonFrame slopToonFrameFor({
  required double phase,
  double reaction = 0,
  Offset drag = Offset.zero,
  bool talking = false,
  bool reducedMotion = false,
}) {
  final pointer = _boundedToonOffset(drag);
  if (reducedMotion) {
    // Direct manipulation remains legible without autonomous or spring
    // movement. Gaze is a positional response rather than vestibular motion.
    return (
      scaleX: 1,
      scaleY: 1,
      lean: pointer.dx * 0.035,
      leanStrength: pointer.dx.abs() * 0.10,
      bodyTravel: 0,
      verticalLift: 0,
      turn: 0,
      faceLag: Offset(-pointer.dx * 0.006, -pointer.dy * 0.004),
      livingGaze: pointer,
      faceTilt: 0,
      shadowScale: 1,
      shadowOpacity: 1,
    );
  }

  final wrapped = phase.isFinite ? phase - phase.floorToDouble() : 0.0;
  final theta = wrapped * math.pi * 2;
  final primary = math.sin(theta);
  final secondary = math.sin(theta * 2 + 0.72);
  final r = _finiteUnit(reaction);
  final travel = slopToonIdleTravelFor(wrapped);

  // Four diminishing lobes give a quick compression, one readable overshoot,
  // then a quiet settle. Multiplying by (1-r) guarantees an exact rest frame.
  final spring = math.sin(r * math.pi * 4) * math.exp(-r * 2.1) * (1 - r);
  final impact = math.sin(r * math.pi).clamp(0.0, 1.0);
  final talkPulse = talking ? math.sin(theta * 7).abs() : 0.0;
  final dragWeight = pointer.distance;

  final lean = (pointer.dx * 0.095 + primary * 0.020 + spring * 0.015).clamp(
    -0.15,
    0.15,
  );
  final squash = impact * 0.075 - spring * 0.030 + talkPulse * 0.010;
  final breath = primary * 0.012 + secondary * 0.004;
  final scaleX = (1 + breath + squash + dragWeight * 0.018).clamp(0.90, 1.13);
  final scaleY = (1 - breath * 0.72 - squash * 0.82 + spring * 0.020).clamp(
    0.87,
    1.12,
  );

  // The features trail the heavy gel body by a few percent, as if painted on
  // a surface with inertia, while the pupil still tracks the interaction.
  final turn = (travel.face / 0.20 + pointer.dx * 0.42 + spring * 0.05).clamp(
    -1.0,
    1.0,
  );
  final faceLag = Offset(
    travel.face - pointer.dx * 0.016 - spring * 0.010,
    pointer.dy * 0.016 - spring * 0.014 - secondary * 0.003,
  );
  final livingGaze = _boundedToonOffset(
    Offset(pointer.dx + primary * 0.12, pointer.dy + secondary * 0.055),
  );

  return (
    scaleX: scaleX,
    scaleY: scaleY,
    lean: lean,
    leanStrength: (lean.abs() * 4.8 + dragWeight * 0.16).clamp(0.0, 0.72),
    bodyTravel: travel.body,
    verticalLift: -math.max(0.0, spring) * 0.020,
    turn: turn,
    faceLag: faceLag,
    livingGaze: livingGaze,
    faceTilt: (-lean * 0.34 + secondary * 0.004).clamp(-0.055, 0.055),
    shadowScale: (scaleX + dragWeight * 0.035).clamp(0.88, 1.18),
    shadowOpacity: (1 - math.max(0.0, spring) * 0.22).clamp(0.72, 1.0),
  );
}

/// Samples Slop's smooth, seeded, non-obvious idle performance.
///
/// The source is deliberately pure and unbounded: there is no timer-created
/// jitter, finite shuffled deck, or short modulo loop. Adjacent variable-length
/// beats meet at exact zero velocity through quintic interpolation, while the
/// slower independent breath waves keep holds from becoming dead still.
SlopToonPersonalitySample slopToonPersonalityFrameFor({
  required double elapsedSeconds,
  required int seed,
  double reaction = 0,
  Offset drag = Offset.zero,
  bool talking = false,
  bool reducedMotion = false,
}) {
  final pointer = _boundedToonOffset(drag);
  if (reducedMotion) {
    return (
      phase: 0,
      frame: slopToonFrameFor(
        phase: 0,
        reaction: 0,
        drag: pointer,
        talking: false,
        reducedMotion: true,
      ),
      expression: SlopToonExpression.neutral,
      smilePulse: 0,
      beatIndex: 0,
      beatProgress: 0,
      orientationAngle: 0,
      fullTurnActive: false,
    );
  }

  final seconds = elapsedSeconds.isFinite ? math.max(0.0, elapsedSeconds) : 0.0;
  final beat = _personalityBeatAt(seconds, seed);
  final from = _personalityTargetFor(seed, beat.index);
  final to = _personalityTargetFor(seed, beat.index + 1);
  final blend = _smootherStep(beat.progress);
  final target = _blendPersonalityTargets(from, to, blend);

  // Irrationally related slow clocks avoid a shared, visible reset. They are
  // intentionally tiny and remain planted because only scale around the floor
  // contact changes. The canonical phase similarly advances continuously
  // across beat boundaries instead of snapping per gesture.
  final breathA = math.sin(seconds * 0.91 + seed * 0.000071);
  final breathB = math.sin(seconds * 0.417 + seed * 0.000113 + 1.37);
  final breath = breathA * 0.009 + breathB * 0.0035;
  // Smoother-step gives authored glances a soft arrival, but its exact
  // zero-velocity endpoints can make a small portrait appear frozen for
  // several frames. Two quiet, irrationally-related body clocks keep every
  // displayed frame alive while preserving the larger seeded gesture. The
  // same channels feed turn, body, face, and gaze so traits remain one 2.5D
  // object instead of independently drifting stickers.
  final lifeA = math.sin(seconds * 1.17 + seed * 0.000091 + 0.41);
  final lifeB = math.sin(seconds * 0.536 + seed * 0.000137 + 2.03);
  final livingTurn = lifeA * 0.072 + lifeB * 0.032;
  final livingTravel = lifeA * 0.0048 + lifeB * 0.0022;
  final livingLean = lifeA * 0.0032 + lifeB * 0.0014;
  final livingFaceX = lifeA * 0.010 + lifeB * 0.004;
  final r = _finiteUnit(reaction);
  final spring = math.sin(r * math.pi * 4) * math.exp(-r * 2.1) * (1 - r);
  final impact = math.sin(r * math.pi).clamp(0.0, 1.0);
  final talkPulse = talking
      ? math.sin(seconds * 8.7 + seed * 0.000021).abs()
      : 0.0;
  final dragWeight = pointer.distance;

  final lean = (target.lean + livingLean + pointer.dx * 0.095 + spring * 0.015)
      .clamp(-0.15, 0.15);
  final squash = impact * 0.075 - spring * 0.030 + talkPulse * 0.010;
  final scaleX = (1 + breath + squash + dragWeight * 0.018).clamp(0.90, 1.13);
  final scaleY = (1 - breath * 0.72 - squash * 0.82 + spring * 0.020).clamp(
    0.87,
    1.12,
  );
  final idleGaze = slopToonIdleGazeFor(elapsedSeconds: seconds, seed: seed);
  final livingGaze = _boundedToonOffset(
    Offset(
      pointer.dx + target.gazeX * .35 + idleGaze.dx,
      pointer.dy +
          target.gazeY * .35 +
          idleGaze.dy +
          lifeA * 0.026 +
          lifeB * 0.012 +
          breathB * 0.018,
    ),
  );
  final turn = (target.turn + livingTurn + pointer.dx * 0.42 + spring * 0.05)
      .clamp(-1.0, 1.0);

  final frame = (
    scaleX: scaleX,
    scaleY: scaleY,
    lean: lean,
    leanStrength: (lean.abs() * 4.8 + dragWeight * 0.16).clamp(0.0, 0.72),
    bodyTravel: (target.travel + livingTravel).clamp(-0.068, 0.115),
    verticalLift: -math.max(0.0, spring) * 0.020,
    turn: turn,
    faceLag: Offset(
      target.faceX + livingFaceX - pointer.dx * 0.016 - spring * 0.010,
      target.faceY + pointer.dy * 0.016 - spring * 0.014,
    ),
    livingGaze: livingGaze,
    faceTilt: (target.faceTilt - lean * 0.34).clamp(-0.055, 0.055),
    shadowScale: (scaleX + dragWeight * 0.035).clamp(0.88, 1.18),
    shadowOpacity: (1 - math.max(0.0, spring) * 0.22).clamp(0.72, 1.0),
  );

  // A smile is a sparse authored beat, not a fixed spot in a short loop. The
  // curve starts and ends with zero velocity so the expression eases in/out.
  final smileBeat = _personalityBits(seed, beat.index, 41) % 7 == 0;
  final smilePulse = smileBeat
      ? math.pow(math.sin(beat.progress * math.pi), 2).toDouble()
      : 0.0;
  final expression = smilePulse > 0.08
      ? SlopToonExpression.happySmile
      : SlopToonExpression.neutral;

  final orientation = slopToonOrientationFrameFor(
    elapsedSeconds: seconds,
    seed: seed,
  );
  // The broad event owns complete orientation while the normal glance clock
  // contributes a small living cheek turn. At 0/2pi the full event disappears
  // into the same shallow pose instead of snapping to a dead front frame.
  final orientationAngle = slopToonNormalizeOrientation(
    orientation.angle + frame.turn * 0.42,
  );

  // Keep the renderer's blinks and material/aura clocks alive without a
  // metronomic 9.6-second reset. The small quasiperiodic time warp has a
  // strictly positive derivative, so it varies blink spacing without ever
  // reversing an orbit, flame, or flowing material.
  final clockOffset = (seed & 0xFFFF) / 65536.0;
  final phaseClock =
      seconds / 6.4 +
      math.sin(seconds * 0.37 + clockOffset * 5.1) * 0.052 +
      math.sin(seconds * 0.163 + clockOffset * 2.7) * 0.031 +
      clockOffset;
  final phase = phaseClock - phaseClock.floorToDouble();
  return (
    phase: phase,
    frame: frame,
    expression: expression,
    smilePulse: smilePulse,
    beatIndex: beat.index,
    beatProgress: beat.progress.clamp(0.0, 1.0),
    orientationAngle: orientationAngle,
    fullTurnActive: orientation.active,
  );
}

/// Paint-level 2.5D adapter for surfaces that already own a [CustomPainter].
///
/// Studio's mouth choreography can call this in the same canvas and with the
/// same [rect] it currently gives [SlopRenderer]. The canonical renderer still
/// owns every cosmetic pixel; this adapter only adds the planted transform,
/// split face inertia, floor contact, and toon separation.
@visibleForTesting
SlopToonDepthPose slopToonResolvedDepthPoseFor({
  required SlopToonFrame frame,
  double? orientationAngle,
  SlopToonDepthPose? depthPose,
  bool reducedMotion = false,
}) {
  if (depthPose != null) return depthPose;
  if (orientationAngle != null) {
    // An explicit angle is a static presentation state, not autonomous
    // motion. Reduced Motion must stop clocks and animated returns, but it
    // must not erase the side/back view the user deliberately selected.
    return slopToonDepthPoseForAngle(angle: orientationAngle);
  }
  return slopToonDepthPoseFor(turn: frame.turn, reducedMotion: reducedMotion);
}

abstract final class SlopToonRenderer {
  static void paint(
    Canvas canvas, {
    required Rect rect,
    required SlopLook look,
    required SlopEmotion emotion,
    double round = 0,
    double phase = 0,
    double? performancePhase,
    double? facePhase,
    SlopToonExpression? expression,
    double reaction = 0,
    Offset gaze = Offset.zero,
    Offset interaction = Offset.zero,
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
    double ambientScaleX = 1,
    double ambientScaleY = 1,
    double bodyRimOpacity = 1,
    bool showBody = true,
    bool showFace = true,
    bool showMouth = true,
    double mouthOpacity = 1,
    bool centerFaceHorizontally = false,
    Color? facialLineColor,
    bool reducedMotion = false,
    bool preserveGeometry = false,
    bool preserveShadowMotion = false,
    SlopToonFrame? frame,
    double? orientationAngle,
    SlopToonDepthPose? depthPose,
    SlopToonPartsAtlas? partsAtlas,
  }) {
    look = slopLookWithCurrentChampion(look);
    final atlas = partsAtlas ?? SlopToonPartsAtlas.shared;
    final expressionFrame = expression == null
        ? null
        : slopToonExpressionFrameFor(
            phase: performancePhase ?? facePhase ?? phase,
            state: expression,
            reducedMotion: facePhase == null && reducedMotion,
          );
    final effectiveEmotion = expressionFrame?.emotion ?? emotion;
    final effectiveTalk = math.max(talk, expressionFrame?.talk ?? 0);
    final effectiveShowMouth =
        showMouth && (expressionFrame?.showMouth ?? true);
    final animatedPose =
        frame ??
        slopToonFrameFor(
          // Surface travel gets a slower authored clock in Studio while
          // canonical blink, material, aura, and body timing keeps [phase].
          phase: performancePhase ?? phase,
          reaction: reaction,
          drag: interaction,
          talking: effectiveTalk > 0.001,
          reducedMotion: reducedMotion,
        );
    final geometryPose = preserveGeometry
        ? (
            scaleX: 1.0,
            scaleY: 1.0,
            lean: 0.0,
            leanStrength: 0.0,
            bodyTravel: 0.0,
            verticalLift: 0.0,
            turn: animatedPose.turn,
            // The mouth composer can let the visible eye/accessory travel
            // across the surface while its body/tongue geometry stays exact.
            // Once the saved mouth returns, all facial geometry is locked so
            // the mouth and external cavity cannot separate.
            faceLag: effectiveShowMouth ? Offset.zero : animatedPose.faceLag,
            livingGaze: animatedPose.livingGaze,
            faceTilt: effectiveShowMouth ? 0.0 : animatedPose.faceTilt,
            shadowScale: 1.0,
            shadowOpacity: 1.0,
          )
        : animatedPose;
    final pose = preserveGeometry && preserveShadowMotion
        ? (
            scaleX: geometryPose.scaleX,
            scaleY: geometryPose.scaleY,
            lean: geometryPose.lean,
            leanStrength: geometryPose.leanStrength,
            bodyTravel: geometryPose.bodyTravel,
            verticalLift: geometryPose.verticalLift,
            turn: geometryPose.turn,
            faceLag: geometryPose.faceLag,
            livingGaze: geometryPose.livingGaze,
            faceTilt: geometryPose.faceTilt,
            shadowScale: animatedPose.shadowScale,
            shadowOpacity: animatedPose.shadowOpacity,
          )
        : geometryPose;
    final bodyBounds = slopRestingBodyRectFor(
      rect,
      body: look.body,
      round: round,
    );
    final bodyTravel =
        pose.bodyTravel *
        bodyBounds.width *
        (reimaginedCharactersEnabled ? .72 : 1);
    final transformAnchor = Offset(
      bodyBounds.center.dx + pose.lean * bodyBounds.width * 0.18,
      bodyBounds.bottom,
    );
    final floor = transformAnchor.translate(bodyTravel, 0);
    final effectiveGaze = _boundedToonOffset(gaze + pose.livingGaze);
    final canonicalReaction = preserveGeometry ? reaction : 0.0;
    final sharedDepthPose = slopToonResolvedDepthPoseFor(
      frame: pose,
      orientationAngle: orientationAngle,
      depthPose: depthPose,
      reducedMotion: reducedMotion,
    );

    // A caller-authored shift always wins. Otherwise lean the actual liquid
    // outline rather than rotating a flat sprite, which creates the asymmetric
    // crown and side bulges seen in the reference performance.
    final internalShift =
        shift ?? (pose.leanStrength > 0.025 ? SlopShift.lean : null);
    final internalShiftT = shift == null && internalShift != null
        ? math.asin(pose.leanStrength.clamp(0.0, 0.92)) / math.pi
        : shiftT;

    void paintCanonical({
      required bool body,
      required bool face,
      required bool mouth,
      required bool headwear,
      required bool effects,
      SlopAuraDepthPass auraDepthPass = SlopAuraDepthPass.all,
      SlopHeadwearDepthPass headwearDepthPass = SlopHeadwearDepthPass.all,
    }) {
      SlopRenderer.paint(
        canvas,
        rect: rect,
        look: look,
        emotion: effectiveEmotion,
        round: round,
        phase: face ? facePhase ?? phase : phase,
        reaction: canonicalReaction,
        gaze: effectiveGaze,
        talk: effectiveTalk,
        smirk: reducedMotion ? 0 : smirk,
        faceAnchor: faceAnchor,
        faceScale: faceScale,
        opacity: opacity,
        shift: internalShift,
        shiftT: internalShiftT,
        shiftStrength: shiftStrength,
        hat: headwear,
        shadow: false,
        ambient: effects,
        bodyRimOpacity: bodyRimOpacity,
        showBody: body,
        showFace: face,
        showMouth: mouth,
        mouthOpacity: mouthOpacity,
        centerFaceHorizontally: centerFaceHorizontally,
        facialLineColor: facialLineColor,
        surfaceStyle: body ? SlopSurfaceStyle.toon : SlopSurfaceStyle.standard,
        depthPose: sharedDepthPose,
        auraDepthPass: auraDepthPass,
        headwearDepthPass: headwearDepthPass,
      );
    }

    void paintAmbient(SlopAuraDepthPass depthPass) {
      final auraScaleX = ambientScaleX.clamp(0.1, 1.0);
      final auraScaleY = ambientScaleY.clamp(0.1, 1.0);
      canvas.save();
      canvas.translate(bodyBounds.center.dx, bodyBounds.center.dy);
      canvas.scale(auraScaleX, auraScaleY);
      canvas.translate(-bodyBounds.center.dx, -bodyBounds.center.dy);
      paintCanonical(
        body: false,
        face: false,
        mouth: false,
        headwear: false,
        effects: true,
        auraDepthPass: depthPass,
      );
      canvas.restore();
    }

    void paintFace() {
      // Repaint only the canonical face/accessory layer with a tiny opposing
      // translation and rotation. This is surface inertia, not a second face.
      final facePivot = Offset(
        bodyBounds.center.dx,
        bodyBounds.top + bodyBounds.height * faceAnchor,
      );
      // Once the face rounds the silhouette, independent front-plane inertia
      // would move it away from the body contour used by the canonical
      // profile clip. Ease that secondary motion out after the approved
      // three-quarter pose; the shared body transform continues to carry the
      // complete attached face around the volume.
      final profileDegrees =
          sharedDepthPose.orientationAngle.abs() * 180 / math.pi;
      final surfaceRaw = ((profileDegrees - 45) / 15).clamp(0.0, 1.0);
      final surfaceLock = surfaceRaw * surfaceRaw * (3 - 2 * surfaceRaw);
      final inertia =
          (1 - surfaceLock) * (reimaginedCharactersEnabled ? .28 : 1);
      canvas.save();
      canvas.translate(
        pose.faceLag.dx * bodyBounds.width * inertia,
        pose.faceLag.dy * bodyBounds.height * inertia,
      );
      canvas.translate(facePivot.dx, facePivot.dy);
      canvas.rotate(pose.faceTilt * inertia);
      canvas.translate(-facePivot.dx, -facePivot.dy);
      paintCanonical(
        body: false,
        face: true,
        mouth: effectiveShowMouth,
        headwear: false,
        effects: false,
      );
      canvas.restore();
    }

    void paintHeadwear(SlopHeadwearDepthPass depthPass) {
      if (!hat) return;
      paintCanonical(
        body: false,
        face: false,
        mouth: false,
        headwear: true,
        effects: false,
        headwearDepthPass: depthPass,
      );
    }

    if (shadow && showBody) {
      final key = SlopToonAtlasKey.forLook(
        layer: SlopToonPartLayer.contactShadow,
        look: look,
      );
      final cell = atlas.obtain(
        key,
        (cellCanvas) => _paintNormalizedContactShadow(cellCanvas, look: look),
      );
      _paintContactShadowCell(
        canvas,
        cell: cell,
        rect: rect,
        bodyBounds: bodyBounds,
        floor: floor,
        frame: pose,
        depthPose: sharedDepthPose,
      );
    }

    canvas.save();
    canvas.translate(bodyTravel, 0);
    canvas.translate(transformAnchor.dx, transformAnchor.dy);
    canvas.translate(pose.lean * bodyBounds.width * 0.10, 0);
    canvas.scale(pose.scaleX, pose.scaleY);
    canvas.translate(-transformAnchor.dx, -transformAnchor.dy);
    canvas.translate(0, pose.verticalLift * bodyBounds.height);

    // The compositor makes the truthful slot ordering explicit and testable
    // without flattening live geometry into a full-combination sprite.
    SlopToonPartsCompositor.paintPlan(
      atlas: atlas,
      paintLayer: (layer) {
        switch (layer) {
          case SlopToonPartLayer.contactShadow:
            break;
          case SlopToonPartLayer.ambientAuraRear:
            if (ambient) paintAmbient(SlopAuraDepthPass.rear);
            // Crown art is one rigid authored asset travelling around the
            // volume. On the rear hemisphere it must be painted before the
            // body so the gel naturally occludes its contact edge. A narrow
            // tangent blend prevents a one-frame z-order pop without ever
            // mirroring asymmetric hair.
            paintHeadwear(SlopHeadwearDepthPass.rear);
          case SlopToonPartLayer.bodyMaterialPattern:
            if (showBody) {
              paintCanonical(
                body: true,
                face: false,
                mouth: false,
                headwear: false,
                effects: false,
              );
            }
          case SlopToonPartLayer.authoredFace:
            if (showFace) paintFace();
          case SlopToonPartLayer.headwear:
            paintHeadwear(SlopHeadwearDepthPass.front);
          case SlopToonPartLayer.ambientAuraFront:
            if (ambient) paintAmbient(SlopAuraDepthPass.front);
        }
      },
    );
    canvas.restore();
  }

  static void _paintNormalizedContactShadow(
    Canvas canvas, {
    required SlopLook look,
  }) {
    const size = SlopToonAtlasKey.normalizedCellSize;
    const unit = 1.0;
    final shadowRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2 + unit * 1.2),
      width: size.width * 0.70,
      height: unit * 6.5,
    );
    canvas.drawOval(
      shadowRect.inflate(unit),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.20)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 3),
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: shadowRect.center.translate(0, -unit * 0.4),
        width: shadowRect.width * 0.58,
        height: unit * 3.1,
      ),
      Paint()
        ..color = look.palette.shade.withValues(alpha: 0.31)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 1.6),
    );
  }

  static void _paintContactShadowCell(
    Canvas canvas, {
    required SlopToonAtlasCell cell,
    required Rect rect,
    required Rect bodyBounds,
    required Offset floor,
    required SlopToonFrame frame,
    required SlopToonDepthPose depthPose,
  }) {
    final sourceCenter = Offset(
      cell.logicalBounds.center.dx,
      cell.logicalBounds.center.dy + 1.2,
    );
    final targetCenter = floor.translate(
      frame.lean * bodyBounds.width * 0.28,
      rect.width / 100 * 1.2,
    );
    canvas.save();
    canvas.translate(targetCenter.dx, targetCenter.dy);
    canvas.scale(
      bodyBounds.width / 100 * frame.shadowScale * depthPose.bodyScaleX,
      rect.width / 100,
    );
    if (frame.shadowOpacity < 1) {
      canvas.saveLayer(
        Rect.fromCenter(center: Offset.zero, width: 100, height: 100),
        Paint()..color = Colors.white.withValues(alpha: frame.shadowOpacity),
      );
    }
    cell.paint(canvas, offset: Offset(-sourceCenter.dx, -sourceCenter.dy));
    if (frame.shadowOpacity < 1) canvas.restore();
    canvas.restore();
  }
}

/// An interactive, reference-style 2.5D presentation of the canonical Slop.
///
/// This is intentionally a presentation layer, not another character model.
/// [SlopRenderer] still paints the exact [SlopLook], so every earned body,
/// material, pattern, aura, face, mouth, accessory, and headwear works here.
/// The wrapper adds planted deformation, face inertia, richer floor lighting,
/// and pointer interaction suitable for the large Buddy stage.
class SlopToonCharacter extends StatefulWidget {
  const SlopToonCharacter({
    super.key,
    this.size = 260,
    this.look,
    this.emotion = SlopEmotion.happy,
    this.expression,
    this.animated = true,
    this.talking = false,
    this.playfulMouth = false,
    this.gaze = Offset.zero,
    this.round = 0,
    this.faceAnchor = 0.44,
    this.faceScale = 1,
    this.showEffects = true,
    this.showMouth = true,
    this.facialLineColor,
    this.shift,
    this.shiftT = 0,
    this.phaseOverride,
    this.facePhaseOverride,
    this.orientationAngle,
    this.allowAutonomousFullTurns = true,
    this.autonomousShallowTurnScale = .42,
    this.rareAutonomousFullTurnDelay,
    this.rareAutonomousFullTurnTimeScale = .5,
    this.personalitySeed,
    this.reducedMotion,
    this.interactive = true,
    this.rotatable = false,
    this.showRotationHint = false,
    this.onOrientationChanged,
    this.onTap,
    this.onDragStart,
    this.onDragUpdate,
    this.onDragEnd,
    this.semanticLabel = 'Your interactive Slop Buddy',
    this.semanticHint,
  });

  final double size;

  /// When null, follows the locally equipped Slop live.
  final SlopLook? look;
  final SlopEmotion emotion;

  /// Optional authored attitude. When null, the wrapper chooses neutral,
  /// curious drag, delighted tap, and occasional deterministic smiles.
  final SlopToonExpression? expression;
  final bool animated;
  final bool talking;

  /// Allows a sparse seeded mouth-open beat while the Slop is idle. The saved
  /// mouth is never replaced; compatible mouths briefly reveal their existing
  /// tongue anatomy through the normal smooth talk morph.
  final bool playfulMouth;
  final Offset gaze;
  final double round;
  final double faceAnchor;
  final double faceScale;
  final bool showEffects;
  final bool showMouth;

  /// Optional surface-specific contrast for brows and mouth linework.
  ///
  /// Profile habitats use this for very deep materials while every eye,
  /// pupil, mouth, and cosmetic remains authored by [look]. Null preserves the
  /// canonical toon presentation exactly.
  final Color? facialLineColor;
  final SlopShift? shift;
  final double shiftT;

  /// Freezes the living clock at an exact normalized frame when supplied.
  /// Useful for coordinated Studio choreography and deterministic captures.
  final double? phaseOverride;
  /// Optional native face clock for a stationary body presentation.
  final double? facePhaseOverride;

  /// Optional radians-based front/side/back orientation. When null, the
  /// seeded personality supplies rare complete turns. Callers that own a
  /// mouth morph can front-lock their value with
  /// [slopToonFrontLockAngleFor] before passing it here.
  final double? orientationAngle;

  /// Whether idle personality may complete a full 360-degree turn.
  ///
  /// Feed ribbons disable this so a newly revealed creator always arrives
  /// face-first and then explores only a shallow three-quarter pose. Profile
  /// and Workshop stages keep the complete authored turn by default.
  final bool allowAutonomousFullTurns;

  /// Strength of the small front-facing cheek turn used when full automatic
  /// rotation is disabled. Feed cards can show a little more 3D depth without
  /// revealing a back-facing character as soon as the card arrives.
  final double autonomousShallowTurnScale;

  /// Opt-in delayed full turns for surfaces that normally stay face-first.
  /// The delay protects swipe arrival; [rareAutonomousFullTurnTimeScale]
  /// stretches the seeded schedule so the complete turn stays exceptional.
  final Duration? rareAutonomousFullTurnDelay;
  final double rareAutonomousFullTurnTimeScale;

  /// Stable seed for this Slop's temperament. Supplying an account-derived
  /// seed keeps personality unchanged while the user changes clothes. When
  /// null, a process-stable seed is derived from the equipped [look].
  final int? personalitySeed;

  /// Overrides the platform accessibility preference when non-null.
  final bool? reducedMotion;

  /// Whether pointer gestures can poke and drag the gel performance.
  ///
  /// Read-only/profile-preview surfaces can keep the autonomous look-around,
  /// blink, and smile while leaving their parent scroll and navigation gesture
  /// map untouched.
  final bool interactive;

  /// Enables direct horizontal 360-degree rotation.
  ///
  /// On read-only profile surfaces this installs only a horizontal recognizer,
  /// so vertical drags remain owned by the surrounding game shelf.
  final bool rotatable;

  /// Visible guidance for portraits whose surrounding screen has no turn cue.
  /// It uses the empty space below the contact shadow, without resizing Slop.
  final bool showRotationHint;
  final ValueChanged<double>? onOrientationChanged;
  final VoidCallback? onTap;
  final GestureDragStartCallback? onDragStart;
  final GestureDragUpdateCallback? onDragUpdate;
  final GestureDragEndCallback? onDragEnd;
  final String semanticLabel;
  final String? semanticHint;

  @override
  State<SlopToonCharacter> createState() => _SlopToonCharacterState();
}

class _SlopToonCharacterState extends State<SlopToonCharacter>
    with TickerProviderStateMixin {
  late final Ticker _personalityTicker = createTicker(_tickPersonality);
  final ValueNotifier<double> _personalityClock = ValueNotifier(0);
  late final AnimationController _reaction = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 920),
  );
  late final AnimationController _return = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 760),
  );

  Offset _directDrag = Offset.zero;
  Offset _returnFrom = Offset.zero;
  bool _dragging = false;
  bool _reduceMotion = false;
  bool _tickerModeEnabled = true;
  Duration? _previousPersonalityTick;
  double _manualOrientationOffset = 0;
  double _rotationStartOffset = 0;
  double _rotationStartX = 0;

  bool get _shouldIdle =>
      widget.animated &&
      widget.phaseOverride == null &&
      !_reduceMotion &&
      _tickerModeEnabled;

  Offset get _effectiveDrag {
    if (_dragging) return _directDrag;
    if (_return.value >= 1) return Offset.zero;
    final eased = Curves.easeOutBack.transform(_return.value);
    return Offset.lerp(_returnFrom, Offset.zero, eased) ?? Offset.zero;
  }

  @override
  void initState() {
    super.initState();
    _return.value = 1;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next =
        widget.reducedMotion ?? MediaQuery.disableAnimationsOf(context);
    if (_reduceMotion != next) _reduceMotion = next;
    _tickerModeEnabled = TickerMode.valuesOf(context).enabled;
    _syncIdle();
  }

  @override
  void didUpdateWidget(covariant SlopToonCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.reducedMotion != oldWidget.reducedMotion) {
      _reduceMotion =
          widget.reducedMotion ?? MediaQuery.disableAnimationsOf(context);
    }
    _syncIdle();
  }

  void _syncIdle() {
    if (_shouldIdle && !_personalityTicker.isActive) {
      // A Ticker's elapsed time restarts each time it starts. Clearing this
      // checkpoint means pause/resume never adds the wall-clock pause as one
      // giant animation delta.
      _previousPersonalityTick = null;
      _personalityTicker.start();
    } else if (!_shouldIdle && _personalityTicker.isActive) {
      _personalityTicker.stop();
      _previousPersonalityTick = null;
    }
  }

  void _tickPersonality(Duration elapsed) {
    final previous = _previousPersonalityTick;
    _previousPersonalityTick = elapsed;
    if (previous == null) return;
    final delta = elapsed - previous;
    if (delta <= Duration.zero) return;
    _personalityClock.value += delta.inMicroseconds / 1000000;
  }

  Offset _dragFor(Offset localPosition) {
    final center = Offset(widget.size / 2, widget.size / 2);
    final radius = math.max(1.0, widget.size * 0.42);
    return _boundedToonOffset((localPosition - center) / radius);
  }

  void _startReaction() {
    if (_reduceMotion) return;
    _reaction.forward(from: 0);
  }

  void _handlePanStart(DragStartDetails details) {
    if (widget.rotatable) _beginRotation(details.localPosition);
    _return.stop();
    setState(() {
      _dragging = true;
      _directDrag = _dragFor(details.localPosition);
    });
    _startReaction();
    widget.onDragStart?.call(details);
  }

  void _handlePanUpdate(DragUpdateDetails details) {
    setState(() {
      _directDrag = _dragFor(details.localPosition);
      if (widget.rotatable) {
        _manualOrientationOffset = slopToonOrientationAfterHorizontalDrag(
          startingAngle: _rotationStartOffset,
          deltaX: details.localPosition.dx - _rotationStartX,
          stageWidth: widget.size,
          reducedMotion: _reduceMotion,
        );
      }
    });
    _notifyOrientationChanged();
    widget.onDragUpdate?.call(details);
  }

  void _handlePanEnd(DragEndDetails details) {
    _releaseDrag();
    widget.onDragEnd?.call(details);
  }

  void _releaseDrag() {
    if (!_dragging && _directDrag == Offset.zero) return;
    setState(() {
      _dragging = false;
      _returnFrom = _directDrag;
      if (_reduceMotion) {
        _directDrag = Offset.zero;
        _return.value = 1;
      } else {
        _return.forward(from: 0);
      }
    });
  }

  void _beginRotation(Offset localPosition) {
    _rotationStartX = localPosition.dx;
    _rotationStartOffset = _manualOrientationOffset;
  }

  void _handleHorizontalDragStart(DragStartDetails details) {
    _beginRotation(details.localPosition);
    _startReaction();
  }

  void _handleHorizontalDragUpdate(DragUpdateDetails details) {
    _setManualOrientation(
      slopToonOrientationAfterHorizontalDrag(
        startingAngle: _rotationStartOffset,
        deltaX: details.localPosition.dx - _rotationStartX,
        stageWidth: widget.size,
        reducedMotion: _reduceMotion,
      ),
    );
  }

  void _rotateByQuarterTurn(double direction) {
    _setManualOrientation(
      slopToonOrientationAfterHorizontalDrag(
        startingAngle: _manualOrientationOffset,
        deltaX:
            widget.size *
            slopToonRotationDragRevolutionFraction *
            0.25 *
            direction,
        stageWidth: widget.size,
        reducedMotion: _reduceMotion,
      ),
    );
  }

  void _setManualOrientation(double orientation) {
    setState(() => _manualOrientationOffset = orientation);
    _notifyOrientationChanged();
  }

  void _notifyOrientationChanged() {
    final callback = widget.onOrientationChanged;
    if (callback == null) return;
    final look = widget.look ?? SlopLookStore.instance.look;
    final autonomous = widget.phaseOverride == null
        ? slopToonPersonalityFrameFor(
            elapsedSeconds: _personalityClock.value,
            seed: widget.personalitySeed ?? slopToonPersonalitySeedFor(look),
            reducedMotion: _reduceMotion,
          ).orientationAngle
        : 0.0;
    final automaticOrientation =
        widget.orientationAngle ??
        (widget.allowAutonomousFullTurns ? autonomous : 0.0);
    callback(
      slopToonNormalizeOrientation(
        automaticOrientation + _manualOrientationOffset,
      ),
    );
  }

  void _handleTap() {
    _startReaction();
    if (!_reduceMotion) HapticFeedback.lightImpact();
    widget.onTap?.call();
  }

  @override
  void dispose() {
    _personalityTicker.dispose();
    _personalityClock.dispose();
    _reaction.dispose();
    _return.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        _personalityClock,
        _reaction,
        _return,
        SlopLookStore.instance,
      ]),
      builder: (context, _) {
        final look = widget.look ?? SlopLookStore.instance.look;
        final autonomous = widget.phaseOverride == null
            ? slopToonPersonalityFrameFor(
                elapsedSeconds: _personalityClock.value,
                seed:
                    widget.personalitySeed ?? slopToonPersonalitySeedFor(look),
                reaction: _reaction.value,
                drag: _effectiveDrag,
                talking: widget.talking,
                reducedMotion: _reduceMotion,
              )
            : null;
        final phase = widget.phaseOverride ?? autonomous!.phase;
        final arrival = Curves.easeOutCubic.transform(
          (_personalityClock.value / .8).clamp(0.0, 1.0),
        );
        final delayedTurn = widget.rareAutonomousFullTurnDelay == null
            ? null
            : slopToonOrientationFrameFor(
                elapsedSeconds:
                    math.max(
                      0,
                      _personalityClock.value -
                          widget.rareAutonomousFullTurnDelay!.inMilliseconds /
                              1000,
                    ) *
                    widget.rareAutonomousFullTurnTimeScale.clamp(0.1, 1.0),
                seed:
                    widget.personalitySeed ?? slopToonPersonalitySeedFor(look),
                reducedMotion: _reduceMotion,
              );
        final shallowOrientation =
            (autonomous?.frame.turn ?? 0) *
            widget.autonomousShallowTurnScale.clamp(0.0, 0.8) *
            arrival;
        final automaticOrientation =
            widget.orientationAngle ??
            (widget.allowAutonomousFullTurns
                ? autonomous?.orientationAngle
                : delayedTurn?.active == true
                ? delayedTurn!.angle
                : autonomous == null
                ? null
                : shallowOrientation);
        final orientationAngle =
            automaticOrientation == null &&
                _manualOrientationOffset.abs() < 0.000001
            ? null
            : slopToonNormalizeOrientation(
                (automaticOrientation ?? 0) + _manualOrientationOffset,
              );
        final frame =
            autonomous?.frame ??
            slopToonFrameFor(
              phase: phase,
              reaction: _reaction.value,
              drag: _effectiveDrag,
              talking: widget.talking,
              reducedMotion: _reduceMotion,
            );
        final personalitySeed =
            widget.personalitySeed ?? slopToonPersonalitySeedFor(look);
        final playfulMouthBeat =
            widget.playfulMouth &&
            !_reduceMotion &&
            autonomous != null &&
            _personalityBits(personalitySeed, autonomous.beatIndex, 73) % 9 ==
                0;
        final playfulTalk = playfulMouthBeat
            ? math
                  .pow(math.sin(autonomous.beatProgress * math.pi), 4)
                  .toDouble()
            : 0.0;
        final automaticExpression =
            widget.expression ??
            (_dragging
                ? SlopToonExpression.dragCurious
                : _reaction.value > 0.04 && _reaction.value < 0.90
                ? SlopToonExpression.tapSurprised
                : autonomous?.expression ?? SlopToonExpression.neutral);
        final paintedStage = SizedBox.square(
          dimension: widget.size,
          child: RepaintBoundary(
            child: CustomPaint(
              key: const ValueKey('slop-toon-canvas'),
              isComplex: true,
              willChange: _shouldIdle || _dragging || _return.isAnimating,
              painter: _SlopToonPainter(
                look: look,
                emotion: widget.emotion,
                expression: automaticExpression,
                phase: phase,
                facePhase: widget.facePhaseOverride,
                frame: frame,
                smirk: _reduceMotion ? 0 : (autonomous?.smilePulse ?? 0) * .62,
                orientationAngle: orientationAngle,
                externalGaze: widget.gaze,
                talking: widget.talking,
                playfulTalk: playfulTalk,
                round: widget.round,
                faceAnchor: widget.faceAnchor,
                faceScale: widget.faceScale,
                showEffects: widget.showEffects,
                showMouth: widget.showMouth,
                facialLineColor: widget.facialLineColor,
                shift: widget.shift,
                shiftT: widget.shiftT,
                reducedMotion: _reduceMotion,
              ),
            ),
          ),
        );
        final hasTapAction = widget.interactive || widget.onTap != null;
        final needsGesture = hasTapAction || widget.rotatable;
        final hintedStage = widget.rotatable && widget.showRotationHint
            ? Stack(
                children: [
                  paintedStage,
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: IgnorePointer(
                      child: ExcludeSemantics(
                        child: Center(
                          child: Container(
                            key: const ValueKey('slop-rotation-hint'),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xE6FCF9F5),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.swipe_rounded,
                                  size: 13,
                                  color: Color(0xFF50465C),
                                ),
                                const SizedBox(width: 5),
                                Flexible(
                                  child: Text(
                                    localizedUiText('Swipe to turn'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontFamily: 'Gabarito',
                                      fontSize: 11,
                                      fontWeight: FontWeight.w500,
                                      color: Color(0xFF50465C),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              )
            : paintedStage;
        final presentedStage = !needsGesture
            ? hintedStage
            : GestureDetector(
                behavior: HitTestBehavior.opaque,
                // A read-only public portrait is adjustable, not a fake
                // button. Install a tap recognizer only when tapping actually
                // reacts or invokes a caller action; horizontal rotation stays
                // independently available without stealing vertical scroll.
                onTap: hasTapAction ? _handleTap : null,
                onPanStart: widget.interactive ? _handlePanStart : null,
                onPanUpdate: widget.interactive ? _handlePanUpdate : null,
                onPanEnd: widget.interactive ? _handlePanEnd : null,
                onPanCancel: widget.interactive ? _releaseDrag : null,
                onHorizontalDragStart: !widget.interactive && widget.rotatable
                    ? _handleHorizontalDragStart
                    : null,
                onHorizontalDragUpdate: !widget.interactive && widget.rotatable
                    ? _handleHorizontalDragUpdate
                    : null,
                child: MouseRegion(
                  cursor: widget.rotatable
                      ? SystemMouseCursors.grab
                      : SystemMouseCursors.click,
                  child: hintedStage,
                ),
              );
        // Semantics consumes the exact same sampled orientation as the
        // painter. Keeping it inside this live builder prevents a focused
        // adjustable portrait from saying "Front" while an autonomous turn
        // is visibly showing a side or back pose.
        final semanticOrientation = orientationAngle ?? 0;
        return Semantics(
          image: !hasTapAction,
          button: hasTapAction,
          label: widget.semanticLabel,
          hint: widget.semanticHint,
          value: widget.rotatable
              ? slopToonOrientationSemanticValueFor(semanticOrientation)
              : null,
          increasedValue: widget.rotatable
              ? slopToonOrientationSemanticValueFor(
                  semanticOrientation + math.pi / 2,
                )
              : null,
          decreasedValue: widget.rotatable
              ? slopToonOrientationSemanticValueFor(
                  semanticOrientation - math.pi / 2,
                )
              : null,
          onIncrease: widget.rotatable ? () => _rotateByQuarterTurn(1) : null,
          onDecrease: widget.rotatable ? () => _rotateByQuarterTurn(-1) : null,
          child: presentedStage,
        );
      },
    );
  }
}

class _SlopToonPainter extends CustomPainter {
  _SlopToonPainter({
    required this.look,
    required this.emotion,
    required this.expression,
    required this.phase,
    required this.facePhase,
    required this.frame,
    required this.orientationAngle,
    required this.externalGaze,
    required this.smirk,
    required this.talking,
    required this.playfulTalk,
    required this.round,
    required this.faceAnchor,
    required this.faceScale,
    required this.showEffects,
    required this.showMouth,
    required this.facialLineColor,
    required this.shift,
    required this.shiftT,
    required this.reducedMotion,
  }) : super(repaint: SlopChampionStore.instance);

  final SlopLook look;
  final SlopEmotion emotion;
  final SlopToonExpression expression;
  final double phase;
  final double? facePhase;
  final SlopToonFrame frame;
  final double? orientationAngle;
  final Offset externalGaze;
  final double smirk;
  final bool talking;
  final double playfulTalk;
  final double round;
  final double faceAnchor;
  final double faceScale;
  final bool showEffects;
  final bool showMouth;
  final Color? facialLineColor;
  final SlopShift? shift;
  final double shiftT;
  final bool reducedMotion;

  @override
  void paint(Canvas canvas, Size size) {
    // Hats and tall materials get generous crown clearance. The character is
    // still large in the stage, with its mass visibly planted near the floor.
    final rect = slopToonPresentationRectFor(size, look: look);
    final auraScale = slopToonAmbientScaleFor(look);
    SlopToonRenderer.paint(
      canvas,
      rect: rect,
      look: look,
      emotion: emotion,
      expression: expression,
      round: round,
      phase: phase,
      facePhase: facePhase,
      centerFaceHorizontally: facePhase != null,
      gaze: externalGaze,
      smirk: smirk,
      talk: math.max(
        playfulTalk,
        talking ? (0.32 + math.sin(phase * math.pi * 14).abs() * 0.68) : 0,
      ),
      faceAnchor: faceAnchor,
      faceScale: faceScale,
      shift: shift,
      shiftT: shiftT,
      shadow: showEffects,
      ambient: showEffects,
      ambientScaleX: auraScale.x,
      ambientScaleY: auraScale.y,
      showMouth: showMouth,
      facialLineColor: facialLineColor,
      frame: frame,
      orientationAngle: orientationAngle,
      reducedMotion: reducedMotion,
    );
  }

  @override
  bool shouldRepaint(covariant _SlopToonPainter oldDelegate) =>
      oldDelegate.look != look ||
      oldDelegate.emotion != emotion ||
      oldDelegate.expression != expression ||
      oldDelegate.phase != phase ||
      oldDelegate.facePhase != facePhase ||
      oldDelegate.frame != frame ||
      oldDelegate.orientationAngle != orientationAngle ||
      oldDelegate.externalGaze != externalGaze ||
      oldDelegate.smirk != smirk ||
      oldDelegate.talking != talking ||
      oldDelegate.playfulTalk != playfulTalk ||
      oldDelegate.round != round ||
      oldDelegate.faceAnchor != faceAnchor ||
      oldDelegate.faceScale != faceScale ||
      oldDelegate.showEffects != showEffects ||
      oldDelegate.showMouth != showMouth ||
      oldDelegate.facialLineColor != facialLineColor ||
      oldDelegate.shift != shift ||
      oldDelegate.shiftT != shiftT ||
      oldDelegate.reducedMotion != reducedMotion;
}
