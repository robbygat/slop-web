// Run from slop-mobile with SLOP_PORTRAIT_LOOKS pointing to an appearance-only
// JSON array (no account IDs, names or credentials). The existing catalog can
// also be used to reproduce every shipped portrait.
//
// SLOP_PORTRAIT_LOOKS=/path/to/looks.json flutter test \
//   ../slop-web/tools/export_mobile_portraits_test.dart --no-pub
// Convert the resulting PNGs to lossless WebP before committing assets.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_game/models/slop_look.dart';
import 'package:slop_game/widgets/slop_character.dart';
import 'package:slop_game/widgets/slop_toon_character.dart';

const _fields = [
  'body', 'palette', 'eyes', 'eyeColor', 'mouth', 'hat',
  'pattern', 'finish', 'aura', 'accessory', 'cape', 'blush',
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('export exact equipped native Slop portraits', () async {
    final output = Directory(Platform.environment['SLOP_PORTRAIT_OUTPUT'] ??
        '../slop-web/public/assets/mobile/portraits')..createSync(recursive: true);
    final input = File(Platform.environment['SLOP_PORTRAIT_LOOKS'] ??
        '${output.path}/catalog.json');
    final rows = jsonDecode(await input.readAsString()) as List;
    final exported = <String>{};
    final catalog = <Map<String, Object?>>[];
    const size = 512;
    for (final row in rows) {
      final raw = Map<String, dynamic>.from(row as Map);
      final appearance = Map<String, dynamic>.from((raw['look'] ?? raw) as Map);
      final look = SlopLook.fromJson(appearance);
      final json = look.toJson();
      final fields = {for (final field in _fields) field: json[field]};
      final signature = jsonEncode(_fields.map((field) => fields[field]).toList());
      if (!exported.add(signature)) continue;
      final id = sha256.convert(utf8.encode(signature)).toString().substring(0, 16);
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      // The production painter retains native material, body, facial geometry,
      // accessories and champion authority. No synthetic authority is installed.
      SlopToonRenderer.paint(canvas,
        rect: slopToonPresentationRectFor(const Size(512, 512), look: look),
        look: look,
        emotion: SlopEmotion.happy,
        phase: .23,
        orientationAngle: 0,
        reducedMotion: true,
      );
      final picture = recorder.endRecording();
      final image = await picture.toImage(size, size);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      expect(bytes, isNotNull);
      await File('${output.path}/$id.png').writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
      picture.dispose();
      catalog.add({
        'id': id, 'look': fields, 'signature': signature,
        'url': '/assets/mobile/portraits/$id.webp', 'size': size,
      });
    }
    expect(catalog, isNotEmpty);
    await File('${output.path}/catalog.json').writeAsString(
      '${const JsonEncoder.withIndent('  ').convert(catalog)}\n',
    );
    print('Exported ${catalog.length} exact native equipped portraits.');
  }, timeout: const Timeout(Duration(minutes: 4)));
}
