import 'dart:math' as math;
import 'package:flutter/material.dart';

/// One live mint for balances, rewards and celebrations. Small inline prices
/// stay still; larger coins perform one gentle turn per loop.
class SlopCoinMark extends StatefulWidget {
  const SlopCoinMark({super.key, this.size = 32, this.animated = true});
  final double size;
  final bool animated;
  @override
  State<SlopCoinMark> createState() => _SlopCoinMarkState();
}

class _SlopCoinMarkState extends State<SlopCoinMark>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  bool _foreground = true;
  late final _turn = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 4800),
  );
  void _syncMotion() {
    final moving =
        widget.animated &&
        _foreground &&
        widget.size >= 28 &&
        !MediaQuery.disableAnimationsOf(context) &&
        TickerMode.valuesOf(context).enabled;
    if (moving) {
      if (!_turn.isAnimating) _turn.repeat();
    } else {
      _turn.stop();
      _turn.value = 0;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _syncMotion();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncMotion();
  }

  @override
  void didUpdateWidget(SlopCoinMark oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncMotion();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _turn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: RepaintBoundary(
      child: SizedBox.square(
        dimension: widget.size,
        child: AnimatedBuilder(
          animation: _turn,
          builder: (_, _) => CustomPaint(
            painter: SlopCoinPainter(
              turn:
                  Curves.easeInOutCubic.transform(
                    ((_turn.value - .58) / .36).clamp(0.0, 1.0),
                  ) *
                  math.pi *
                  2,
              bounce: math.sin(_turn.value * math.pi * 2) * .025,
            ),
          ),
        ),
      ),
    ),
  );
}

class SlopCoinPainter extends CustomPainter {
  const SlopCoinPainter({this.turn = 0, this.bounce = 0});
  final double turn;
  final double bounce;
  static void paintCoin(
    Canvas canvas,
    Rect rect, {
    double turn = 0,
    double opacity = 1,
  }) {
    if (rect.isEmpty || opacity <= 0) return;
    canvas.save();
    if (opacity < 1) {
      canvas.saveLayer(
        rect.inflate(2),
        Paint()..color = Colors.white.withValues(alpha: opacity),
      );
    }
    canvas.translate(rect.center.dx, rect.center.dy);
    canvas.scale(rect.width / 100, rect.height / 100);
    const radius = 41.0;
    const thickness = 10.0;
    final cosine = math.cos(turn);
    final sideWidth = thickness * math.sin(turn).abs();
    final faceRadius = radius * cosine.abs();
    // The cylinder is the convex hull of both projected circular ends. Its
    // side is one continuous surface even when the face is exactly edge-on.
    final hull = Path()
      ..moveTo(-sideWidth / 2, -radius - 1)
      ..lineTo(sideWidth / 2, -radius - 1)
      ..cubicTo(
        sideWidth / 2 + faceRadius * .5523,
        -radius - 1,
        sideWidth / 2 + faceRadius,
        -radius * .5523 - 1,
        sideWidth / 2 + faceRadius,
        -1,
      )
      ..cubicTo(
        sideWidth / 2 + faceRadius,
        radius * .5523 - 1,
        sideWidth / 2 + faceRadius * .5523,
        radius - 1,
        sideWidth / 2,
        radius - 1,
      )
      ..lineTo(-sideWidth / 2, radius - 1)
      ..cubicTo(
        -sideWidth / 2 - faceRadius * .5523,
        radius - 1,
        -sideWidth / 2 - faceRadius,
        radius * .5523 - 1,
        -sideWidth / 2 - faceRadius,
        -1,
      )
      ..cubicTo(
        -sideWidth / 2 - faceRadius,
        -radius * .5523 - 1,
        -sideWidth / 2 - faceRadius * .5523,
        -radius - 1,
        -sideWidth / 2,
        -radius - 1,
      )
      ..close();
    final bounds = hull.getBounds();
    canvas.drawPath(
      hull,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFFFFE6A0),
            Color(0xFFCB873C),
            Color(0xFFF0B862),
            Color(0xFFA76731),
          ],
          stops: [0, .3, .62, 1],
        ).createShader(bounds),
    );
    // Reeding belongs to the side wall; the face occludes it naturally.
    if (sideWidth > .4) {
      canvas.save();
      canvas.clipPath(hull);
      for (var i = -7; i <= 7; i++) {
        final y = radius * math.sin(i * math.pi / 16) - 1;
        canvas.drawLine(
          Offset(bounds.left, y),
          Offset(bounds.right, y),
          Paint()
            ..color = const Color(0xFF87512E).withValues(alpha: .30)
            ..strokeWidth = .7,
        );
        canvas.drawLine(
          Offset(bounds.left, y + .9),
          Offset(bounds.right, y + .9),
          Paint()
            ..color = const Color(0xFFFFE5A1).withValues(alpha: .45)
            ..strokeWidth = .7,
        );
      }
      canvas.restore();
    }
    if (cosine.abs() > .004) {
      // The nearest cap changes at a quarter turn. Near-zero cap area hides
      // that handoff, while the solid side wall remains visible throughout.
      final near = math.sin(turn) * thickness / 2 * (cosine >= 0 ? 1 : -1);
      canvas.save();
      canvas.translate(near, -1);
      canvas.scale(cosine.abs(), 1);
      _paintFace(canvas, back: cosine < 0);
      canvas.restore();
    }
    if (opacity < 1) canvas.restore();
    canvas.restore();
  }

  static void _paintFace(Canvas canvas, {required bool back}) {
    const face = Rect.fromLTWH(-41, -41, 82, 82);
    canvas.drawOval(
      face,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFEDAD), Color(0xFFF6CE7A), Color(0xFFEAA969)],
          stops: [0, .66, 1],
        ).createShader(face),
    );
    canvas.drawOval(
      face.deflate(5),
      Paint()
        ..color = const Color(0xFFCD8F54)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6,
    );
    canvas.drawArc(
      face.deflate(3),
      math.pi * 1.12,
      math.pi * .65,
      false,
      Paint()
        ..color = const Color(0xFFFFF5D0)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.8
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawArc(
      face.deflate(7),
      .12,
      math.pi * .6,
      false,
      Paint()
        ..color = const Color(0xFFFFF0BC)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..strokeCap = StrokeCap.round,
    );
    final stamp = Path();
    for (var i = 0; i <= 80; i++) {
      final a = i * math.pi * 2 / 80 - math.pi / 2;
      final radius = 25 * (.92 + .08 * math.cos(i * math.pi * 10 / 80));
      final p = Offset(math.cos(a) * radius, math.sin(a) * radius);
      if (i == 0) {
        stamp.moveTo(p.dx, p.dy);
      } else {
        stamp.lineTo(p.dx, p.dy);
      }
    }
    stamp.close();
    canvas.drawPath(
      stamp.shift(const Offset(0, 1.8)),
      Paint()..color = const Color(0xFFD39A58),
    );
    canvas.drawPath(stamp, Paint()..color = const Color(0xFFFFE5A0));
    // Keep the engraving readable as the face narrows during its turn. This
    // follows the same projected cap, so the rim and cylinder stay untouched.
    canvas.drawPath(
      stamp,
      Paint()
        ..color = const Color(0xFFAA713F)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeJoin = StrokeJoin.round,
    );
    final ink = Paint()
      ..color = const Color(0xFF70442C)
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 3.2;
    if (!back) {
      // One little embossed Slop eye keeps the coin legible at header size.
      canvas.drawOval(
        const Rect.fromLTWH(-10, -13, 20, 24),
        Paint()..color = const Color(0xFFD49C59),
      );
      canvas.drawOval(
        const Rect.fromLTWH(-10, -15, 20, 24),
        Paint()
          ..shader = const LinearGradient(
            colors: [Color(0xFFFFF4CB), Color(0xFFFFDA88)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ).createShader(const Rect.fromLTWH(-10, -15, 20, 24)),
      );
      canvas.drawOval(
        const Rect.fromLTWH(-10, -15, 20, 24),
        Paint()
          ..color = const Color(0xFFB68149)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.1,
      );
      canvas.drawOval(const Rect.fromLTWH(-3.6, -8, 7.2, 10), ink);
      canvas.drawCircle(
        const Offset(-1.2, -5.3),
        1.2,
        Paint()..color = const Color(0xFFFFF5D7),
      );
      canvas.drawPath(
        Path()
          ..moveTo(-6, 13)
          ..quadraticBezierTo(0, 19, 6, 13),
        ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.3,
      );
    } else {
      canvas.drawPath(
        Path()
          ..moveTo(8, -11)
          ..cubicTo(-12, -17, -16, -1, 0, 0)
          ..cubicTo(17, 1, 11, 17, -9, 11),
        ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4,
      );
    }
  }

  @override
  void paint(Canvas canvas, Size size) => paintCoin(
    canvas,
    (Offset(0, size.height * bounce) & size).deflate(size.width * .045),
    turn: turn,
  );
  @override
  bool shouldRepaint(SlopCoinPainter oldDelegate) =>
      oldDelegate.turn != turn || oldDelegate.bounce != bounce;
}
