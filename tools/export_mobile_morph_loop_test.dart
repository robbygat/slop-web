// Run from slop-mobile with SLOP_MORPH_FRAMES set to a temporary directory.
// This is the exact SlopMorphShowcase in desktop_build_screen.dart, including
// its geometry, face, material blend, cursor and original 7200ms cadence.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_game/models/slop_look.dart';
import 'package:slop_game/widgets/slop_morph_showcase.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('export the actual native desktop Build morph performance', () async {
    final path = Platform.environment['SLOP_MORPH_FRAMES'];
    if (path == null || path.isEmpty) {
      throw StateError('Set SLOP_MORPH_FRAMES to a temporary output directory.');
    }
    final output = Directory(path)..createSync(recursive: true);
    const frames = 432, size = Size(512, 512);
    const look = SlopLook(
      paletteId: 'butter', eyes: SlopEyes.round, mouth: SlopMouth.oh,
      hat: SlopHat.none, finish: SlopFinish.gummy, body: SlopBody.classic,
    );
    for (var index = 0; index < frames; index++) {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      SlopShowcasePainter(
        phase: index / frames, look: look, theme: SlopShowcaseTheme.clay,
      ).paint(canvas, size);
      final picture = recorder.endRecording();
      final image = await picture.toImage(512, 512);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('${output.path}/frame-${index.toString().padLeft(4, '0')}.png')
          .writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
      picture.dispose();
      if (index % 108 == 0) print('Native morph frame $index / $frames');
    }
    expect(output.listSync().whereType<File>().where((file) => file.path.endsWith('.png')).length, greaterThanOrEqualTo(frames));
  }, timeout: const Timeout(Duration(minutes: 5)));
}
