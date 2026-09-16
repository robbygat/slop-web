part of 'slop_character.dart';

// Three straight sides with small soft corners. Cache the polar sampling once
// so all morphs share matching points without bending the triangle's edges.
List<Offset> _slopPolarOutline(Path outline) {
  final metric = outline.computeMetrics().single;
  final boundary = List<Offset>.generate(
    512,
    (i) => metric.getTangentForOffset(metric.length * i / 512)!.position,
  );
  double cross(Offset a, Offset b) => a.dx * b.dy - a.dy * b.dx;
  return List<Offset>.generate(128, (i) {
    final angle = i * math.pi * 2 / 128;
    final direction = Offset(math.cos(angle), math.sin(angle));
    var radius = double.infinity;
    for (var edge = 0; edge < boundary.length; edge++) {
      final start = boundary[edge];
      final segment = boundary[(edge + 1) % boundary.length] - start;
      final denominator = cross(direction, segment);
      if (denominator.abs() < 1e-10) continue;
      final distance = cross(start, segment) / denominator;
      final along = cross(start, direction) / denominator;
      if (distance > 0 && along >= 0 && along <= 1) {
        radius = math.min(radius, distance);
      }
    }
    assert(radius.isFinite);
    return direction * radius;
  });
}

final _slopTriangleUnitPoints = _slopPolarOutline(
  Path()
    ..moveTo(-.055, -.38)
    ..quadraticBezierTo(0, -.47, .055, -.38)
    ..lineTo(.47, .32)
    ..quadraticBezierTo(.535, .425, .395, .425)
    ..lineTo(-.395, .425)
    ..quadraticBezierTo(-.535, .425, -.47, .32)
    ..close(),
);

// Full cheeks and two soft shoulders give Sweetheart a readable heart without
// pinching the face or cutting a deep gap through the headwear attachment.
final _slopHeartUnitPoints = _slopPolarOutline(
  Path()
    ..moveTo(0, -.29)
    ..cubicTo(-.11, -.48, -.47, -.47, -.49, -.15)
    ..cubicTo(-.54, .10, -.23, .33, -.06, .44)
    ..quadraticBezierTo(0, .49, .06, .44)
    ..cubicTo(.23, .33, .54, .10, .49, -.15)
    ..cubicTo(.47, -.47, .11, -.48, 0, -.29)
    ..close(),
);

/// A continuous outline: every form has matching points, so expressions and
/// the panel transition keep their anchors while the body changes underneath.
Path slopFormOutlineFor(
  Rect rect, {
  required SlopBody body,
  double phase = 0,
  double round = 0,
  SlopShift? shift,
  double shiftT = 0,
  double shiftStrength = 1,
  double orientationAngle = 0,
  SlopBody? into,
  double intoT = 0,
}) {
  final morph =
      math.sin(shiftT.clamp(0.0, 1.0) * math.pi) *
      shiftStrength.clamp(0.0, 1.0);
  final panel = round.clamp(0.0, 1.0);
  final points = <Offset>[];
  for (var i = 0; i < 128; i++) {
    final a = i * math.pi * 2 / 128;
    final dx = math.cos(a);
    final dy = math.sin(a);
    final depthWeight = .48 + .52 * math.pow(math.cos(orientationAngle), 2);
    double radiusFor(int lobes, double depth) =>
        1 -
        depth *
            depthWeight *
            (1 + math.cos(lobes * (a + math.pi / 2) + math.pi)) /
            2;
    Offset formFor(SlopBody body) {
      final base = switch (body) {
        SlopBody.classic => radiusFor(5, .14),
        SlopBody.tall => 1.0,
        SlopBody.wide => 1 - .28 * depthWeight * (1 + math.cos(4 * a)) / 2,
        SlopBody.droplet || SlopBody.capsule => 1.0,
        SlopBody.cloud => radiusFor(6, .17),
        SlopBody.ghost => 1.0,
        SlopBody.triangle => 1.0,
        SlopBody.star => radiusFor(10, .14),
        SlopBody.heart => 1.0,
      };
      final target = switch (shift) {
        SlopShift.flower => radiusFor(5, .27),
        SlopShift.cloud => radiusFor(6, .17),
        SlopShift.star => radiusFor(10, .13),
        SlopShift.triangle => base,
        SlopShift.heart =>
          1 -
              .27 *
                  math.exp(-math.pow((a + math.pi / 2) % (math.pi * 2), 2) * 4),
        _ => 1.0,
      };
      final r = base + (target - base) * morph;
      final breathing = 1 + .009 * math.sin(a * 3 + phase * math.pi * 2);
      final pillow = (body == SlopBody.droplet || body == SlopBody.capsule)
          ? (1 - morph) * (body == SlopBody.capsule ? .08 : .34)
          : 0.0;
      var form = Offset(
        dx.sign *
            math.pow(dx.abs(), 1 - pillow) *
            rect.width *
            .5 *
            r *
            breathing,
        dy.sign *
            math.pow(dy.abs(), 1 - pillow) *
            rect.height *
            .5 *
            r *
            breathing,
      );
      if (body == SlopBody.tall && morph < 1) {
        // A low, smooth river stone. Its broad front plane gives a pair of
        // eyes the same comfortable space as the signature single eye.
        final pebble = Offset(
          dx.sign *
              math.pow(dx.abs(), .88) *
              rect.width *
              .49 *
              (1 + .025 * dy),
          dy.sign * math.pow(dy.abs(), .94) * rect.height * .47,
        );
        form = Offset.lerp(pebble, form, morph)!;
      }
      if (body == SlopBody.capsule && morph < 1) {
        final radius = math.min(rect.width, rect.height) * .5;
        final pill = Offset(
          dx * radius + dx.sign * math.max(0, rect.width * .5 - radius),
          dy * rect.height * .5,
        );
        form = Offset.lerp(pill, form, morph)!;
      }
      if (body == SlopBody.heart && morph < 1) {
        final point = _slopHeartUnitPoints[i];
        form = Offset.lerp(
          Offset(point.dx * rect.width, point.dy * rect.height),
          form,
          morph,
        )!;
      }
      if (body == SlopBody.cloud) {
        form = Offset(form.dx, form.dy * .84);
      }
      if (shift == SlopShift.cloud && body != SlopBody.cloud) {
        form = Offset(form.dx, form.dy * (1 - .16 * morph));
      }
      if (body == SlopBody.ghost && morph < 1) {
        final lower = dy > 0 ? .74 + .13 * math.cos(dx * math.pi * 3) : 1.0;
        final ghost = Offset(
          dx * rect.width * .46 * (1 + .06 * dy),
          dy * rect.height * .5 * lower,
        );
        form = Offset.lerp(ghost, form, morph)!;
      }
      if (body == SlopBody.triangle || shift == SlopShift.triangle) {
        final point = _slopTriangleUnitPoints[i];
        final triangle = Offset(point.dx * rect.width, point.dy * rect.height);
        form = body == SlopBody.triangle
            ? Offset.lerp(
                triangle,
                form,
                shift == SlopShift.triangle ? 0 : morph,
              )!
            : Offset.lerp(form, triangle, morph)!;
      }
      return form;
    }

    final form = Offset.lerp(
      formFor(body),
      formFor(into ?? body),
      intoT.clamp(0.0, 1.0),
    )!;
    // Superellipse gives the wide game ribbon the same softened corners as
    // the free form, without changing the feed's existing hit regions.
    final exponent = .26;
    final box = Offset(
      dx.sign * math.pow(dx.abs(), exponent) * rect.width * .5,
      dy.sign * math.pow(dy.abs(), exponent) * rect.height * .5,
    );
    points.add(rect.center + Offset.lerp(form, box, panel)!);
  }
  final path = Path();
  for (var i = 0; i < points.length; i++) {
    final current = points[i];
    final next = points[(i + 1) % points.length];
    final mid = Offset.lerp(current, next, .5)!;
    if (i == 0) {
      final previous = points.last;
      final start = Offset.lerp(previous, current, .5)!;
      path.moveTo(start.dx, start.dy);
    }
    path.quadraticBezierTo(current.dx, current.dy, mid.dx, mid.dy);
  }
  return path..close();
}

/// Anatomical adjustment for the bodies whose crown or shoulders narrow the
/// face plane. It fades out as the character opens into the familiar ribbon.
({double offsetY, double scale}) slopFormFaceFitFor(
  SlopBody body, {
  double round = 0,
}) {
  final rest = 1 - round.clamp(0.0, 1.0);
  return switch (body) {
    SlopBody.triangle => (offsetY: .065 * rest, scale: 1 - .06 * rest),
    SlopBody.heart => (offsetY: .015 * rest, scale: 1 - .04 * rest),
    _ => (offsetY: 0, scale: 1),
  };
}

// Sample each authored outline once. Headwear must fit the same crown as the
// body, rather than the pre-redesign ellipse plus ad-hoc vertical offsets.
final _slopCrownContours = <SlopBody, List<Offset>>{};
double slopFormCrownYFor(
  Rect rect, {
  required SlopBody body,
  required double normalizedX,
  double round = 0,
}) {
  if (body == SlopBody.capsule) {
    // Stadium curvature depends on the actual aspect ratio. A cached unit
    // circle incorrectly buried hats along the Pill's flat central crown.
    final x = normalizedX.clamp(-.499, .499);
    final radius = rect.shortestSide / 2;
    final capX = math.max(
      0.0,
      (x * rect.width).abs() - (rect.width / 2 - radius),
    );
    final natural =
        -.5 * math.sqrt(math.max(0.0, 1 - math.pow(capX / radius, 2)));
    final box =
        -.5 *
        math.pow(1 - math.pow((x.abs() * 2).clamp(0, .999), 2 / .26), .26 / 2);
    return rect.center.dy +
        rect.height * (natural + (box - natural) * round.clamp(0.0, 1.0));
  }
  final contour = _slopCrownContours.putIfAbsent(body, () {
    final metric = slopFormOutlineFor(
      const Rect.fromLTWH(-.5, -.5, 1, 1),
      body: body,
    ).computeMetrics().single;
    return List.generate(
      256,
      (i) => metric.getTangentForOffset(metric.length * i / 256)!.position,
    );
  });
  final minX = contour.fold<double>(1, (x, p) => math.min(x, p.dx));
  final maxX = contour.fold<double>(-1, (x, p) => math.max(x, p.dx));
  final target = normalizedX.clamp(minX + .001, maxX - .001);
  var top = double.infinity;
  for (var i = 0; i < contour.length; i++) {
    final a = contour[i], b = contour[(i + 1) % contour.length];
    if (target < math.min(a.dx, b.dx) ||
        target > math.max(a.dx, b.dx) ||
        (b.dx - a.dx).abs() < .0000001) {
      continue;
    }
    top = math.min(top, a.dy + (b.dy - a.dy) * (target - a.dx) / (b.dx - a.dx));
  }
  final natural = top.isFinite ? top : -.45;
  final box =
      -.5 *
      math.pow(
        1 - math.pow((normalizedX.abs() * 2).clamp(0, .999), 2 / .26),
        .26 / 2,
      );
  return rect.center.dy +
      rect.height * (natural + (box - natural) * round.clamp(0.0, 1.0));
}

/// Projects a live vector layer over the rounded surface. The same longitude
/// drives each strip, including the back seam; eyes no longer move as a flat
/// card, and animated materials keep their clock while the character turns.
void _paintFormSurface(
  Canvas canvas,
  Rect rect,
  double yaw,
  void Function(Canvas) draw, {
  bool repeat = false,
  bool projectSurface = true,
}) {
  if (!projectSurface) {
    draw(canvas);
    return;
  }
  final recorder = ui.PictureRecorder();
  draw(Canvas(recorder));
  final picture = recorder.endRecording();
  if (!repeat && yaw.abs() < .00001) {
    canvas.drawPicture(picture);
    picture.dispose();
    return;
  }
  const slices = 28;
  final radius = rect.width / 2;
  for (var i = 0; i < slices; i++) {
    final a = -math.pi / 2 + i * math.pi / slices;
    final b = a + math.pi / slices;
    final longitude = ((a + b) / 2 - yaw + math.pi) % (math.pi * 2) - math.pi;
    final curvature = repeat
        ? 1.0
        : Curves.easeOut.transform((yaw.abs() / .18).clamp(0.0, 1.0));
    final left = rect.center.dx + radius * (a + (math.sin(a) - a) * curvature);
    final right = rect.center.dx + radius * (b + (math.sin(b) - b) * curvature);
    final sourceWidth =
        (repeat ? rect.width / (math.pi * 2) : radius) * (b - a);
    final sourceCenter =
        rect.center.dx +
        longitude * (repeat ? rect.width / (math.pi * 2) : radius);
    final scale = (right - left) / sourceWidth;
    canvas.save();
    canvas.clipRect(
      Rect.fromLTRB(
        left,
        rect.top - rect.height,
        right,
        rect.bottom + rect.height,
      ),
      doAntiAlias: false,
    );
    canvas.translate(left, 0);
    canvas.scale(scale, 1);
    canvas.translate(-(sourceCenter - sourceWidth / 2), 0);
    canvas.drawPicture(picture);
    canvas.restore();
  }
  picture.dispose();
}

/// The unlit native body ramp, shared with small material-matched UI accents.
/// Glass values retain their authored transparency; consumers drawing opaque
/// controls may sample their cool RGB tint without changing the body renderer.
({Color top, Color bottom}) slopFormMaterialColors(SlopLook look) {
  final p = look.palette;
  final Color top;
  final Color bottom;
  switch (look.finish) {
    case SlopFinish.gold:
      top = const Color(0xFFF7E6B2);
      bottom = const Color(0xFFC79649);
    case SlopFinish.firstBatch:
      top = const Color(0xFFF4C596);
      bottom = const Color(0xFFDAA1A7);
    case SlopFinish.obsidian:
      top = const Color(0xFF56596E);
      bottom = const Color(0xFF292D42);
    case SlopFinish.clearGlass:
      top = const Color(0x76DAF5F6);
      bottom = const Color(0x429ECBD7);
    case SlopFinish.tidepool:
      top = const Color(0xFF91D9D7);
      bottom = const Color(0xFF66AEBD);
    case SlopFinish.galaxy:
      top = const Color(0xFFAC9CCF);
      bottom = const Color(0xFF6F729E);
    case SlopFinish.molten:
      top = const Color(0xFFF3BC9B);
      bottom = const Color(0xFFC7828D);
    case SlopFinish.wildfire:
      top = const Color(0xFFF0A080);
      bottom = const Color(0xFFC45F77);
    case SlopFinish.chrome:
      top = const Color(0xFFD6E0E6);
      bottom = const Color(0xFF98AFC3);
    case SlopFinish.pearl:
      top = const Color(0xFFF0E2EC);
      bottom = const Color(0xFFCABADD);
    case SlopFinish.hologram:
      top = const Color(0xFFE5CFE9);
      bottom = const Color(0xFFAFA5D8);
    case SlopFinish.aurora:
      top = const Color(0xFFAFE2C9);
      bottom = const Color(0xFF79B4C8);
    case SlopFinish.crystal:
      top = const Color(0xFFE6E8F6);
      bottom = const Color(0xFF9BC7D3);
    case SlopFinish.celPop:
      top = const Color(0xFFF7C1AF);
      bottom = const Color(0xFFE7A1AC);
    case SlopFinish.gummy:
      top = Color.lerp(p.light, p.glow, .22)!;
      bottom = Color.lerp(p.light, p.mid, .14)!;
    default:
      top = Color.lerp(p.light, p.glow, .36)!;
      bottom = Color.lerp(p.light, p.mid, .20)!;
  }
  return (top: top, bottom: bottom);
}

/// Paint a material over the caller's actual closed outline. A morph or
/// ribbon must never render a second rounded rectangle inside its silhouette.
/// Flat ribbons can disable [projectSurface] and keep [rect] stable while the
/// live [outline] moves. [textureOpacity] leaves base color and lighting intact.
void paintSlopFormMaterialSurface(
  Canvas canvas, {
  required Rect rect,
  required Path outline,
  required SlopLook look,
  required double phase,
  SlopSurfaceStyle surfaceStyle = SlopSurfaceStyle.clay,
  SlopToonDepthPose depthPose = SlopToonDepthPose.neutral,
  double rimOpacity = 1,
  bool projectSurface = true,
  double textureOpacity = 1,
  bool seamlessTexture = false,
}) {
  final bodyRect = rect;
  final unit = rect.width / 100;
  if (look.finish == SlopFinish.clearGlass) {
    // The center is a genuinely clear lens. Refraction follows the complete
    // silhouette; no square material layer, grain or opaque volume plane.
    canvas.save();
    canvas.clipPath(outline);
    canvas.drawPath(
      outline,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0x0AE7FBFF), Color(0x0314BCD1)],
        ).createShader(rect),
    );
    canvas.drawPath(
      outline,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = rect.shortestSide * .055
        ..color = const Color(0x126ACEDE),
    );
    canvas.restore();
    if (rimOpacity > 0) {
      canvas.drawPath(
        outline,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeJoin = StrokeJoin.round
          ..strokeWidth = math.max(.8, rect.shortestSide * .012)
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFE6FCFF).withValues(alpha: .95 * rimOpacity),
              const Color(0xFF8BDBEB).withValues(alpha: .78 * rimOpacity),
              const Color(0xFF62A7C4).withValues(alpha: .65 * rimOpacity),
            ],
          ).createShader(rect),
      );
    }
    return;
  }
  final material = slopFormMaterialColors(look);
  final top = material.top, bottom = material.bottom;
  canvas.drawPath(
    outline,
    Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [top, bottom],
      ).createShader(bodyRect),
  );
  canvas.save();
  canvas.clipPath(outline);
  final textureBounds = projectSurface ? bodyRect : outline.getBounds();
  if (textureOpacity < 1) {
    // Only patterns and finish effects soften; the body lighting stays intact.
    // Live ribbon edges can breathe outside their stable texture coordinates.
    canvas.saveLayer(
      textureBounds,
      Paint()..color = Colors.white.withValues(alpha: textureOpacity),
    );
  }
  if (look.finish != SlopFinish.clearGlass) {
    if (look.pattern != SlopPattern.none) {
      _paintFormSurface(
        canvas,
        bodyRect,
        depthPose.orientationAngle,
        (surface) => _paintFormPattern(
          surface,
          bodyRect,
          look,
          phase,
          seamlessMotion: seamlessTexture,
        ),
        repeat: true,
        projectSurface: projectSurface,
      );
    }
  }
  if (look.pattern != SlopPattern.slopCode &&
      look.finish != SlopFinish.jelly &&
      look.finish != SlopFinish.gummy) {
    canvas.saveLayer(
      textureBounds,
      Paint()..color = Colors.white.withValues(alpha: .86),
    );
    _paintFormSurface(
      canvas,
      bodyRect,
      depthPose.orientationAngle,
      (surface) => _paintSoftMaterial(surface, bodyRect, look, phase),
      repeat: true,
      projectSurface: projectSurface,
    );
    canvas.restore();
  }
  if (textureOpacity < 1) canvas.restore();
  if (surfaceStyle == SlopSurfaceStyle.toon ||
      surfaceStyle == SlopSurfaceStyle.clay) {
    _paintFormVolume(canvas, bodyRect, look, depthPose);
    paintSlopSculptedEdge(canvas, bodyRect, outline, look);
    _paintFormSurface(
      canvas,
      bodyRect,
      depthPose.orientationAngle,
      (surface) => _paintClayGrain(
        surface,
        bodyRect,
        strength: surfaceStyle == SlopSurfaceStyle.clay ? .50 : .20,
      ),
      repeat: true,
      projectSurface: projectSurface,
    );
  }
  if (surfaceStyle == SlopSurfaceStyle.paper) {
    _paintClayGrain(canvas, bodyRect, strength: .42);
    canvas.drawPath(
      Path()
        ..moveTo(bodyRect.center.dx, bodyRect.top)
        ..quadraticBezierTo(
          bodyRect.center.dx + unit * 3,
          bodyRect.center.dy,
          bodyRect.center.dx,
          bodyRect.bottom,
        ),
      Paint()
        ..color = const Color(0x1430253A)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * .8,
    );
  }
  canvas.restore();
  if (look.finish != SlopFinish.clearGlass) {
    canvas.drawPath(
      outline,
      Paint()
        ..color = const Color(0xFF51435F).withValues(alpha: .43 * rimOpacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(.8, bodyRect.shortestSide * .0075)
        ..strokeJoin = StrokeJoin.round,
    );
  }
  if (look.finish == SlopFinish.clearGlass) {
    canvas.drawPath(
      outline,
      Paint()
        ..color = const Color(0xFFA7CAD4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 1.5,
    );
  }
}

/// Two balanced five-eye constellations leave a clear mouth and forehead.
const slopManyEyeOffsets = <(double, double)>[
  (-22, -5),
  (-14, -5),
  (-26, 4),
  (-18, 4),
  (-10, 4),
  (14, -5),
  (22, -5),
  (10, 4),
  (18, 4),
  (26, 4),
];

List<({Offset center, double radius})> slopFaceEyeSocketsFor(
  SlopEyes eyes,
  Offset center,
  double unit,
) {
  if (eyes == SlopEyes.many) {
    return [
      for (final (x, y) in slopManyEyeOffsets)
        (center: center.translate(x * unit, y * unit), radius: unit * 3.6),
    ];
  }
  if (eyes == SlopEyes.three) {
    return [
      (center: center.translate(-unit * 15, unit * 4), radius: unit * 9.5),
      (center: center.translate(unit * 15, unit * 4), radius: unit * 9.5),
      (center: center.translate(0, -unit * 8), radius: unit * 7.4),
    ];
  }
  if (eyes == SlopEyes.cyclops || eyes == SlopEyes.slopCyclops) {
    return [(center: center, radius: unit * 19 * slopCyclopsEyeScale)];
  }
  return [
    for (final side in [-1, 1])
      (center: center.translate(side * unit * 15, 0), radius: unit * 11.2),
  ];
}

/// A curved, translucent aqua shield leaves two actual eyes visible. The
/// visor follows the same projected surface as its face, never a black bar.
void paintSlopBubbleVisor(Canvas canvas, Offset center, double unit) {
  final glass = RRect.fromRectAndRadius(
    Rect.fromCenter(center: center, width: unit * 65, height: unit * 30),
    Radius.circular(unit * 14),
  );
  canvas.drawRRect(
    glass,
    Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0x40EFFCFF), Color(0x207CBACF), Color(0x35E6E4FF)],
      ).createShader(glass.outerRect),
  );
  canvas.drawRRect(
    glass,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 1.4
      ..color = const Color(0xFF9EBACB),
  );
  canvas.drawPath(
    Path()
      ..moveTo(center.dx - unit * 27, center.dy - unit * 8)
      ..quadraticBezierTo(
        center.dx,
        center.dy - unit * 17,
        center.dx + unit * 26,
        center.dy - unit * 8,
      ),
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 1.4
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xCBFFFFFF),
  );
  for (final side in [-1, 1]) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: center.translate(side * unit * 32, unit),
          width: unit * 4,
          height: unit * 9,
        ),
        Radius.circular(unit * 2),
      ),
      Paint()..color = const Color(0xFFA8B6D0),
    );
  }
}

final _slopIrisLettering = Path()
  ..moveTo(5, 2.3)
  ..cubicTo(1, -.2, -1, 4, 2.3, 4.8)
  ..cubicTo(7, 5.8, 4, 9, .3, 6.8)
  ..moveTo(8, .5)
  ..lineTo(8, 7.5)
  ..addOval(const Rect.fromLTWH(11, 2, 5, 6))
  ..moveTo(19, 2)
  ..lineTo(19, 10)
  ..moveTo(19, 3)
  ..cubicTo(26, -1, 26, 10, 19, 6.8);

/// Vector lettering remains 'slop' at every font-loading state. A generous
/// capsule iris leaves enough negative space around all four lowercase forms.
void paintSlopIrisWordmark(Canvas canvas, Rect rect, Color color) {
  final scale = math.min(rect.width / 27, rect.height / 12);
  canvas.save();
  canvas.translate(rect.center.dx - 12.5 * scale, rect.center.dy - 5 * scale);
  canvas.scale(scale);
  canvas.drawPath(
    _slopIrisLettering,
    Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round,
  );
  canvas.restore();
}

void _paintFormVolume(
  Canvas canvas,
  Rect rect,
  SlopLook look,
  SlopToonDepthPose pose,
) {
  if (look.finish == SlopFinish.jelly || look.finish == SlopFinish.gummy) {
    // A broad, curved light falloff gives the front plane visible volume at
    // profile size. Lighting stays in screen space while the face/patterns
    // wrap around the body, so a drag reads as turning a rounded object.
    final shade = Color.lerp(look.palette.shade, const Color(0xFF332C4E), .14)!;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: Alignment(-.38 + pose.lightOffsetX * .30, -.42),
          radius: .86,
          colors: [
            Colors.white.withValues(alpha: .36),
            Colors.white.withValues(alpha: .10),
            shade.withValues(alpha: .03),
            shade.withValues(alpha: .14),
            shade.withValues(alpha: .34),
          ],
          stops: const [0, .25, .42, .68, 1],
        ).createShader(rect),
    );
    // A small amount of reflected light keeps the lower contour soft.
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(.34, 1.05),
          radius: .64,
          colors: [
            look.palette.glow.withValues(alpha: .12),
            look.palette.glow.withValues(alpha: 0),
          ],
        ).createShader(rect),
    );
    return;
  }
  final transparent = Colors.white.withValues(alpha: 0);
  final glass = look.finish == SlopFinish.clearGlass;
  canvas.drawRect(
    rect,
    Paint()
      ..shader = RadialGradient(
        center: Alignment(-.36 + pose.lightOffsetX * .18, -.60),
        radius: 1.25,
        colors: [
          Colors.white.withValues(alpha: glass ? .12 : .34),
          Colors.white.withValues(alpha: .045),
          transparent,
        ],
        stops: const [0, .56, 1],
      ).createShader(rect),
  );
  canvas.drawRect(
    rect,
    Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0x001C193A), Color(0x001C193A), Color(0x201C193A)],
        stops: [0, .45, 1],
      ).createShader(rect),
  );
  canvas.drawRect(
    rect,
    Paint()
      ..shader = RadialGradient(
        center: const Alignment(-.20, -.22),
        radius: .98,
        colors: [
          const Color(0x001E1635),
          const Color(0x001E1635),
          Color(0x1C1E1635).withValues(alpha: glass ? .045 : .10),
        ],
        stops: const [0, .68, 1],
      ).createShader(rect),
  );
}

/// Soft edge relief follows the silhouette itself, including each lobe. The
/// layered strokes avoid a glossy oval highlight floating over a flat body.
void paintSlopSculptedEdge(
  Canvas canvas,
  Rect rect,
  Path outline,
  SlopLook look,
) {
  if (look.finish == SlopFinish.clearGlass) return;
  final soft =
      look.finish == SlopFinish.jelly || look.finish == SlopFinish.gummy;
  final strength = soft ? 1.0 : .48;
  canvas.save();
  canvas.clipPath(outline);
  final shader = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Colors.white.withValues(alpha: .011),
      const Color(0x003F2D48),
      const Color(0xFF46344E).withValues(alpha: .018 * strength),
    ],
    stops: const [0, .33, 1],
  ).createShader(rect);
  for (var layer = 0; layer < 12; layer++) {
    canvas.drawPath(
      outline,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = rect.shortestSide * .16 * (1 - layer / 12)
        ..strokeJoin = StrokeJoin.round
        ..shader = shader,
    );
  }
  canvas.restore();
}

final _slopClayGrainPaths = (() {
  final random = math.Random(8147);
  final dark = Path(), light = Path();
  for (var i = 0; i < 140; i++) {
    final point = Offset(random.nextDouble(), random.nextDouble());
    final radius = .0018 + random.nextDouble() * .0025;
    (i.isEven ? dark : light).addOval(
      Rect.fromCenter(center: point, width: radius * 2.4, height: radius * 1.7),
    );
  }
  return (dark: dark, light: light);
})();

void _paintClayGrain(Canvas canvas, Rect rect, {double strength = 1}) {
  // Two pooled vector draws instead of hundreds of per-dot draw calls per
  // surface slice. The tactile marks stay fixed to the material as it turns.
  canvas.save();
  canvas.translate(rect.left, rect.top);
  canvas.scale(rect.width, rect.height);
  canvas.drawPath(
    _slopClayGrainPaths.dark,
    Paint()..color = const Color(0xFF4A3047).withValues(alpha: .065 * strength),
  );
  canvas.drawPath(
    _slopClayGrainPaths.light,
    Paint()..color = Colors.white.withValues(alpha: .13 * strength),
  );
  canvas.restore();
}

void _paintFormPattern(
  Canvas canvas,
  Rect rect,
  SlopLook look,
  double phase, {
  bool seamlessMotion = false,
}) {
  if (look.pattern == SlopPattern.arcadeBits) {
    final unit = rect.shortestSide / 100;
    final spacing = unit * 22;
    const colors = [Color(0xFF74CEDB), Color(0xFFC095D9), Color(0xFFFFB894)];
    // A complete surface repeat keeps tiny controller inlays visible on the
    // front and the back instead of marooning four stickers at the side seam.
    for (var row = -1; row <= (rect.height / spacing).ceil(); row++) {
      for (var col = -1; col <= (rect.width / spacing).ceil(); col++) {
        final center = Offset(
          rect.left + (col + (row.isOdd ? .5 : 0)) * spacing,
          rect.top +
              (row + .35) * spacing +
              math.sin(phase * math.pi * 2 + row + col) * unit * .55,
        );
        final paint = Paint()..color = colors[(row + col).abs() % 3];
        if ((row + col).isEven) {
          for (final size in [
            Size(unit * 6, unit * 2),
            Size(unit * 2, unit * 6),
          ]) {
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromCenter(
                  center: center,
                  width: size.width,
                  height: size.height,
                ),
                Radius.circular(unit * .7),
              ),
              paint,
            );
          }
        } else {
          canvas.drawCircle(center, unit * 2, paint);
          canvas.drawCircle(
            center.translate(-unit * .5, -unit * .5),
            unit * .55,
            Paint()..color = const Color(0x88FFFFFF),
          );
        }
      }
    }
    return;
  }
  if (look.pattern == SlopPattern.cloudQuilt) {
    paintSlopCloudQuilt(canvas, rect, phase);
    return;
  }
  if (look.pattern == SlopPattern.pixelPetal) {
    paintSlopPixelPetal(canvas, rect, phase);
    return;
  }
  if (look.pattern == SlopPattern.slopCode) {
    paintSlopBinaryCode(canvas, rect, phase);
    return;
  }
  if (look.pattern != SlopPattern.stripes) {
    SlopRenderer._paintPattern(
      canvas,
      rect,
      look,
      phase,
      seamlessMotion: seamlessMotion,
    );
    return;
  }
  final stripe = Paint()
    ..color = look.palette.shade.withValues(alpha: .18)
    ..style = PaintingStyle.stroke
    ..strokeWidth = rect.width * .062;
  // An integer number of bands around the circumference closes the back seam.
  for (var i = -3; i < 10; i++) {
    final x = rect.left + i * rect.width / 6;
    canvas.drawLine(
      Offset(x, rect.bottom),
      Offset(x + rect.width * .35, rect.top),
      stripe,
    );
  }
}

/// Paint one face against an already interpolated body. Shape performances
/// must not reapply a settled body's proportions or clip against its old path.
void paintSlopMorphFace(
  Canvas canvas, {
  required Rect rect,
  required Path outline,
  required SlopLook look,
  required SlopBody from,
  required SlopBody to,
  required double morph,
  required SlopEmotion emotion,
  required double phase,
  required Offset gaze,
  required double talk,
  required double opening,
}) {
  final a = slopFormFaceFitFor(from), b = slopFormFaceFitFor(to);
  final offset = a.offsetY + (b.offsetY - a.offsetY) * morph;
  final scale = a.scale + (b.scale - a.scale) * morph;
  final triangle =
      (from == SlopBody.triangle ? 1 - morph : 0.0) +
      (to == SlopBody.triangle ? morph : 0.0);
  canvas.save();
  canvas.clipPath(outline);
  SlopFormRenderer._face(
    canvas,
    center: Offset(
      rect.center.dx,
      rect.top + rect.height * (.43 + offset + .045 * triangle - opening * .11),
    ),
    unit: rect.width / 100 * .96 * scale * (1 - .12 * triangle),
    look: look,
    emotion: emotion,
    phase: phase,
    gaze: gaze,
    talk: talk,
    smirk: 0,
    reaction: 0,
    showMouth: true,
    mouthOpacity: (1 - opening / .18).clamp(0.0, 1.0),
    facialLineColor: slopMaterialFacialLineColorFor(look),
  );
  canvas.restore();
}

abstract final class SlopFormRenderer {
  static void paint(
    Canvas canvas, {
    required Rect rect,
    required SlopLook look,
    required SlopEmotion emotion,
    required double round,
    required double phase,
    required double reaction,
    required Offset gaze,
    required double talk,
    double smirk = 0,
    required double faceAnchor,
    required double faceScale,
    required double opacity,
    required SlopShift? shift,
    required double shiftT,
    required double shiftStrength,
    required bool hat,
    required bool shadow,
    required bool ambient,
    required bool showBody,
    required bool showFace,
    required bool showMouth,
    required double mouthOpacity,
    required bool centerFaceHorizontally,
    required Color? facialLineColor,
    required SlopSurfaceStyle surfaceStyle,
    required SlopToonDepthPose depthPose,
    required SlopAuraDepthPass auraDepthPass,
    required SlopHeadwearDepthPass headwearDepthPass,
  }) {
    look = slopLookWithCurrentChampion(look);
    if (rect.isEmpty || opacity <= 0) return;
    final p = look.palette;
    final panel = round.clamp(0.0, 1.0);
    final proportions = slopBodyProportionsFor(look.body);
    final spring = math.sin(reaction * math.pi * 3) * (1 - reaction);
    final natural = Rect.fromCenter(
      center: rect.center,
      width:
          math.min(rect.width, rect.height * 1.12) *
          proportions.width *
          depthPose.bodyScaleX *
          (1 + spring * .09),
      height: rect.height * proportions.height * (1 - spring * .07),
    );
    final bodyRect = Rect.lerp(natural, rect, panel)!;
    final unit = bodyRect.width / 100;
    final outline = slopFormOutlineFor(
      bodyRect,
      body: look.body,
      phase: phase,
      round: round,
      shift: shift,
      shiftT: shiftT,
      shiftStrength: shiftStrength,
      orientationAngle: depthPose.orientationAngle,
    );
    canvas.save();
    if (opacity < 1) {
      canvas.saveLayer(
        rect.inflate(rect.width),
        Paint()..color = Colors.white.withValues(alpha: opacity),
      );
    }
    if (ambient && auraDepthPass != SlopAuraDepthPass.front) {
      _paintFittedFormAura(
        canvas,
        bodyRect,
        look,
        phase,
        reaction,
        depthPose: depthPose,
        depthPass: SlopAuraDepthPass.rear,
      );
    }
    if (showBody &&
        ambient &&
        look.finish == SlopFinish.wildfire &&
        auraDepthPass != SlopAuraDepthPass.front) {
      SlopRenderer._paintFinishAtmosphere(canvas, bodyRect, phase);
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
        bodyOutline: outline,
        opacity: 1 - panel,
      );
      if (shadow) {
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(bodyRect.center.dx, bodyRect.bottom + 4 * unit),
            width: bodyRect.width * .56,
            height: unit * 5,
          ),
          Paint()
            ..color = const Color(0x16192230)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 4),
        );
      }
      paintSlopFormMaterialSurface(
        canvas,
        rect: bodyRect,
        outline: outline,
        look: look,
        phase: phase,
        surfaceStyle: surfaceStyle,
        depthPose: depthPose,
      );
    }
    if (showBody && shift == SlopShift.eyeStalk && shiftT > 0 && shiftT < 1) {
      final lift = math.sin(shiftT * math.pi) * shiftStrength.clamp(0.0, 1.0);
      final root = bodyRect.topCenter.translate(0, bodyRect.height * .1);
      final tip = root.translate(
        math.sin(phase * math.pi * 2) * unit * 2 * lift,
        -bodyRect.height * .32 * lift,
      );
      final radius = bodyRect.shortestSide * .09 * lift;
      final stalk = Path()
        ..moveTo(root.dx, root.dy)
        ..quadraticBezierTo(root.dx - unit * 3, tip.dy, tip.dx, tip.dy);
      canvas.drawPath(
        stalk,
        Paint()
          ..color = p.light
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(.5, unit * 8 * lift)
          ..strokeCap = StrokeCap.round,
      );
      canvas.drawCircle(tip, radius * 1.18, Paint()..color = p.light);
      canvas.drawCircle(tip, radius, Paint()..color = const Color(0xFFFFFEFB));
      final pupil = tip + gaze * radius * .2;
      canvas.drawCircle(
        pupil,
        radius * .56,
        Paint()..color = slopEyeDeepToneFor(slopResolvedEyeColorFor(look)),
      );
      canvas.drawCircle(
        pupil,
        radius * .45,
        Paint()..color = slopResolvedEyeColorFor(look),
      );
      canvas.drawCircle(
        pupil.translate(-radius * .18, -radius * .2),
        radius * .14,
        Paint()..color = const Color(0xFFFFFEFB),
      );
    }
    if (showBody && look.pattern == SlopPattern.itCouldBeWorseRobot) {
      SlopRenderer._paintItCouldBeWorseRobotAntennas(
        canvas,
        bodyRect,
        unit,
        math.sin(phase * math.pi * 2),
      );
    }
    if (hat && look.hat != SlopHat.none) {
      final crownRect = Rect.fromCenter(
        center: bodyRect.center,
        width: bodyRect.width / depthPose.bodyScaleX,
        height: bodyRect.height,
      );
      canvas.saveLayer(crownRect.inflate(crownRect.width), Paint());
      SlopRenderer._paintHat(
        canvas,
        crownRect,
        look,
        round: round,
        wave: math.sin(phase * math.pi * 2),
        unit: crownRect.width / 100 * .86,
        depthPose: depthPose,
        depthPass: headwearDepthPass,
      );
      canvas.drawRect(
        crownRect.inflate(crownRect.width),
        Paint()
          ..blendMode = BlendMode.srcATop
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: const [
              Color(0x20FFFFFF),
              Color(0x00FFFFFF),
              Color(0x202B1D3C),
            ],
          ).createShader(crownRect.inflate(crownRect.height * .3)),
      );
      canvas.restore();
    }
    final faceFit = slopFormFaceFitFor(look.body, round: round);
    final faceCenter = Offset(
      bodyRect.center.dx +
          (centerFaceHorizontally
              ? 0
              : math.sin(phase * math.pi * 2) * unit * .5),
      bodyRect.top + bodyRect.height * (faceAnchor + faceFit.offsetY),
    );
    if (showFace && depthPose.orientationAngle.abs() < math.pi * .78) {
      canvas.save();
      canvas.clipPath(outline);
      _paintFormSurface(
        canvas,
        bodyRect,
        depthPose.orientationAngle,
        (surface) => _face(
          surface,
          center: faceCenter,
          unit: unit * faceScale * faceFit.scale,
          look: look,
          emotion: emotion,
          phase: phase,
          gaze: gaze,
          talk: talk,
          smirk: smirk,
          reaction: reaction,
          showMouth: showMouth,
          mouthOpacity: mouthOpacity,
          facialLineColor: facialLineColor,
        ),
      );
      canvas.restore();
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
        bodyOutline: outline,
        opacity: 1 - panel,
      );
    }
    if (ambient && auraDepthPass != SlopAuraDepthPass.rear) {
      _paintFittedFormAura(
        canvas,
        bodyRect,
        look,
        phase,
        reaction,
        depthPose: depthPose,
        depthPass: SlopAuraDepthPass.front,
      );
    }
    if (opacity < 1) canvas.restore();
    canvas.restore();
  }

  static void _face(
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
    required Color? facialLineColor,
  }) {
    final ink =
        facialLineColor ??
        (look.finish == SlopFinish.obsidian
            ? const Color(0xFFF6F7F9)
            : const Color(0xFF24282A));
    final line = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 3.7
      ..strokeCap = StrokeCap.round;
    final white = Paint()..color = const Color(0xFFFFFEFB);
    final selectedEye = slopResolvedEyeColorFor(look);
    final eyeStroke = Paint()
      ..color = selectedEye
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 3.7
      ..strokeCap = StrokeCap.round;
    final eye = look.eyes;
    final cyclops = eye == SlopEyes.cyclops || eye == SlopEyes.slopCyclops;
    final gap = cyclops ? 0.0 : unit * 15;
    final blink = 1 - SlopRenderer._blink(phase);
    final mouth = center.translate(0, unit * 22);
    final sockets = slopFaceEyeSocketsFor(eye, center, unit);
    if (look.pattern == SlopPattern.itCouldBeWorseRobot) {
      // Match the source robot's two vertical temple seams. They belong to the
      // turning face plane, outside the sockets—not across the mouth as a
      // horizontal jaw divider.
      final seamPaint = Paint()
        ..color = const Color(0xFF6B3032).withValues(alpha: .82)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 1.25
        ..strokeCap = StrokeCap.round;
      for (final direction in [-1.0, 1.0]) {
        final x = center.dx + direction * unit * 29.2;
        canvas.drawPath(
          Path()
            ..moveTo(x, center.dy - unit * 10.2)
            ..quadraticBezierTo(
              x + direction * unit * .9,
              center.dy,
              x,
              center.dy + unit * 10.4,
            ),
          seamPaint,
        );
      }
      for (final direction in [-1.0, 1.0]) {
        final c = center.translate(
          direction * unit * 15,
          gaze.dy.clamp(-1.0, 1.0) * unit * .6,
        );
        final socket = RRect.fromRectAndRadius(
          Rect.fromCenter(center: c, width: unit * 22, height: unit * 18),
          Radius.circular(unit * 4.5),
        );
        canvas.drawRRect(socket, Paint()..color = const Color(0xFF321F24));
        if (blink < .16) {
          canvas.drawLine(
            c.translate(-unit * 4.2, 0),
            c.translate(unit * 4.2, 0),
            Paint()
              ..color = const Color(0xFFFF6A42)
              ..strokeWidth = unit * 1.7
              ..strokeCap = StrokeCap.round,
          );
        } else {
          final glow = Rect.fromCircle(center: c, radius: unit * 3.4);
          canvas.drawCircle(
            c,
            unit * 2.9,
            Paint()
              ..shader = const RadialGradient(
                colors: [
                  Color(0xFFFFE0A0),
                  Color(0xFFFF6A42),
                  Color(0xFF8E2330),
                ],
                stops: [0, .46, 1],
              ).createShader(glow),
          );
          canvas.drawCircle(
            c.translate(-unit * .9, -unit * 1.0),
            unit * .75,
            white,
          );
        }
      }
      if (showMouth && mouthOpacity > 0) {
        SlopRenderer._paintMouth(
          canvas,
          center: mouth,
          unit: unit * .8,
          look: look,
          emotion: emotion,
          talk: talk,
          smirk: smirk,
          reaction: reaction,
          facialLineColor: ink,
        );
      }
      return;
    }
    if (eye == SlopEyes.visor) paintSlopBubbleVisor(canvas, center, unit);
    for (var i = 0; i < sockets.length; i++) {
      final c = sockets[i].center;
      final r = sockets[i].radius;
      final closed =
          blink < .16 ||
          (eye == SlopEyes.wink && i == 1) ||
          eye == SlopEyes.squint;
      if (closed) {
        final path = Path()
          ..moveTo(c.dx - r * .7, c.dy)
          ..quadraticBezierTo(c.dx, c.dy - r * .44, c.dx + r * .7, c.dy);
        canvas.drawPath(path, eyeStroke);
        continue;
      }
      if (eye == SlopEyes.dot) {
        canvas.drawOval(
          Rect.fromCenter(center: c, width: r * .72, height: r),
          Paint()..color = selectedEye,
        );
        continue;
      }
      final height = switch (eye) {
        SlopEyes.sleepy || SlopEyes.angry => .72,
        SlopEyes.wide => 1.2,
        SlopEyes.liquid => 1.35,
        SlopEyes.crescent => .6,
        _ => 1.0,
      };
      final socket = Rect.fromCenter(
        center: c,
        width: r * 2,
        height: r * 2 * height * blink,
      );
      canvas.drawOval(
        socket.translate(0, unit * .8),
        Paint()..color = const Color(0x172B193A),
      );
      canvas.drawOval(
        socket,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFFEFB), Color(0xFFF3EDF8)],
          ).createShader(socket),
      );
      canvas.save();
      canvas.clipPath(Path()..addOval(socket));
      final pupil =
          c +
          Offset(
            gaze.dx.clamp(-1.0, 1.0) * r * .32,
            gaze.dy.clamp(-1.0, 1.0) * r * .22,
          );
      // Keep the chosen pigment visible. Mixing every iris halfway into
      // charcoal made Sky, Mint and Rose indistinguishable from their swatches.
      final pupilPaint = Paint()..color = selectedEye;
      if (eye == SlopEyes.slopCyclops) {
        final iris = Rect.fromCenter(
          center: pupil,
          width: r * 1.62,
          height: r * .92 * blink,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(iris, Radius.circular(iris.height * .48)),
          pupilPaint,
        );
        paintSlopIrisWordmark(
          canvas,
          iris.deflate(unit * 1.2),
          ThemeData.estimateBrightnessForColor(selectedEye) == Brightness.dark
              ? const Color(0xFFFFFADE)
              : slopEyeDeepToneFor(selectedEye),
        );
      } else if (eye == SlopEyes.heart) {
        final path = Path()
          ..moveTo(pupil.dx, pupil.dy + r * .65)
          ..cubicTo(
            pupil.dx - r * 1.1,
            pupil.dy,
            pupil.dx - r * .65,
            pupil.dy - r * .7,
            pupil.dx,
            pupil.dy - r * .23,
          )
          ..cubicTo(
            pupil.dx + r * .65,
            pupil.dy - r * .7,
            pupil.dx + r * 1.1,
            pupil.dy,
            pupil.dx,
            pupil.dy + r * .65,
          );
        canvas.drawPath(path, pupilPaint);
      } else if (eye == SlopEyes.star || eye == SlopEyes.sparkle) {
        final path = Path();
        for (var j = 0; j < 10; j++) {
          final a = -math.pi / 2 + j * math.pi / 5;
          final rr = r * (j.isEven ? .65 : .29);
          final point = pupil + Offset(math.cos(a) * rr, math.sin(a) * rr);
          if (j == 0) {
            path.moveTo(point.dx, point.dy);
          } else {
            path.lineTo(point.dx, point.dy);
          }
        }
        canvas.drawPath(path..close(), pupilPaint);
      } else if (eye == SlopEyes.spiral) {
        final path = Path()..moveTo(pupil.dx, pupil.dy);
        for (var j = 1; j < 50; j++) {
          final a = j * .24;
          final rr = r * .012 * j;
          path.lineTo(pupil.dx + math.cos(a) * rr, pupil.dy + math.sin(a) * rr);
        }
        canvas.drawPath(
          path,
          Paint()
            ..color = pupilPaint.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = unit * 1.6,
        );
      } else {
        canvas.drawOval(
          Rect.fromCenter(
            center: pupil,
            width: r * (emotion == SlopEmotion.curious ? .66 : 1.08),
            height:
                r *
                (eye == SlopEyes.kawaii
                    ? 1.45
                    : emotion == SlopEmotion.curious
                    ? .76
                    : 1.18) *
                blink,
          ),
          pupilPaint,
        );
        if (eye == SlopEyes.kawaii ||
            eye == SlopEyes.orbit ||
            eye == SlopEyes.slopCyclops) {
          canvas.drawCircle(pupil.translate(-r * .2, -r * .28), r * .16, white);
        }
        if (eye == SlopEyes.orbit) {
          canvas.drawOval(
            Rect.fromCenter(center: pupil, width: r * 1.7, height: r * .52),
            Paint()
              ..color = look.palette.deep
              ..style = PaintingStyle.stroke
              ..strokeWidth = unit * 1.4,
          );
        }
      }
      canvas.restore();
      if (eye == SlopEyes.velvetLash) {
        for (var lash = 0; lash < 3; lash++) {
          canvas.drawLine(
            c + Offset((lash - 1) * r * .5, -r * .85),
            c + Offset((lash - 1) * r * .7, -r * 1.28),
            line,
          );
        }
      }
    }
    if (eye != SlopEyes.many &&
        eye != SlopEyes.visor &&
        eye != SlopEyes.three) {
      final curious =
          emotion == SlopEmotion.curious || emotion == SlopEmotion.thinking;
      for (final direction in cyclops ? [0.0] : [-1.0, 1.0]) {
        final x = center.dx + direction * gap;
        final y = center.dy - unit * (cyclops ? 26 : 20);
        final tilt = (eye == SlopEyes.angry ? 1 : -1) * direction * unit * 2.2;
        canvas.drawLine(
          Offset(
            x - unit * 7.3,
            y + tilt - (curious && direction > 0 ? unit * 3 : 0),
          ),
          Offset(x + unit * 7.3, y - tilt),
          Paint()
            ..color = ink
            ..strokeWidth = unit * 3.8
            ..strokeCap = StrokeCap.round,
        );
      }
    }
    if (look.blush) {
      for (final direction in [-1.0, 1.0]) {
        canvas.drawOval(
          Rect.fromCenter(
            center: center.translate(direction * unit * 29, unit * 12),
            width: unit * 10,
            height: unit * 5,
          ),
          Paint()..color = look.palette.cheek.withValues(alpha: .32),
        );
      }
    }
    if (showMouth && mouthOpacity > 0) {
      canvas.saveLayer(
        Rect.fromCenter(center: mouth, width: unit * 55, height: unit * 40),
        Paint()
          ..color = Colors.white.withValues(
            alpha: mouthOpacity.clamp(0.0, 1.0),
          ),
      );
      SlopRenderer._paintMouth(
        canvas,
        center: mouth,
        unit: unit * .8,
        look: look,
        emotion: emotion,
        talk: talk,
        smirk: smirk,
        reaction: reaction,
        facialLineColor: ink,
      );
      canvas.restore();
    }
    if (look.accessory == SlopAccessory.glasses ||
        look.accessory == SlopAccessory.shades) {
      final shades = look.accessory == SlopAccessory.shades;
      final frame = Paint()
        ..color = const Color(0xFF44314F)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 2.3
        ..strokeJoin = StrokeJoin.round;
      final halfWidth = unit * (cyclops ? 22 : 12.5);
      final halfHeight = unit * (cyclops ? 21 : 12.8);
      for (final lensCenter
          in cyclops
              ? [center]
              : [center.translate(-gap, 0), center.translate(gap, 0)]) {
        final lens = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: lensCenter,
            width: halfWidth * 2,
            height: halfHeight * 2,
          ),
          Radius.circular(unit * 8),
        );
        canvas.drawRRect(
          lens,
          Paint()
            ..color = shades
                ? const Color(0xFF493C5D)
                : const Color(0x0FE3D8FA),
        );
        canvas.drawRRect(lens, frame);
        canvas.drawLine(
          lensCenter.translate(-halfWidth * .50, -halfHeight * .46),
          lensCenter.translate(-halfWidth * .06, -halfHeight * .64),
          Paint()
            ..color = const Color(0xA6FFFFFF)
            ..strokeWidth = unit * 1.5
            ..strokeCap = StrokeCap.round,
        );
      }
      if (!cyclops) {
        canvas.drawPath(
          Path()
            ..moveTo(center.dx - gap + halfWidth, center.dy)
            ..quadraticBezierTo(
              center.dx,
              center.dy - unit * 3,
              center.dx + gap - halfWidth,
              center.dy,
            ),
          frame,
        );
      }
    } else {
      SlopRenderer._paintAccessory(
        canvas,
        center: center,
        eyeY: center.dy,
        mouthCenter: mouth,
        gap: gap,
        eyeW: unit * 17,
        eyeH: unit * 22,
        unit: unit * .85,
        look: look,
      );
    }
  }
}

/// Lunar Glaze retains the original persisted reward ID. Small pearl inlays
/// have physical dimensions, so the design stays legible on a wide ribbon.
void paintSlopPixelPetal(Canvas canvas, Rect rect, double phase) {
  final u = rect.shortestSide / 100;
  final spacing = u * 29;
  final cycle = phase * math.pi * 2;
  for (var row = -1; row <= (rect.height / spacing).ceil(); row++) {
    for (var col = -1; col <= (rect.width / spacing).ceil(); col++) {
      final center = Offset(
        rect.left + (col + (row.isOdd ? .5 : 0)) * spacing,
        rect.top + row * spacing,
      );
      final moon = (row + col) % 3 == 0;
      final motif = Path();
      if (moon) {
        final outer = Path()
          ..addOval(Rect.fromCircle(center: center, radius: u * 4.9));
        final cut = Path()
          ..addOval(
            Rect.fromCircle(
              center: center + Offset(u * 2.7, -u * 1.9),
              radius: u * 4.25,
            ),
          );
        motif.addPath(
          Path.combine(PathOperation.difference, outer, cut),
          Offset.zero,
        );
      } else {
        final r = u * 2.9;
        motif.moveTo(center.dx, center.dy - r);
        motif.quadraticBezierTo(
          center.dx + r * .2,
          center.dy - r * .2,
          center.dx + r,
          center.dy,
        );
        motif.quadraticBezierTo(
          center.dx + r * .2,
          center.dy + r * .2,
          center.dx,
          center.dy + r,
        );
        motif.quadraticBezierTo(
          center.dx - r * .2,
          center.dy + r * .2,
          center.dx - r,
          center.dy,
        );
        motif.quadraticBezierTo(
          center.dx - r * .2,
          center.dy - r * .2,
          center.dx,
          center.dy - r,
        );
        motif.close();
      }
      canvas.drawPath(
        motif.shift(Offset(0, u * .65)),
        Paint()..color = const Color(0x44665B91),
      );
      canvas.drawPath(
        motif,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFFEBC7), Color(0xFFFAF4F4), Color(0xFFBDDCE6)],
          ).createShader(Rect.fromCircle(center: center, radius: u * 5)),
      );
      final glint = .5 + .5 * math.sin(cycle + col * 1.7 + row * 1.3);
      canvas.drawCircle(
        center + Offset(u * 7, u * 8),
        u * (.55 + glint * .35),
        Paint()
          ..color = const Color(
            0xFFF7F1E7,
          ).withValues(alpha: .36 + glint * .32),
      );
    }
  }
}

/// Four signature finishes share exactly the same art on avatars and ribbons.
/// Features use the shorter side so the long ribbon never stretches a spot
/// into a stripe. Only integer clock harmonics move these closed-loop surfaces.
bool paintSlopSignatureMaterial(
  Canvas canvas,
  Rect rect,
  SlopLook look,
  double phase,
) {
  if (!const {
    SlopFinish.celPop,
    SlopFinish.gold,
    SlopFinish.obsidian,
    SlopFinish.crystal,
  }.contains(look.finish)) {
    return false;
  }
  final w = rect.width, h = rect.height, d = rect.shortestSide;
  final clock = phase * math.pi * 2;
  Offset point(double x, double y) =>
      Offset(rect.left + w * x, rect.top + h * y);
  Path island(Offset c, double rx, double ry, double bend) => Path()
    ..moveTo(c.dx - rx, c.dy)
    ..cubicTo(
      c.dx - rx * .9,
      c.dy - ry,
      c.dx + rx * bend,
      c.dy - ry * 1.1,
      c.dx + rx * .82,
      c.dy - ry * .45,
    )
    ..cubicTo(
      c.dx + rx * 1.15,
      c.dy + ry * .3,
      c.dx + rx * .25,
      c.dy + ry,
      c.dx - rx * .55,
      c.dy + ry * .72,
    )
    ..cubicTo(
      c.dx - rx * .95,
      c.dy + ry * .45,
      c.dx - rx * 1.08,
      c.dy + ry * .25,
      c.dx - rx,
      c.dy,
    )
    ..close();
  switch (look.finish) {
    case SlopFinish.celPop:
      for (var i = 0; i < 3; i++) {
        final x = [.33, .67, .58][i], y = [.30, .68, .88][i];
        final c = point(x, y).translate(
          math.sin(clock + i * 2) * d * .025,
          math.cos(clock + i * 2) * d * .03,
        );
        final shape = island(
          c,
          d * [.24, .22, .28][i],
          d * [.21, .30, .15][i],
          .20 + .12 * math.sin(clock + i),
        );
        canvas.drawPath(
          shape,
          Paint()
            ..color = [
              const Color(0xFFFBE1B4),
              const Color(0xFFBE99B7),
              const Color(0xFFF4C49C),
            ][i].withValues(alpha: .86),
        );
        canvas.drawPath(
          shape,
          Paint()
            ..color = const Color(0xFF7C4D71).withValues(alpha: .10)
            ..style = PaintingStyle.stroke
            ..strokeWidth = d * .012,
        );
      }
      for (var i = 0; i < 5; i++) {
        canvas.drawCircle(
          point(.09 + (i % 2) * .043, .62 + i * .035),
          d * .009,
          Paint()..color = const Color(0xFFA56786).withValues(alpha: .55),
        );
      }
    case SlopFinish.gold:
      final drift = .10 * math.sin(clock);
      final reflection = Path()
        ..moveTo(rect.left + w * (.17 + drift), rect.top - h * .12)
        ..cubicTo(
          rect.left + w * (.57 + drift),
          rect.top + h * .20,
          rect.left + w * (.08 + drift),
          rect.top + h * .63,
          rect.left + w * (.40 + drift),
          rect.bottom + h * .12,
        )
        ..lineTo(rect.left + w * (.64 + drift), rect.bottom + h * .12)
        ..cubicTo(
          rect.left + w * (.31 + drift),
          rect.top + h * .61,
          rect.left + w * (.80 + drift),
          rect.top + h * .21,
          rect.left + w * (.37 + drift),
          rect.top - h * .12,
        )
        ..close();
      canvas.drawPath(
        reflection,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xAFFFF8DF), Color(0xE8FFF5CF), Color(0x28F7D997)],
          ).createShader(rect),
      );
      final low = island(
        point(.87 + .035 * math.cos(clock), .74),
        d * .30,
        h * .31,
        .4,
      );
      canvas.drawPath(
        low,
        Paint()
          ..shader = const LinearGradient(
            colors: [Color(0x08B77A35), Color(0x50996538)],
          ).createShader(low.getBounds()),
      );
      for (var i = 0; i < 3; i++) {
        final c = point(.14 + i * .36, .82 - i * .29);
        final glint = (.5 + .5 * math.sin(clock + i * 2));
        canvas.drawOval(
          Rect.fromCenter(
            center: c,
            width: d * (.018 + .012 * glint),
            height: d * (.038 + .018 * glint),
          ),
          Paint()
            ..color = const Color(
              0xFFFFF8E1,
            ).withValues(alpha: .35 + .45 * glint),
        );
      }
    case SlopFinish.obsidian:
      for (var i = 0; i < 3; i++) {
        final c = point([.31, .69, .58][i], [.34, .64, .88][i]).translate(
          math.sin(clock + i * 2) * d * .04,
          math.cos(clock + i * 2) * d * .04,
        );
        final p = island(c, d * [.22, .23, .35][i], h * [.36, .31, .20][i], .3);
        canvas.drawPath(
          p,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(
                  0xFFABC3D7,
                ).withValues(alpha: .21 + .06 * math.sin(clock + i)),
                const Color(0xFF746497).withValues(alpha: .18),
                const Color(0x004F5276),
              ],
            ).createShader(p.getBounds()),
        );
        canvas.drawPath(
          p,
          Paint()
            ..color = const Color(0xFFA9B8DA).withValues(alpha: .10)
            ..style = PaintingStyle.stroke
            ..strokeWidth = d * .006,
        );
      }
    case SlopFinish.crystal:
      for (var i = 0; i < 3; i++) {
        final x = [.32, .68, .58][i], y = [.35, .66, .90][i];
        final c = point(x, y).translate(
          math.sin(clock + i * 2.1) * d * .025,
          math.cos(clock + i * 2.1) * d * .025,
        );
        final rx = d * [.30, .25, .37][i], ry = h * [.38, .34, .20][i];
        final facet = Path()
          ..moveTo(c.dx - rx, c.dy - ry * .35)
          ..lineTo(c.dx - rx * .2, c.dy - ry)
          ..lineTo(c.dx + rx, c.dy - ry * .14)
          ..lineTo(c.dx + rx * .52, c.dy + ry)
          ..lineTo(c.dx - rx * .72, c.dy + ry * .62)
          ..close();
        canvas.drawPath(
          facet,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xBFFFFFFF),
                [
                  const Color(0x5ECCBAE6),
                  const Color(0x729FE4E3),
                  const Color(0x64E9CBE5),
                ][i],
                const Color(0x109BAEE3),
              ],
            ).createShader(facet.getBounds()),
        );
        canvas.drawPath(
          facet,
          Paint()
            ..color = Colors.white.withValues(
              alpha: .25 + .15 * math.sin(clock + i),
            )
            ..style = PaintingStyle.stroke
            ..strokeWidth = d * .007
            ..strokeJoin = StrokeJoin.round,
        );
      }
    default:
      break;
  }
  return true;
}

void _paintSoftMaterial(Canvas canvas, Rect rect, SlopLook look, double phase) {
  if (paintSlopSignatureMaterial(canvas, rect, look, phase)) return;
  if (look.finish == SlopFinish.firstBatch) {
    final wave = math.sin(phase * math.pi * 2);
    final glow = Rect.fromCenter(
      center: rect.center.translate(rect.width * .10 * wave, rect.height * .13),
      width: rect.width * .82,
      height: rect.height * .66,
    );
    canvas.drawOval(
      glow,
      Paint()
        ..shader = RadialGradient(
          colors: [
            const Color(0xFFFFEBC4).withValues(alpha: .76),
            const Color(0xFFFFC996).withValues(alpha: .48),
            const Color(0x00FFB593),
          ],
          stops: const [0, .52, 1],
        ).createShader(glow),
    );
    SlopRenderer.paintMaterialFinish(
      canvas,
      rect,
      look,
      phase,
      slopFinishDetailUnitFor(rect),
    );
    return;
  }
  final colors = switch (look.finish) {
    SlopFinish.pearl => const [
      Color(0xFFFFF1E8),
      Color(0xFFC0A6DF),
      Color(0xFFA9DBD7),
    ],
    SlopFinish.galaxy => const [
      Color(0xFFD8C4ED),
      Color(0xFF827FAF),
      Color(0xFFADC4E8),
    ],
    SlopFinish.tidepool => const [
      Color(0xFFC5ECDD),
      Color(0xFF5DA5AD),
      Color(0xFF99CBDF),
    ],
    SlopFinish.molten => const [
      Color(0xFFF7D4A8),
      Color(0xFFD497AA),
      Color(0xFFF0AD8D),
    ],
    SlopFinish.wildfire => const [
      Color(0xFFFFDB8B),
      Color(0xFFDA637C),
      Color(0xFFE99B77),
    ],
    SlopFinish.chrome => const [
      Color(0xFFF1F1EE),
      Color(0xFF869EBA),
      Color(0xFFC6BACF),
    ],
    SlopFinish.hologram => const [
      Color(0xFFDCD8EE),
      Color(0xFFE9BCCE),
      Color(0xFFAEB3E3),
    ],
    SlopFinish.aurora => const [
      Color(0xFFB9E5C9),
      Color(0xFF96CCDA),
      Color(0xFFA1AEDD),
    ],
    _ => null,
  };
  if (colors == null) {
    SlopRenderer.paintMaterialFinish(
      canvas,
      rect,
      look,
      phase,
      slopFinishDetailUnitFor(rect),
    );
    return;
  }
  final w = rect.width, h = rect.height;
  final cycle = phase * math.pi * 2;
  if (look.finish == SlopFinish.wildfire) {
    // Four slow, liquid flames circulate inside the gel. Integer harmonics
    // close both position and velocity at the material clock's wrap.
    for (var i = 0; i < 4; i++) {
      final flow = cycle + i * math.pi / 2;
      final x = rect.left + w * (.08 + i * .28 + .05 * math.sin(flow));
      final crest = rect.top + h * (.20 + .11 * math.cos(flow));
      final width = math.min(w * .38, h * .65);
      final flame = Path()
        ..moveTo(x - width * .6, rect.bottom + h * .1)
        ..cubicTo(
          x - width * .68,
          rect.top + h * .59,
          x + width * .55,
          crest + h * .15,
          x + width * .08 * math.sin(flow),
          crest,
        )
        ..cubicTo(
          x + width * .72,
          crest + h * .18,
          x + width * .26,
          rect.top + h * .73,
          x + width * .68,
          rect.bottom + h * .1,
        )
        ..close();
      canvas.drawPath(
        flame,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFFFFE4A2).withValues(alpha: .86),
              const Color(0xFFEDAB79).withValues(alpha: .80),
              const Color(0xFFCE6381).withValues(alpha: .36),
            ],
          ).createShader(flame.getBounds()),
      );
    }
    return;
  }
  if (look.finish == SlopFinish.pearl) {
    // A pearlescent wash has no stepped horizontal bands through the face.
    for (var i = 0; i < 3; i++) {
      final clock = cycle + i * math.pi * 2 / 3;
      final field = Rect.fromCenter(
        center:
            rect.center +
            Offset(math.cos(clock) * w * .2, math.sin(clock) * h * .16),
        width: w * 1.3,
        height: h * 1.2,
      );
      canvas.drawOval(
        field,
        Paint()
          ..shader = RadialGradient(
            colors: [
              colors[i].withValues(alpha: .28),
              colors[i].withValues(alpha: 0),
            ],
          ).createShader(field),
      );
    }
    return;
  }
  if (look.finish == SlopFinish.molten) {
    // Suspended warm pools drift through the gel, rather than giving every
    // collectible the same three horizontal stripes. Paths stay face-sized
    // even when the body opens into a very wide ribbon.
    for (var i = 0; i < 6; i++) {
      final center = Offset(
        rect.left + w * (.10 + i * .17 + .08 * math.sin(cycle + i * 1.7)),
        rect.top + h * (.48 + .28 * math.sin(cycle + i * 2.3)),
      );
      final poolW = math.min(w * .34, h * .82);
      final poolH = h * (.23 + .09 * (i % 3));
      final pool = Path()
        ..moveTo(center.dx - poolW * .5, center.dy)
        ..cubicTo(
          center.dx - poolW * .5,
          center.dy - poolH * .8,
          center.dx + poolW * .35,
          center.dy - poolH * .5,
          center.dx + poolW * .48,
          center.dy - poolH * .05,
        )
        ..cubicTo(
          center.dx + poolW * .7,
          center.dy + poolH * .65,
          center.dx - poolW * .4,
          center.dy + poolH * .65,
          center.dx - poolW * .5,
          center.dy,
        )
        ..close();
      canvas.drawPath(
        pool,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFFFE6AF).withValues(alpha: .72),
              colors[(i + 1) % 3].withValues(alpha: .68),
            ],
          ).createShader(pool.getBounds()),
      );
    }
    return;
  }
  if (look.finish == SlopFinish.tidepool) {
    // Three slow pools of light, with a broken caustic edge rather than
    // concentric outline rings. Integer harmonics close the material loop.
    for (var i = 0; i < 3; i++) {
      final flow = cycle + i * math.pi * 2 / 3;
      final center = Offset(
        rect.left + w * (.14 + i * .36 + .055 * math.sin(flow)),
        rect.top + h * (.50 + .24 * math.cos(flow)),
      );
      final pw = math.min(w * .47, h * 1.12);
      final ph = h * (.29 + .04 * math.sin(flow * 2));
      final curl = .12 * math.sin(flow);
      final pool = Path()
        ..moveTo(center.dx - pw * .55, center.dy)
        ..cubicTo(
          center.dx - pw * .46,
          center.dy - ph * .76,
          center.dx + pw * (.12 + curl),
          center.dy - ph * .66,
          center.dx + pw * .50,
          center.dy - ph * .14,
        )
        ..cubicTo(
          center.dx + pw * .68,
          center.dy + ph * .47,
          center.dx - pw * .03,
          center.dy + ph * .68,
          center.dx - pw * .42,
          center.dy + ph * .33,
        )
        ..quadraticBezierTo(
          center.dx - pw * .60,
          center.dy + ph * .20,
          center.dx - pw * .55,
          center.dy,
        )
        ..close();
      canvas.drawPath(
        pool,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFFE5FFF1).withValues(alpha: .34),
              const Color(0xFF58A7AE).withValues(alpha: .18),
            ],
          ).createShader(pool.getBounds()),
      );
      final caustic = Path()
        ..moveTo(center.dx - pw * .47, center.dy - ph * .19)
        ..cubicTo(
          center.dx - pw * .29,
          center.dy - ph * .61,
          center.dx + pw * (.12 + curl),
          center.dy - ph * .48,
          center.dx + pw * .35,
          center.dy - ph * .22,
        );
      canvas.drawPath(
        caustic,
        Paint()
          ..color = const Color(0xFFE9FFF4).withValues(alpha: .36)
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = math.min(w, h) * .013,
      );
    }
    return;
  }
  // Wide ribbons and small 3D bodies share normalized moving fields, avoiding
  // magnified scratches or seams on the For You ribbon.
  for (var band = 0; band < 3; band++) {
    final wave = math.sin(cycle + band * 2.1) * .15;
    final y = rect.top + h * (.12 + band * .29);
    final field = Path()
      ..moveTo(rect.left - w * .1, y)
      ..cubicTo(
        rect.left + w * .22,
        y - h * (.30 + wave),
        rect.left + w * .57,
        y + h * (.32 + wave),
        rect.right + w * .1,
        y - h * .08,
      )
      ..lineTo(rect.right + w * .1, y + h * .37)
      ..cubicTo(
        rect.left + w * .54,
        y + h * (.54 + wave),
        rect.left + w * .28,
        y + h * (.07 + wave),
        rect.left - w * .1,
        y + h * .27,
      )
      ..close();
    canvas.drawPath(
      field,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colors[band].withValues(alpha: .28),
            colors[(band + 1) % 3].withValues(alpha: .75),
          ],
        ).createShader(rect),
    );
  }
  if (look.finish == SlopFinish.chrome ||
      look.finish == SlopFinish.hologram ||
      look.finish == SlopFinish.pearl) {
    // A visibly travelling reflection, shared by the tiny portrait and wide
    // ribbon. Motion is measured in surface coordinates so a turn never
    // freezes the selected finish or makes its highlight slide off the skin.
    final sheen = rect.left + w * (.5 + .34 * math.sin(cycle));
    final band = Path()
      ..moveTo(sheen - w * .13, rect.top)
      ..lineTo(sheen + w * .03, rect.top)
      ..lineTo(sheen + w * .30, rect.bottom)
      ..lineTo(sheen + w * .13, rect.bottom)
      ..close();
    canvas.drawPath(
      band,
      Paint()
        ..shader = LinearGradient(
          colors: [
            const Color(0x00FFFFFF),
            Colors.white.withValues(
              alpha: look.finish == SlopFinish.chrome ? .76 : .48,
            ),
            const Color(0x00FFFFFF),
          ],
        ).createShader(Rect.fromLTWH(sheen - w * .13, rect.top, w * .43, h)),
    );
  }
  if (look.finish == SlopFinish.galaxy || look.finish == SlopFinish.crystal) {
    final u = math.min(w, h);
    for (var i = 0; i < 12; i++) {
      final center = Offset(
        rect.left + w * (((i * .382) % 1) + .025 * math.sin(cycle + i)),
        rect.top + h * (((i * .618) % 1) + .018 * math.cos(cycle + i)),
      );
      canvas.drawCircle(
        center,
        u * (.006 + (i % 3) * .003),
        Paint()
          ..color = const Color(
            0xFFFFF6D5,
          ).withValues(alpha: .60 + .32 * math.sin(cycle + i)),
      );
    }
  }
}

void _paintFittedFormAura(
  Canvas canvas,
  Rect body,
  SlopLook look,
  double phase,
  double reaction, {
  required SlopToonDepthPose depthPose,
  required SlopAuraDepthPass depthPass,
}) {
  if (body.isEmpty || look.aura == SlopAura.none) return;
  // Echoes need the complete shoulder width to remain visible behind broad
  // bodies. The orbiting auras keep their tighter fitted radius.
  // Place particles around the actual body bounds. Stretching a square aura
  // canvas made Pill's coins, droplets and satellite characters look squashed.
  SlopRenderer._paintAmbient(
    canvas,
    body,
    look,
    phase,
    reaction,
    depthPose: depthPose,
    depthPass: depthPass,
  );
}

void paintSlopCloudQuilt(Canvas canvas, Rect rect, double phase) {
  final unit = rect.shortestSide / 100;
  final spacing = unit * 23;
  final stitch = Paint()
    ..color = const Color(0xFFCCAFD5).withValues(alpha: .55)
    ..style = PaintingStyle.stroke
    ..strokeWidth = unit * .45
    ..strokeCap = StrokeCap.round;
  for (var row = -1; row <= (rect.height / spacing).ceil(); row++) {
    for (var col = -1; col <= (rect.width / spacing).ceil(); col++) {
      final center = Offset(
        rect.left + (col + (row.isOdd ? .5 : 0)) * spacing,
        rect.top + row * spacing,
      );
      final cloud = slopFormOutlineFor(
        Rect.fromCenter(center: center, width: unit * 11, height: unit * 9),
        body: SlopBody.cloud,
      );
      canvas.drawPath(
        cloud,
        Paint()..color = const Color(0xFFFAF1E7).withValues(alpha: .72),
      );
      canvas.drawPath(cloud, stitch);
      canvas.drawLine(
        center + Offset(unit * 8, unit * 6),
        center + Offset(unit * 9, unit * 7),
        stitch,
      );
    }
  }
}
