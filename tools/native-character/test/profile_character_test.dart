import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_character_viewer/models/slop_look.dart';
import 'package:slop_character_viewer/widgets/profile_character.dart';
import 'package:slop_character_viewer/widgets/slop_toon_character.dart';

void main() {
  Widget stage({ValueChanged<double>? onTurn}) => MaterialApp(
    home: Scaffold(
      body: Center(
        child: ProfileCharacter(
          look: const SlopLook(),
          size: 400,
          eyesAnimated: false,
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
  testWidgets('tap activates; short and long drags never open customization', (
    tester,
  ) async {
    var activated = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProfileCharacter(
            look: const SlopLook(),
            size: 400,
            eyesAnimated: false,
            onActivate: () => activated++,
          ),
        ),
      ),
    );
    await tester.tap(find.byType(ProfileCharacter));
    await tester.pump();
    expect(activated, 1);
    for (final delta in [
      const Offset(9, 0),
      const Offset(90, 0),
      const Offset(0, 90),
    ]) {
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(ProfileCharacter)),
      );
      await gesture.moveBy(delta);
      await tester.pump();
      await gesture.up();
      await tester.pump();
    }
    expect(activated, 1);
  });

  test('profile uses the exact native eye and gaze timeline', () {
    const look = SlopLook();
    for (final seconds in [0.0, .3, 1.4, 3.2, 6.7, 15.0]) {
      final expected = slopToonPersonalityFrameFor(
        elapsedSeconds: seconds,
        seed: slopToonPersonalitySeedFor(look),
      );
      final eyes = profileEyesFor(look, seconds);
      expect(eyes.phase, expected.phase);
      expect(eyes.gaze, expected.frame.livingGaze);
    }
    expect(profileEyesFor(look, 4, animated: false), (
      phase: null,
      gaze: Offset.zero,
    ));
  });

  testWidgets('hidden and reduced-motion portraits pause their eye clock', (
    tester,
  ) async {
    Widget view({bool visible = true, bool reduced = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduced),
        child: TickerMode(
          enabled: visible,
          child: const ProfileCharacter(look: SlopLook(), size: 400),
        ),
      ),
    );
    double? phase() => tester
        .widget<SlopToonCharacter>(find.byType(SlopToonCharacter))
        .facePhaseOverride;
    await tester.pumpWidget(view());
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    final alive = phase();
    await tester.pumpWidget(view(visible: false));
    await tester.pump(const Duration(seconds: 10));
    expect(phase(), alive);
    expect(tester.hasRunningAnimations, isFalse);
    await tester.pumpWidget(view());
    expect(phase(), alive);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(phase(), isNot(alive));
    await tester.pumpWidget(view(reduced: true));
    expect(phase(), isNull);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets(
    'eye repaints run at 12fps while drag still follows single-pixel input',
    (tester) async {
      final turns = <double>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: ProfileCharacter(
              look: const SlopLook(),
              size: 400,
              onOrientationChanged: turns.add,
            ),
          ),
        ),
      );
      await tester.pump();
      var painted = painter(tester), changes = 0;
      for (var frame = 0; frame < 60; frame++) {
        await tester.pump(const Duration(microseconds: 16667));
        final next = painter(tester);
        if (!identical(next, painted)) changes++;
        painted = next;
      }
      expect(changes, 12);
      final widget = tester.widget<SlopToonCharacter>(
        find.byType(SlopToonCharacter),
      );
      expect(
        widget.facePhaseOverride,
        profileEyesFor(const SlopLook(), 1).phase,
      );
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(ProfileCharacter)),
      );
      await gesture.moveBy(const Offset(24, 0));
      await tester.pump();
      await gesture.moveBy(const Offset(40, 0));
      await tester.pump();
      final angle = turns.last;
      await gesture.moveBy(const Offset(1, 0));
      await tester.pump();
      expect(turns.last - angle, closeTo(math.pi * 2 / (400 * .62), .000001));
      expect(
        tester
            .widget<SlopToonCharacter>(find.byType(SlopToonCharacter))
            .facePhaseOverride,
        widget.facePhaseOverride,
      );
      await gesture.up();
      await tester.pump();
    },
  );

  test(
    'eye motion changes native face pixels; body and shadow stay identical',
    () async {
      Future<List<int>> pixels(SlopLook look, double seconds, bool face) async {
        final recorder = ui.PictureRecorder();
        paintProfilePortrait(
          Canvas(recorder),
          const Size(256, 256),
          look: look,
          seconds: seconds,
          showFace: face,
        );
        final picture = recorder.endRecording();
        final image = await picture.toImage(256, 256);
        final bytes = await image.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        );
        image.dispose();
        picture.dispose();
        return bytes!.buffer.asUint8List();
      }

      for (final look in [
        const SlopLook(),
        SlopLook.fromJson({
          'body': 'star',
          'palette': 'mint',
          'finish': 'clearGlass',
        }),
      ]) {
        final body = await pixels(look, 0, false);
        final face = await pixels(look, 0, true);
        var changedFace = false;
        for (final seconds in [1.7, 3.4, 5.1, 7.8]) {
          expect(await pixels(look, seconds, false), body);
          final next = await pixels(look, seconds, true);
          changedFace |= !listEquals(next, face);
        }
        expect(changedFace, isTrue);
      }
    },
  );
}
