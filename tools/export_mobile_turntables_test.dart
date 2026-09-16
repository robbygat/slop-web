// From the current slop-mobile checkout:
// flutter test ../slop-web/tools/export_mobile_turntables_test.dart --no-pub
// Each angle is painted by the production Flutter renderer, not redrawn in JS.
import 'dart:io';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slop_game/models/slop_look.dart';
import 'package:slop_game/widgets/slop_character.dart';
import 'package:slop_game/widgets/slop_toon_character.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('export exact native full-angle Slop turntables',()async{
  final output=Directory('../slop-web/public/assets/mobile/turntables')..createSync(recursive:true);
  const frames=36,columns=6,cell=384;
  final looks=<String,SlopLook>{
   'ghost-tangerine':const SlopLook(aura:SlopAura.none),
   'ghost-tangerine-bubbles':const SlopLook(),
   'ghost-tangerine-cocoa':const SlopLook(eyeColor:SlopEyeColor.cocoa),
   'star-mint-glass':const SlopLook(body:SlopBody.star,paletteId:'mint',finish:SlopFinish.clearGlass,aura:SlopAura.none),
   'heart-bubblegum':const SlopLook(body:SlopBody.heart,paletteId:'bubblegum',aura:SlopAura.none),
   'heart-bubblegum-bubbles':const SlopLook(body:SlopBody.heart,paletteId:'bubblegum'),
   'pebble-lavender':const SlopLook(body:SlopBody.tall,paletteId:'lavender',aura:SlopAura.none),
  };
  final catalog=<Map<String,Object?>>[];
  for(final entry in looks.entries){
   final recorder=ui.PictureRecorder();final canvas=Canvas(recorder);
   for(var frame=0;frame<frames;frame++){
    canvas.save();canvas.translate((frame%columns)*cell.toDouble(),(frame~/columns)*cell.toDouble());
    canvas.clipRect(const Rect.fromLTWH(0,0,384,384));
    SlopToonRenderer.paint(canvas,
     rect:slopToonPresentationRectFor(const Size(384,384),look:entry.value),
     look:entry.value,emotion:SlopEmotion.happy,phase:.23,
     orientationAngle:frame*math.pi*2/frames,reducedMotion:true);
    canvas.restore();
   }
   final picture=recorder.endRecording(),image=await picture.toImage(columns*cell,(frames~/columns)*cell);
   final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
   await File('${output.path}/${entry.key}.png').writeAsBytes(bytes!.buffer.asUint8List());
   image.dispose();picture.dispose();
   catalog.add({'id':entry.key,'look':entry.value.toJson(),'frames':frames,'columns':columns,'cell':cell,'url':'/assets/mobile/turntables/${entry.key}.webp'});
   print('Exported native turntable: ${entry.key}');
  }
  await File('${output.path}/catalog.json').writeAsString(jsonEncode(catalog));
 },timeout:const Timeout(Duration(minutes:6)));
}
