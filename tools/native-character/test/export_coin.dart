// flutter test test/export_coin.dart --reporter expanded
// Uses the unchanged mobile painter; no tracing or regenerated artwork.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_character_viewer/widgets/slop_coin_mark.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('export current mobile coin', () async {
    final recorder = ui.PictureRecorder();
    const SlopCoinPainter().paint(Canvas(recorder), const Size(384, 384));
    final picture = recorder.endRecording();
    final image = await picture.toImage(384, 384);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('/tmp/slop-current-coin.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
    picture.dispose();
  });
}
