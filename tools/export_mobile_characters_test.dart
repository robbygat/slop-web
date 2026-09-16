// Export the real mobile renderer as transparent website assets.
// From a current slop-mobile checkout:
// flutter test ../slop-web/tools/export_mobile_characters_test.dart --no-pub
import 'dart:io';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_game/models/slop_look.dart';
import 'package:slop_game/widgets/slop_character.dart';
import 'package:slop_game/widgets/slop_toon_character.dart';
import 'package:slop_game/data/slop_cosmetics.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('export native Slop characters for the website', () async {
    final output = Directory('../slop-web/public/assets/mobile/characters');
    output.createSync(recursive: true);
    const bodies = {
      'ghost': SlopBody.ghost,
      'pebble': SlopBody.tall,
      'star': SlopBody.star,
      'heart': SlopBody.heart,
      'triangle': SlopBody.triangle,
    };
    for (final body in bodies.entries) {
      for (final palette in ['tangerine', 'mint', 'lavender', 'bubblegum']) {
        final look = SlopLook(
          body: body.value,
          paletteId: palette,
          aura: SlopAura.none,
        );
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        SlopToonRenderer.paint(
          canvas,
          rect: slopToonPresentationRectFor(const Size(640, 640), look: look),
          look: look,
          emotion: SlopEmotion.happy,
          phase: .23,
          orientationAngle: 0,
          reducedMotion: true,
        );
        final picture = recorder.endRecording();
        final image = await picture.toImage(640, 640);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('${output.path}/${body.key}-$palette.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
        picture.dispose();
      }
    }
    const glass = SlopLook(body: SlopBody.star, paletteId: 'mint',
      finish: SlopFinish.clearGlass, aura: SlopAura.none);
    final recorder = ui.PictureRecorder();
    SlopToonRenderer.paint(Canvas(recorder),
      rect: slopToonPresentationRectFor(const Size(640, 640), look: glass),
      look: glass, emotion: SlopEmotion.happy, phase: .23,
      orientationAngle: 0, reducedMotion: true);
    final picture = recorder.endRecording();
    final image = await picture.toImage(640, 640);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('${output.path}/star-mint-glass.png')
      .writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose(); picture.dispose();
    final shop = Directory('../slop-web/public/assets/mobile/cosmetics');
    shop.createSync(recursive: true);
    final catalog = <Map<String, Object?>>[];
    for (final cosmetic in slopCosmetics) {
      final look = cosmetic.apply(const SlopLook(aura: SlopAura.none));
      final recorder = ui.PictureRecorder();
      SlopToonRenderer.paint(Canvas(recorder),
        rect: slopToonPresentationRectFor(const Size(420, 420), look: look),
        look: look, emotion: SlopEmotion.happy, phase: .23,
        orientationAngle: 0, reducedMotion: true);
      final picture = recorder.endRecording();
      final image = await picture.toImage(420, 420);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('${shop.path}/${cosmetic.id}.png').writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose(); picture.dispose();
      catalog.add({'id':cosmetic.id, 'name':cosmetic.name, 'blurb':cosmetic.blurb,
        'slot':cosmetic.slot.name, 'rarity':cosmetic.rarity.name, 'look':look.toJson(),
        'learningExclusive':cosmetic.learningExclusive, 'betaExclusive':cosmetic.betaExclusive,
        'premiumExclusive':cosmetic.premiumExclusive, 'connectionExclusive':cosmetic.connectionExclusive,
        'referralExclusive':cosmetic.referralExclusive, 'championExclusive':cosmetic.championExclusive,
      });
    }
    await File('${shop.path}/catalog.json').writeAsString(jsonEncode(catalog));
  });
}
