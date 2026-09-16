import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_character_viewer/models/slop_look.dart';
import 'package:slop_character_viewer/widgets/profile_character.dart';

void main() {
  Widget stage({ValueChanged<double>? onTurn}) => MaterialApp(
    home: Scaffold(
      body: Center(
        child: ProfileCharacter(
          look: const SlopLook(),
          size: 400,
          onOrientationChanged: onTurn,
        ),
      ),
    ),
  );

  CustomPainter painter(WidgetTester tester) => tester
      .widget<CustomPaint>(find.byKey(const ValueKey('slop-toon-canvas')))
      .painter!;

  testWidgets('resting profile does not animate or change its painted pose', (
    tester,
  ) async {
    await tester.pumpWidget(stage());
    await tester.pump();
    final resting = painter(tester);
    await tester.pump(const Duration(seconds: 30));
    expect(painter(tester).shouldRepaint(resting), isFalse);
    expect(tester.hasRunningAnimations, isFalse);
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('drag rotates continuously and stays where released', (
    tester,
  ) async {
    final turns = <double>[];
    await tester.pumpWidget(stage(onTurn: turns.add));
    final original = painter(tester);
    final center = tester.getCenter(find.byType(ProfileCharacter));
    final gesture = await tester.startGesture(center);
    await gesture.moveBy(const Offset(24, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    final firstTurn = turns.last;
    await gesture.moveBy(const Offset(1, 0));
    await tester.pump();
    expect(turns.last, greaterThan(firstTurn));
    expect(turns.last - firstTurn, closeTo(math.pi * 2 / (400 * .62), .000001));
    expect(painter(tester).shouldRepaint(original), isTrue);
    await gesture.up();
    await tester.pump();
    final released = painter(tester);
    final finalAngle = turns.last;
    await tester.pump(const Duration(seconds: 30));
    expect(painter(tester).shouldRepaint(released), isFalse);
    expect(turns.last, finalAngle);
    expect(tester.hasRunningAnimations, isFalse);
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'vertical movement and taps do not deform or rotate the portrait',
    (tester) async {
      final turns = <double>[];
      await tester.pumpWidget(stage(onTurn: turns.add));
      final original = painter(tester);
      await tester.tap(find.byType(ProfileCharacter));
      await tester.pump();
      await tester.drag(find.byType(ProfileCharacter), const Offset(0, 120));
      await tester.pump(const Duration(seconds: 1));
      expect(turns, everyElement(0));
      expect(painter(tester).shouldRepaint(original), isFalse);
      expect(tester.hasRunningAnimations, isFalse);
      expect(tester.takeException(), isNull);
    },
  );
}
