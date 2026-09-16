// From slop-mobile:
// SLOP_HERO_FRAMES=/tmp/slop-hero-frames flutter test \
//   ../slop-web/tools/export_mobile_hero_loop_test.dart --no-pub
// Frames are painted by the production Flutter renderer on transparent canvas.
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_game/models/slop_look.dart';
import 'package:slop_game/widgets/slop_character.dart';
import 'package:slop_game/widgets/slop_toon_character.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('export a smooth closed native Slop hero performance', () async {
    final path = Platform.environment['SLOP_HERO_FRAMES'];
    if (path == null || path.isEmpty) {
      throw StateError('Set SLOP_HERO_FRAMES to a temporary output directory.');
    }
    final output = Directory(path)..createSync(recursive: true);
    const frames = 384, cell = 512;
    const look = SlopLook(aura: SlopAura.none);
    for (var index = 0; index < frames; index++) {
      final cycle = index * math.pi * 2 / frames;
      // Both native performance phase and yaw meet exactly at the loop seam.
      // This keeps the face visible, with a gentle 23-degree glance each way.
      final phase = .23 + 2.5 * (1 - math.cos(cycle));
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      SlopToonRenderer.paint(canvas,
        rect: slopToonPresentationRectFor(const Size(512, 512), look: look),
        look: look,
        emotion: SlopEmotion.happy,
        phase: phase,
        orientationAngle: math.sin(cycle) * .4,
      );
      final picture = recorder.endRecording();
      final image = await picture.toImage(cell, cell);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('${output.path}/frame-${index.toString().padLeft(4, '0')}.png')
          .writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
      picture.dispose();
      if (index % 96 == 0) print('Native hero frame $index / $frames');
    }
    expect(output.listSync().whereType<File>().where((file) => file.path.endsWith('.png')).length, greaterThanOrEqualTo(frames));
  }, timeout: const Timeout(Duration(minutes: 5)));
}
