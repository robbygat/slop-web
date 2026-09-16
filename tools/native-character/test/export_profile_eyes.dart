// Run with flutter test test/export_profile_eyes.dart, then encode the PNG
// sequences with tools/build-native-eye-portraits.mjs. Appearance data only.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_character_viewer/models/slop_look.dart';
import 'package:slop_character_viewer/widgets/profile_character.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'export exact native eye motion on stationary Social portraits',
    () async {
      final root = Directory(
        Platform.environment['SLOP_EYE_OUTPUT'] ??
            '/tmp/slop-native-eye-portraits',
      )..createSync(recursive: true);
      final input = File('../../public/assets/mobile/portraits/catalog.json');
      var catalog = (jsonDecode(await input.readAsString()) as List)
          .cast<Map<String, dynamic>>();
      final finishes = (Platform.environment['SLOP_EYE_FINISHES'] ?? '')
          .split(',')
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet();
      if (finishes.isNotEmpty) {
        catalog = catalog.where((entry) {
          final look = entry['look'];
          return look is Map && finishes.contains(look['finish']);
        }).toList();
      } else {
        catalog.addAll([
        {
          'id': 'intro-heart',
          'look': {'body': 'heart', 'palette': 'bubblegum'},
        },
        {
          'id': 'intro-ghost',
          'look': {'body': 'ghost', 'palette': 'tangerine'},
        },
        {
          'id': 'intro-star',
          'look': {'body': 'star', 'palette': 'mint'},
        },
        ]);
      }
      const fields = [
        'body',
        'palette',
        'eyes',
        'eyeColor',
        'mouth',
        'hat',
        'pattern',
        'finish',
        'aura',
        'accessory',
        'cape',
        'blush',
      ];
      final exported = <String>{}, output = <Map<String, Object?>>[];
      for (final entry in catalog) {
        final look = SlopLook.fromJson(
          Map<String, dynamic>.from(entry['look'] as Map),
        );
        final appearance = look.toJson();
        final signature = jsonEncode(
          fields.map((key) => appearance[key]).toList(),
        );
        if (!exported.add(signature)) continue;
        final id = entry['id'] as String;
        final folder = Directory('${root.path}/$id')
          ..createSync(recursive: true);
        for (var frame = 0; frame < 96; frame++) {
          final recorder = ui.PictureRecorder();
          paintProfilePortrait(
            Canvas(recorder),
            const Size(384, 384),
            look: look,
            seconds: frame / 12,
          );
          final picture = recorder.endRecording();
          final image = await picture.toImage(384, 384);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
            '${folder.path}/${frame.toString().padLeft(3, '0')}.png',
          ).writeAsBytes(data!.buffer.asUint8List());
          image.dispose();
          picture.dispose();
        }
        output.add({
          'signature': signature,
          'id': id,
          'url': '/assets/mobile/eye-motion/$id.webp',
          'poster': '/assets/mobile/eye-motion/$id-poster.webp',
          'size': 384,
          'frames': 96,
          'fps': 12,
        });
        print('Exported native eye portrait $id');
      }
      await File('${root.path}/catalog.json').writeAsString(
        '${const JsonEncoder.withIndent('  ').convert(output)}\n',
      );
    },
    timeout: const Timeout(Duration(minutes: 10)),
  );
}
