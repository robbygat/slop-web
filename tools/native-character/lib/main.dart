// This viewer has one input: bounded character presentation data from its
// same-site parent. It cannot access accounts, games, purchases, or the MCP.
// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:math' as math;
import 'dart:ui' show FrameTiming, FramePhase;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/scheduler.dart';
import 'models/slop_look.dart';
import 'widgets/slop_toon_character.dart';

void main()=>runApp(const CharacterViewer());
class CharacterViewer extends StatefulWidget{
 const CharacterViewer({super.key});
 @override State<CharacterViewer> createState()=>_CharacterViewerState();
}
class _CharacterViewerState extends State<CharacterViewer> with SingleTickerProviderStateMixin{
 SlopLook look=const SlopLook();bool reduced=false,paused=false;double? orientation;int resetGeneration=0;bool autoRotate=false;double autoAngle=0;Duration? lastTick;late final Ticker turnTicker;
 int frameCount=0,firstFrameMicros=0;
 void reportFrames(List<FrameTiming> frames){for(final frame in frames){final micros=frame.timestampInMicroseconds(FramePhase.rasterFinish);if(firstFrameMicros==0)firstFrameMicros=micros;frameCount++;if(frameCount>=90&&micros>firstFrameMicros){final fps=((frameCount-1)*1000000/(micros-firstFrameMicros)).clamp(0,240);html.window.parent?.postMessage(jsonEncode({'type':'slop.character.performance','version':1,'fps':fps,'frames':frameCount}),Uri.base.origin);frameCount=0;firstFrameMicros=0;}}}
 StreamSubscription<html.MessageEvent>? messages;
 @override void initState(){super.initState();
  turnTicker=createTicker((elapsed){final previous=lastTick;lastTick=elapsed;if(!autoRotate||paused||reduced||previous==null)return;final seconds=(elapsed-previous).inMicroseconds/1000000;setState(()=>autoAngle+=seconds.clamp(0,.05)*math.pi/14);})..start();
  WidgetsBinding.instance.addTimingsCallback(reportFrames);
  messages=html.window.onMessage.listen((event){
   if(!identical(js_util.getProperty(event,'source'),js_util.getProperty(html.window,'parent'))||event.origin!=Uri.base.origin||event.data is! String)return;
   final raw=event.data as String;if(raw.length>3000)return;
   try{final value=jsonDecode(raw);if(value is! Map||value['type']!='slop.character.render'||value['version']!=1)return;
    if(value.keys.any((key)=>!['type','version','look','reducedMotion','paused','front','autoRotate','requestId'].contains(key)))return;
    final data=value['look'];if(data is! Map||data.length>14)return;
    const allowed={'designVersion','palette','eyes','eyeColor','mouth','hat','pattern','finish','aura','body','accessory','cape','blush','name'};
    if(data.keys.any((key)=>key is! String||!allowed.contains(key)))return;
    for(final entry in data.entries){if(entry.key=='blush'){if(entry.value is! bool)return;}else if(entry.key=='designVersion'){if(entry.value is! int||entry.value!=7)return;}else if(entry.value is! String||(entry.value as String).length>40)return;}
    if(value['reducedMotion'] is! bool||value['paused'] is! bool||value['autoRotate'] is! bool||value['requestId'] is! int||value['requestId']<0)return;
    setState((){look=SlopLook.fromJson(Map<String,dynamic>.from(data));reduced=value['reducedMotion'];paused=value['paused'];autoRotate=value['autoRotate'];if(value['front']==true){orientation=0;autoAngle=0;resetGeneration++;}});
    WidgetsBinding.instance.addPostFrameCallback((_){html.window.parent?.postMessage(jsonEncode({'type':'slop.character.rendered','version':1,'requestId':value['requestId']}),Uri.base.origin);});
   }catch(_){/* Invalid presentation data has no effect. */}
  });
  WidgetsBinding.instance.addPostFrameCallback((_){html.window.parent?.postMessage(jsonEncode({'type':'slop.character.ready','version':1}),Uri.base.origin);});
 }
 @override void dispose(){turnTicker.dispose();WidgetsBinding.instance.removeTimingsCallback(reportFrames);messages?.cancel();super.dispose();}
 @override Widget build(BuildContext context)=>MaterialApp(debugShowCheckedModeBanner:false,color:Colors.transparent,home:Scaffold(backgroundColor:Colors.transparent,body:LayoutBuilder(builder:(context,box)=>Center(child:TickerMode(enabled:!paused,child:Focus(autofocus:true,onKeyEvent:(node,event){
  if(event is! KeyDownEvent)return KeyEventResult.ignored;final key=event.logicalKey;
  if(![LogicalKeyboardKey.arrowLeft,LogicalKeyboardKey.arrowRight,LogicalKeyboardKey.home,LogicalKeyboardKey.end].contains(key))return KeyEventResult.ignored;
  setState((){resetGeneration++;orientation=key==LogicalKeyboardKey.home?0:key==LogicalKeyboardKey.end?math.pi:(orientation??0)+(key==LogicalKeyboardKey.arrowLeft?-1:1)*math.pi/12;});return KeyEventResult.handled;
 },child:SlopToonCharacter(key:ValueKey(resetGeneration),size:math.min(box.maxWidth,box.maxHeight),look:look,animated:!paused,rotatable:true,interactive:true,showRotationHint:false,reducedMotion:reduced,orientationAngle:autoRotate&&!reduced?autoAngle:orientation,semanticLabel:'Your Slop. Drag horizontally to turn.')))))));
}
