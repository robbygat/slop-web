import 'package:flutter/foundation.dart';
import '../models/slop_look.dart';
// Rendering-only compatibility. The viewer always receives an explicit look.
// No preferences, backend, account, entitlement, or persistence implementation.
class SlopLookStore extends ChangeNotifier{
 static final instance=SlopLookStore();
 SlopLook get look=>const SlopLook();
}
