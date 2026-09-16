part of 'slop_character.dart';

bool _isSlopHeadpiece(SlopHat hat) => const {
  SlopHat.curls,
  SlopHat.bangs,
  SlopHat.afro,
  SlopHat.ponytail,
  SlopHat.mohawk,
}.contains(hat);

/// These five persisted slots now carry small objects, not hairstyles. Each
/// attachment is projected around the actual authored crown and belongs to a
/// single depth pass; neither a second face nor a floating flat sticker is used.
void _paintSlopHeadpiece(
  Canvas canvas,
  Rect rect,
  SlopLook look, {
  required double round,
  required double wave,
  required double unit,
  required SlopToonDepthPose depthPose,
  required SlopHeadwearDepthPass depthPass,
}) {
  final scale = 1 - round * .42;
  final u = unit * scale;
  final angle = depthPose.orientationAngle;
  final side = math.cos(angle).abs();
  _ProjectedCrownPoint root(double x, double z, [double lift = 3]) =>
      SlopRenderer._projectCrownPoint(
        rect,
        look: look,
        round: round,
        wave: wave,
        depthPose: depthPose,
        localX: x,
        localZ: z,
        lift: u * lift,
        topperScale: scale,
      );
  bool visible(double depth) =>
      depthPass == SlopHeadwearDepthPass.all ||
      (depth >= 0 ? SlopHeadwearDepthPass.front : SlopHeadwearDepthPass.rear) ==
          depthPass;
  Color shade(Color color, double depth) =>
      Color.lerp(color, const Color(0xFF59576C), depth < 0 ? .16 : .0)!;
  void stroke(Path path, Color color, double width) => canvas.drawPath(
    path,
    Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = u * width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round,
  );
  void leaf(Offset center, double turn, double length, Color color) {
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(turn);
    final path = Path()
      ..moveTo(0, 0)
      ..quadraticBezierTo(-u * length * .55, -u * length * .40, 0, -u * length)
      ..quadraticBezierTo(u * length * .55, -u * length * .40, 0, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
    stroke(
      Path()
        ..moveTo(0, -u)
        ..lineTo(0, -u * length * .68),
      const Color(0x88F4FFE7),
      .7,
    );
    canvas.restore();
  }

  switch (look.hat) {
    case SlopHat.curls:
      // Daisy Clips: two tiny butter-yellow flowers on enamel green clasps.
      for (final dir in [-1.0, 1.0]) {
        final anchor = root(dir * .17, .10, 3.2);
        if (!visible(anchor.depth)) continue;
        final center = anchor.point.translate(0, -u * 2.3);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: anchor.point.translate(0, u * .6),
              width: u * 12,
              height: u * 4.2,
            ),
            Radius.circular(u * 2.1),
          ),
          Paint()..color = shade(const Color(0xFF6DAC99), anchor.depth),
        );
        canvas.save();
        canvas.translate(center.dx, center.dy);
        canvas.scale(.40 + side * .60, 1);
        for (var petal = 0; petal < 6; petal++) {
          final a = petal * math.pi / 3;
          canvas.save();
          canvas.rotate(a);
          canvas.drawOval(
            Rect.fromCenter(
              center: Offset(0, -u * 4.3),
              width: u * 5.2,
              height: u * 8.0,
            ),
            Paint()..color = shade(const Color(0xFFFFF4D4), anchor.depth),
          );
          canvas.restore();
        }
        canvas.drawCircle(
          Offset.zero,
          u * 3.4,
          Paint()..color = shade(const Color(0xFFF4B64F), anchor.depth),
        );
        canvas.drawCircle(
          Offset(-u * .8, -u),
          u * .9,
          Paint()..color = const Color(0xFFFFE6A7),
        );
        canvas.restore();
      }
    case SlopHat.bangs:
      // Cloud Band: a lilac crown-following band and one small porcelain cloud.
      for (var i = 0; i < 20; i++) {
        final x0 = -.23 + .46 * i / 20, x1 = -.23 + .46 * (i + 1) / 20;
        double z(double x) => math.sqrt(math.max(0, .24 * .24 - x * x)) * .60;
        final a = root(x0, z(x0), 3.7), b = root(x1, z(x1), 3.7);
        if (!visible((a.depth + b.depth) / 2)) continue;
        stroke(
          Path()
            ..moveTo(a.point.dx, a.point.dy)
            ..lineTo(b.point.dx, b.point.dy),
          shade(const Color(0xFFAA9BCF), (a.depth + b.depth) / 2),
          5.4,
        );
        stroke(
          Path()
            ..moveTo(a.point.dx, a.point.dy - u * 1.7)
            ..lineTo(b.point.dx, b.point.dy - u * 1.7),
          const Color(0xCCDCD4F3),
          .85,
        );
      }
      final cloud = root(-.055, .145, 1.7);
      if (!visible(cloud.depth)) break;
      final center = cloud.point.translate(0, -u * 4.0);
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.scale(.35 + .65 * side, 1);
      final cloudPath = Path()
        ..moveTo(-u * 10, u * 3)
        ..cubicTo(-u * 16, u * 2, -u * 14, -u * 6, -u * 8, -u * 5)
        ..cubicTo(-u * 7, -u * 13, u * 5, -u * 12, u * 6, -u * 5)
        ..cubicTo(u * 14, -u * 7, u * 16, u * 3, u * 10, u * 3)
        ..close();
      canvas.drawPath(
        cloudPath,
        Paint()
          ..shader = LinearGradient(
            colors: [
              shade(const Color(0xFFFFFBF0), cloud.depth),
              const Color(0xFFCFDFED),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ).createShader(cloudPath.getBounds()),
      );
      stroke(cloudPath, const Color(0x8895ABC9), .7);
      stroke(
        Path()
          ..moveTo(-u * 6, u * .5)
          ..lineTo(u * 6, u * .5),
        const Color(0x779AAECD),
        .8,
      );
      canvas.restore();
    case SlopHat.afro:
      // Paper Sail: an origami cap with genuine fore/aft folded faces.
      final half = look.body == SlopBody.triangle ? .12 : .22;
      final inner = half * .727;
      final faces = <({List<_ProjectedCrownPoint> points, Color color})>[
        (
          points: [
            root(-half, -.07, 3),
            root(0, -.055, -19),
            root(half, -.07, 3),
          ],
          color: const Color(0xFFC6B8DA),
        ),
        for (final dir in [-1.0, 1.0])
          (
            points: [
              root(dir * half, -.07, 3),
              root(0, -.055, -19),
              root(0, .015, -22),
              root(dir * half, .07, 3),
            ],
            color: const Color(0xFFE3D5DB),
          ),
        (
          points: [root(-half, .07, 3), root(0, .015, -22), root(0, .13, -3)],
          color: const Color(0xFFFFF1D0),
        ),
        (
          points: [root(0, .015, -22), root(half, .07, 3), root(0, .13, -3)],
          color: const Color(0xFFE7D8EE),
        ),
        (
          points: [
            root(-half, .07, 3),
            root(half, .07, 3),
            root(inner, .11, -3),
            root(-inner, .11, -3),
          ],
          color: const Color(0xFF92C7B4),
        ),
      ];
      faces.sort(
        (a, b) => a.points
            .fold<double>(0, (v, p) => v + p.depth)
            .compareTo(b.points.fold<double>(0, (v, p) => v + p.depth)),
      );
      for (final face in faces) {
        final depth =
            face.points.fold<double>(0, (v, p) => v + p.depth) /
            face.points.length;
        if (!visible(depth)) continue;
        final path = Path()
          ..moveTo(face.points.first.point.dx, face.points.first.point.dy);
        for (final p in face.points.skip(1)) {
          path.lineTo(p.point.dx, p.point.dy);
        }
        path.close();
        canvas.drawPath(path, Paint()..color = shade(face.color, depth));
        stroke(path, const Color(0x556F697E), .55);
      }
    case SlopHat.ponytail:
      // Comet Clip replaces the whole ponytail. A gold enamel twinkle sits on
      // its inherited volume anchor with two short, soft ribbon trails.
      final anchor = SlopRenderer.ponytailAttachmentFor(
        rect,
        look: look,
        round: round,
        wave: wave,
        unit: unit,
        depthPose: depthPose,
      );
      if (depthPass != SlopHeadwearDepthPass.all &&
          depthPass != anchor.depthPass) {
        break;
      }
      final center = anchor.tieRoot.translate(0, -u * 10.0);
      final direction = anchor.projectedDirection;
      for (var i = 0; i < 2; i++) {
        stroke(
          Path()
            ..moveTo(center.dx, center.dy)
            ..cubicTo(
              center.dx + direction * u * 8,
              center.dy - u * (i * 2 + 2),
              center.dx + direction * u * 12,
              center.dy - u * (i * 5 + 4),
              center.dx + direction * u * 16,
              center.dy - u * (i * 5 + 7),
            ),
          i == 0 ? const Color(0xFFDCA7BC) : const Color(0xFFA9A2D4),
          3.3,
        );
      }
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: anchor.tieRoot,
            width: u * 9,
            height: u * 4.5,
          ),
          Radius.circular(u * 2.2),
        ),
        Paint()..color = shade(const Color(0xFFCE9C66), anchor.depth),
      );
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.scale(.48 + .52 * side, 1);
      SlopRenderer._sparkle(
        canvas,
        Offset.zero,
        u * 9,
        Paint()..color = shade(const Color(0xFFFFD87D), anchor.depth),
      );
      SlopRenderer._sparkle(
        canvas,
        Offset(-u * .7, -u * .7),
        u * 4,
        Paint()..color = const Color(0xFFFFF1C0),
      );
      canvas.restore();
    case SlopHat.mohawk:
      // Sprout Crest: a tiny ceramic seed cup with three fresh leaves.
      final anchor = root(0, .035, 2.5);
      if (!visible(anchor.depth)) break;
      final center = anchor.point;
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.scale(.66 + side * .34, 1);
      final stem = Path()
        ..moveTo(0, u * 1.5)
        ..quadraticBezierTo(-u * 2, -u * 7, 0, -u * 13);
      stroke(stem, const Color(0xFF5D917B), 2.4);
      leaf(
        Offset(-u, -u * 5),
        -.95,
        13,
        shade(const Color(0xFF83BFA0), anchor.depth),
      );
      leaf(
        Offset(u, -u * 7),
        .92,
        12,
        shade(const Color(0xFFA8D39F), anchor.depth),
      );
      leaf(
        Offset(0, -u * 9),
        .12 + wave * .025,
        11,
        shade(const Color(0xFFD1E3AE), anchor.depth),
      );
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(0, u * 1.2),
          width: u * 15,
          height: u * 7,
        ),
        Paint()..color = shade(const Color(0xFFD8B8AD), anchor.depth),
      );
      stroke(
        Path()
          ..moveTo(-u * 5, -u * .2)
          ..quadraticBezierTo(0, u * 1.2, u * 5, -u * .2),
        const Color(0xFFF2D9C2),
        1.4,
      );
      canvas.restore();
    default:
      break;
  }
}
