import 'package:flutter/foundation.dart';
import '../models/slop_look.dart';
// A picture is never proof of live leaderboard authority. Keep the native
// fail-closed crown behavior without including account/network dependencies.
class SlopChampionStore extends ChangeNotifier{
 static final instance=SlopChampionStore();
 bool canWear(String? owner)=>false;
}
SlopLook slopLookWithCurrentChampion(SlopLook look)=>look.hat==SlopHat.globalChampion?look.copyWith(hat:SlopHat.none):look;
