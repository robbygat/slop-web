import 'dart:math' as math;
import 'dart:ui';

import '../models/slop_look.dart';

/// Legacy names are retained for saved looks; these slots now draw small tails.
class SlopCapePatch {
  const SlopCapePatch(
    this.points,
    this.shade, {
    this.material = 0,
    this.depth = 0,
  });
  final List<Offset> points;
  final double shade, depth;
  final int material;
}

class _TailVertex {
  const _TailVertex(this.x, this.y, this.z);
  final double x, y, z;
  _TailVertex mix(_TailVertex b, double t) =>
      _TailVertex(x + (b.x - x) * t, y + (b.y - y) * t, z + (b.z - z) * t);
}

List<_TailVertex> _clipTail(List<_TailVertex> input, bool front) {
  final out = <_TailVertex>[];
  for (var i = 0; i < input.length; i++) {
    final a = input[i], b = input[(i + 1) % input.length];
    final insideA = front ? a.z >= 0 : a.z <= 0;
    final insideB = front ? b.z >= 0 : b.z <= 0;
    if (insideA) out.add(a);
    if (insideA != insideB) out.add(a.mix(b, a.z / (a.z - b.z)));
  }
  return out;
}

double _tailBodyRadius(SlopBody shape, double height) {
  if (shape == SlopBody.triangle) {
    return (.04 + .50 * ((height - .10) / .80)).clamp(.04, .49);
  }
  if (shape == SlopBody.heart) {
    return (.5 * (1 - (height - .4) / .6)).clamp(.05, .48);
  }
  return (shape == SlopBody.ghost ? .46 : .49) *
      math.sqrt(math.max(.18, 1 - math.pow((height - .5) * 1.65, 2)));
}

/// One compact volume attached to the lower rear surface. All variants use a
/// fixed 12x8 mesh; only its centerline and section profile vary. No extra clock.
List<SlopCapePatch> slopTailPatchesFor(
  Rect body, {
  required SlopCape tail,
  required double orientationAngle,
  required bool frontPass,
  double bodyScaleX = 1,
  double phase = 0,
  SlopBody bodyShape = SlopBody.classic,
}) {
  if (tail == SlopCape.none ||
      body.isEmpty ||
      !orientationAngle.isFinite ||
      !phase.isFinite) {
    return const [];
  }
  final w = body.width / bodyScaleX.clamp(.2, 1.5), h = body.height;
  final rootHeight = bodyShape == SlopBody.triangle ? .72 : .68;
  final radius = _tailBodyRadius(bodyShape, rootHeight);
  // A centred, embedded rear root keeps the front silhouette symmetric.
  // The short tip emerges only as the rear surface turns into view.
  final rootZ = -w * radius * .80;
  final cos = math.cos(orientationAngle), sin = math.sin(orientationAngle);
  _TailVertex center(double t) {
    final lift = tail == SlopCape.red
        ? .10 * t - .025 * math.sin(t * math.pi)
        : .11 * t;
    final curl = tail == SlopCape.red ? .025 * math.sin(t * math.pi) : 0.0;
    final sway = math.sin(phase * math.pi * 2 + t * .6) * .002 * t * t;
    return _TailVertex(
      w * (curl + sway),
      body.top + h * (rootHeight + lift),
      rootZ - w * (.17 * t + .025 * math.sin(t * math.pi)),
    );
  }

  _TailVertex vertex(double t, double a) {
    final c = center(t),
        before = center(math.max(0, t - .002)),
        after = center(math.min(1, t + .002));
    final dx = after.x - before.x, dy = after.y - before.y;
    final length = math.sqrt(dx * dx + dy * dy);
    final r =
        w *
        switch (tail) {
          SlopCape.petal =>
            .021 * (1 - t) + .029 * math.pow(math.sin(t * math.pi), 1.2),
          SlopCape.midnight => .028 * math.pow(1 - t, .55),
          SlopCape.red => .029 * math.pow(1 - t, .48),
          SlopCape.satchel =>
            .018 * (1 - t) + .033 * math.pow(math.sin(t * math.pi), .8),
          SlopCape.none => 0.0,
        };
    final flat = tail == SlopCape.petal ? .40 : .76;
    final x = c.x - dy / math.max(.0001, length) * r * math.cos(a);
    final y = c.y + dx / math.max(.0001, length) * r * math.cos(a);
    final z = c.z + r * math.sin(a) * flat;
    final px = x * cos + z * sin, pz = z * cos - x * sin;
    final normalizedHeight = (y - body.top) / h;
    final envelope = _tailBodyRadius(bodyShape, normalizedHeight);
    final nx = px / (body.width * envelope);
    final surface = nx.abs() >= 1 ? 0.0 : w * envelope * math.sqrt(1 - nx * nx);
    return _TailVertex(body.center.dx + px, y, pz - surface);
  }

  final patches = <SlopCapePatch>[];
  const segments = 12, sides = 8;
  for (var segment = 0; segment < segments; segment++) {
    final a = segment / segments, b = (segment + 1) / segments;
    for (var side = 0; side < sides; side++) {
      final angle = side * math.pi * 2 / sides,
          next = (side + 1) * math.pi * 2 / sides;
      final polygon = _clipTail([
        vertex(a, angle),
        vertex(b, angle),
        vertex(b, next),
        vertex(a, next),
      ], frontPass);
      if (polygon.length < 3) continue;
      patches.add(
        SlopCapePatch(
          [for (final v in polygon) Offset(v.x, v.y)],
          (.59 + .23 * math.cos(angle + .7) - .08 * a).clamp(0, 1),
          depth:
              polygon.fold<double>(0, (sum, v) => sum + v.z) / polygon.length,
        ),
      );
    }
  }
  patches.sort((a, b) => a.depth.compareTo(b.depth));
  return patches;
}

/// Compatibility helpers for existing native callers/tests, without retaining
/// the rejected cloth or bag meshes.
List<SlopCapePatch> slopCapePatchesFor(
  Rect body, {
  required double orientationAngle,
  double bodyScaleX = 1,
  double phase = 0,
  required bool frontPass,
  SlopBody bodyShape = SlopBody.classic,
}) => slopTailPatchesFor(
  body,
  tail: SlopCape.petal,
  orientationAngle: orientationAngle,
  bodyScaleX: bodyScaleX,
  phase: phase,
  frontPass: frontPass,
  bodyShape: bodyShape,
);
List<SlopCapePatch> slopSatchelPatchesFor(
  Rect body, {
  required double orientationAngle,
  double bodyScaleX = 1,
  required bool frontPass,
  SlopBody bodyShape = SlopBody.classic,
}) => slopTailPatchesFor(
  body,
  tail: SlopCape.satchel,
  orientationAngle: orientationAngle,
  bodyScaleX: bodyScaleX,
  frontPass: frontPass,
  bodyShape: bodyShape,
);

abstract final class SlopCapeRenderer {
  static void paint(
    Canvas canvas,
    Rect body, {
    required SlopCape cape,
    required double orientationAngle,
    required bool frontPass,
    double bodyScaleX = 1,
    double phase = 0,
    double opacity = 1,
    SlopBody bodyShape = SlopBody.classic,
    Path? bodyOutline,
  }) {
    if (cape == SlopCape.none || body.isEmpty || opacity <= 0) return;
    final (dark, light) = switch (cape) {
      SlopCape.petal => (const Color(0xFFAD7392), const Color(0xFFF3CBDC)),
      SlopCape.midnight => (const Color(0xFF62658D), const Color(0xFFBCC9EF)),
      SlopCape.red => (const Color(0xFFAE4058), const Color(0xFFFF8A8D)),
      SlopCape.satchel => (const Color(0xFF467E76), const Color(0xFFB1E3C3)),
      SlopCape.none => (const Color(0x00000000), const Color(0x00000000)),
    };
    canvas.save();
    if (!frontPass && bodyOutline != null) {
      // Stylized Glass occlusion: remove hidden tail pixels, never paint an
      // opaque mask behind the eyes/mouth. Clear body gaps remain transparent.
      canvas.clipPath(
        Path()
          ..fillType = PathFillType.evenOdd
          ..addRect(body.inflate(body.longestSide))
          ..addPath(bodyOutline, Offset.zero),
      );
    }
    for (final patch in slopTailPatchesFor(
      body,
      tail: cape,
      orientationAngle: orientationAngle,
      frontPass: frontPass,
      bodyScaleX: bodyScaleX,
      phase: phase,
      bodyShape: bodyShape,
    )) {
      canvas.drawPath(
        Path()..addPolygon(patch.points, true),
        Paint()
          ..color = Color.lerp(
            dark,
            light,
            patch.shade,
          )!.withValues(alpha: opacity.clamp(0, 1))
          ..isAntiAlias = false,
      );
    }
    canvas.restore();
  }
}
