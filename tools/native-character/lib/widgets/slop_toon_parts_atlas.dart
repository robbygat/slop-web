import 'dart:collection';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../models/slop_look.dart';
import 'slop_character.dart';

/// Stable compositing order for the large toon Slop.
///
/// Each enum value is a logical sprite-sheet row. Cells are vector pictures,
/// not flattened full-character bitmaps: traits can therefore mix freely and
/// dynamic gel, face, and mouth geometry remain live.
enum SlopToonPartLayer {
  contactShadow,
  ambientAuraRear,
  bodyMaterialPattern,
  authoredFace,
  headwear,
  ambientAuraFront,
}

/// The canonical atlas row order. External Studio anatomy (cavity, tongue,
/// dentition, status) intentionally sits after this plan in its own composer.
const slopToonPartLayerPlan = <SlopToonPartLayer>[
  SlopToonPartLayer.contactShadow,
  SlopToonPartLayer.ambientAuraRear,
  SlopToonPartLayer.bodyMaterialPattern,
  SlopToonPartLayer.authoredFace,
  SlopToonPartLayer.headwear,
  SlopToonPartLayer.ambientAuraFront,
];

/// Logical personality channel. This modulates motion/emotion but never
/// substitutes an equipped eye, mouth, accessory, hat, material, or aura.
enum SlopToonExpression {
  neutral,
  listening,
  happySmile,
  tapSurprised,
  dragCurious,
  mouthOpenHandoff,
  proudPayoff,
}

/// Deterministic personality sample for tests, recording, and synchronized
/// Studio choreography. Reduced motion settles to a static identity pose.
@immutable
class SlopToonExpressionFrame {
  const SlopToonExpressionFrame({
    required this.state,
    required this.emotion,
    required this.talk,
    required this.showMouth,
    required this.smilePulse,
  });

  final SlopToonExpression state;
  final SlopEmotion emotion;
  final double talk;
  final bool showMouth;
  final double smilePulse;

  /// Whether the deterministic personality clock is inside its brief smile.
  bool get smileMoment => smilePulse > 0.001;
}

SlopToonExpressionFrame slopToonExpressionFrameFor({
  required double phase,
  SlopToonExpression state = SlopToonExpression.neutral,
  bool reducedMotion = false,
}) {
  final wrapped = phase.isFinite ? phase - phase.floorToDouble() : 0.0;
  final smileWindow = !reducedMotion && wrapped >= 0.72 && wrapped < 0.82;
  final smilePulse = smileWindow
      ? Curves.easeInOut.transform(((wrapped - 0.72) / 0.10).clamp(0.0, 1.0))
      : 0.0;
  return switch (state) {
    SlopToonExpression.neutral => SlopToonExpressionFrame(
      state: smileWindow ? SlopToonExpression.happySmile : state,
      emotion: smileWindow ? SlopEmotion.happy : SlopEmotion.curious,
      talk: 0,
      showMouth: true,
      smilePulse: smilePulse,
    ),
    SlopToonExpression.listening => const SlopToonExpressionFrame(
      state: SlopToonExpression.listening,
      emotion: SlopEmotion.thinking,
      talk: 0.10,
      showMouth: true,
      smilePulse: 0,
    ),
    SlopToonExpression.happySmile => const SlopToonExpressionFrame(
      state: SlopToonExpression.happySmile,
      emotion: SlopEmotion.happy,
      talk: 0.18,
      showMouth: true,
      smilePulse: 1,
    ),
    SlopToonExpression.tapSurprised => const SlopToonExpressionFrame(
      state: SlopToonExpression.tapSurprised,
      emotion: SlopEmotion.excited,
      talk: 0.56,
      showMouth: true,
      smilePulse: 0,
    ),
    SlopToonExpression.dragCurious => const SlopToonExpressionFrame(
      state: SlopToonExpression.dragCurious,
      emotion: SlopEmotion.curious,
      talk: 0,
      showMouth: true,
      smilePulse: 0,
    ),
    SlopToonExpression.mouthOpenHandoff => const SlopToonExpressionFrame(
      state: SlopToonExpression.mouthOpenHandoff,
      emotion: SlopEmotion.excited,
      talk: 1,
      showMouth: false,
      smilePulse: 0,
    ),
    SlopToonExpression.proudPayoff => const SlopToonExpressionFrame(
      state: SlopToonExpression.proudPayoff,
      emotion: SlopEmotion.proud,
      talk: 0.22,
      showMouth: true,
      smilePulse: 1,
    ),
  };
}

/// Exact cache identity for one logical atlas cell.
///
/// [traitKey] includes only attributes that can affect this layer; changing a
/// mouth does not invalidate headwear, and changing an aura does not invalidate
/// the face. Cells use canonical 100×100 vector coordinates, so target size and
/// device-pixel ratio are deliberately absent: both are losslessly applied at
/// replay and must not turn a continuous Studio morph into cache churn.
@immutable
class SlopToonAtlasKey {
  const SlopToonAtlasKey({
    required this.layer,
    required this.traitKey,
    required this.surfaceStyle,
  });

  factory SlopToonAtlasKey.forLook({
    required SlopToonPartLayer layer,
    required SlopLook look,
    SlopSurfaceStyle surfaceStyle = SlopSurfaceStyle.toon,
  }) => SlopToonAtlasKey(
    layer: layer,
    traitKey: slopToonTraitKeyFor(layer, look),
    surfaceStyle: surfaceStyle,
  );

  static const normalizedCellSize = Size.square(100);

  final SlopToonPartLayer layer;
  final String traitKey;
  final SlopSurfaceStyle surfaceStyle;

  @override
  bool operator ==(Object other) =>
      other is SlopToonAtlasKey &&
      other.layer == layer &&
      other.traitKey == traitKey &&
      other.surfaceStyle == surfaceStyle;

  @override
  int get hashCode => Object.hash(layer, traitKey, surfaceStyle);
}

String slopToonTraitKeyFor(
  SlopToonPartLayer layer,
  SlopLook look,
) => switch (layer) {
  SlopToonPartLayer.contactShadow => look.paletteId,
  SlopToonPartLayer.ambientAuraRear || SlopToonPartLayer.ambientAuraFront =>
    '${look.paletteId}|${look.body.name}|${look.aura.name}|${look.finish.name}',
  SlopToonPartLayer.bodyMaterialPattern =>
    '${look.paletteId}|${look.body.name}|${look.pattern.name}|${look.finish.name}',
  SlopToonPartLayer.authoredFace =>
    '${look.paletteId}|${look.body.name}|${look.eyes.name}|${look.eyeColor.name}|${look.mouth.name}|${look.accessory.name}|${look.blush}',
  SlopToonPartLayer.headwear =>
    '${look.paletteId}|${look.body.name}|${look.hat.name}',
};

/// One normalized vector cell. Pictures preserve authored curves at arbitrary
/// DPR and avoid the deformation seams produced by a raster sprite sheet.
class SlopToonAtlasCell {
  SlopToonAtlasCell({
    required this.key,
    required this.picture,
    required this.logicalBounds,
  });

  final SlopToonAtlasKey key;
  final ui.Picture picture;
  final Rect logicalBounds;

  void paint(Canvas canvas, {Offset offset = Offset.zero}) {
    canvas.save();
    canvas.translate(offset.dx, offset.dy);
    canvas.drawPicture(picture);
    canvas.restore();
  }

  void dispose() => picture.dispose();
}

typedef SlopToonCellRecorder = void Function(Canvas canvas);

/// Bounded LRU for static vector atlas cells.
///
/// The cache is intentionally slot-based rather than Cartesian: a user with
/// 25 hats and 17 auras creates at most the cells they actually view, never
/// 425 flattened combinations. Dynamic body deformation, blink/gaze, mouth,
/// and moving aura cells bypass this cache and remain procedural.
class SlopToonPartsAtlas {
  SlopToonPartsAtlas({
    this.maximumCells = 48,
    this.maximumEstimatedBytes = 6 * 1024 * 1024,
  }) : assert(maximumCells > 0, 'maximumCells must be positive'),
       assert(maximumEstimatedBytes > 0, 'byte budget must be positive');

  static final shared = SlopToonPartsAtlas();

  final int maximumCells;
  final int maximumEstimatedBytes;
  final LinkedHashMap<SlopToonAtlasKey, SlopToonAtlasCell> _cells =
      LinkedHashMap();
  int _hits = 0;
  int _misses = 0;

  int get length => _cells.length;
  int get hits => _hits;
  int get misses => _misses;
  int get estimatedBytes =>
      _cells.values.fold(0, (total, _) => total + _estimatedBytesFor());
  Iterable<SlopToonAtlasKey> get keys => List.unmodifiable(_cells.keys);

  static bool isCacheable(SlopToonPartLayer layer) => switch (layer) {
    // These slots follow phase, deformation, gaze, talk, or the live crown.
    SlopToonPartLayer.bodyMaterialPattern ||
    SlopToonPartLayer.authoredFace ||
    SlopToonPartLayer.headwear ||
    SlopToonPartLayer.ambientAuraRear ||
    SlopToonPartLayer.ambientAuraFront => false,
    // Recorded in normalized body coordinates and transformed with the live
    // pose. Its geometry is independent of blink, mouth, gaze, and cosmetics.
    SlopToonPartLayer.contactShadow => true,
  };

  static int _estimatedBytesFor() =>
      (SlopToonAtlasKey.normalizedCellSize.width *
              SlopToonAtlasKey.normalizedCellSize.height *
              4)
          .ceil();

  SlopToonAtlasCell obtain(SlopToonAtlasKey key, SlopToonCellRecorder record) {
    final hit = _cells.remove(key);
    if (hit != null) {
      _hits++;
      _cells[key] = hit;
      return hit;
    }
    _misses++;
    final recorder = ui.PictureRecorder();
    record(Canvas(recorder));
    final cell = SlopToonAtlasCell(
      key: key,
      picture: recorder.endRecording(),
      logicalBounds: Offset.zero & SlopToonAtlasKey.normalizedCellSize,
    );
    _cells[key] = cell;
    while (_cells.length > maximumCells ||
        (_cells.length > 1 && estimatedBytes > maximumEstimatedBytes)) {
      final oldestKey = _cells.keys.first;
      _cells.remove(oldestKey)!.dispose();
    }
    return cell;
  }

  bool containsKey(SlopToonAtlasKey key) => _cells.containsKey(key);

  void invalidateWhere(bool Function(SlopToonAtlasKey key) predicate) {
    final doomed = _cells.keys.where(predicate).toList(growable: false);
    for (final key in doomed) {
      _cells.remove(key)?.dispose();
    }
  }

  void clear() {
    for (final cell in _cells.values) {
      cell.dispose();
    }
    _cells.clear();
  }
}

/// A testable atlas/compositor contract used by [SlopToonRenderer].
///
/// Dynamic rows call [paintLayer] directly. This is deliberate: caching a
/// deformed body or open mouth would flatten anatomy and break Studio. Static
/// rows may use [atlas] as they are introduced without changing layer order.
abstract final class SlopToonPartsCompositor {
  static void paintPlan({
    required SlopToonPartsAtlas atlas,
    required void Function(SlopToonPartLayer layer) paintLayer,
    Set<SlopToonPartLayer> layers = const {...slopToonPartLayerPlan},
  }) {
    for (final layer in slopToonPartLayerPlan) {
      if (layers.contains(layer)) paintLayer(layer);
    }
  }
}
