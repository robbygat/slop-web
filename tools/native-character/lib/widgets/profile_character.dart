import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import '../models/slop_look.dart';
import 'slop_character.dart';
import 'slop_toon_character.dart';
import 'slop_toon_parts_atlas.dart' show SlopToonExpression;

const profileEyeFramesPerSecond = 12;

/// A stationary profile portrait with continuous, direct rotation.
///
/// Only the native face clock runs. Body geometry, materials, cape, aura and
/// shadow stay at their resting frame; intentional rotation stays continuous.
class ProfileCharacter extends StatefulWidget {
  const ProfileCharacter({
    super.key,
    required this.look,
    required this.size,
    this.orientationAngle = 0,
    this.onOrientationChanged,
    this.eyesAnimated = true,
    this.onActivate,
  });

  final SlopLook look;
  final double size;
  final double orientationAngle;
  final ValueChanged<double>? onOrientationChanged;
  final bool eyesAnimated;
  final VoidCallback? onActivate;

  @override
  State<ProfileCharacter> createState() => _ProfileCharacterState();
}

({double? phase, Offset gaze}) profileEyesFor(
  SlopLook look,
  double seconds, {
  bool animated = true,
}) {
  if (!animated) return (phase: null, gaze: Offset.zero);
  final native = slopToonPersonalityFrameFor(
    elapsedSeconds: seconds,
    seed: slopToonPersonalitySeedFor(look),
  );
  return (phase: native.phase, gaze: native.frame.livingGaze);
}

/// The same exact painter used by the viewer, exposed for compact Social
/// portrait exports and pixel tests. No JavaScript approximates its eyes.
void paintProfilePortrait(
  Canvas canvas,
  Size size, {
  required SlopLook look,
  double seconds = 0,
  double angle = 0,
  bool eyesAnimated = true,
  bool showFace = true,
}) {
  final eyes = profileEyesFor(look, seconds, animated: eyesAnimated);
  final aura = slopToonAmbientScaleFor(look);
  SlopToonRenderer.paint(
    canvas,
    rect: slopToonPresentationRectFor(size, look: look),
    look: look,
    emotion: SlopEmotion.happy,
    expression: SlopToonExpression.neutral,
    phase: 0,
    facePhase: eyes.phase,
    frame: slopToonFrameFor(phase: 0, reducedMotion: true),
    gaze: eyes.gaze,
    faceAnchor: .44,
    orientationAngle: angle,
    centerFaceHorizontally: eyes.phase != null,
    reducedMotion: true,
    ambientScaleX: aura.x,
    ambientScaleY: aura.y,
    showFace: showFace,
  );
}

class _ProfileCharacterState extends State<ProfileCharacter>
    with SingleTickerProviderStateMixin {
  late final Ticker ticker = createTicker(tick);
  Duration? previous;
  int activeMicroseconds = 0;
  int eyeFrame = 0;
  double seconds = 0;
  bool enabled = false;
  Offset? pointerStart;
  int? pointer;
  bool moved = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    syncClock();
  }

  @override
  void didUpdateWidget(covariant ProfileCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);
    syncClock();
  }

  void syncClock() {
    enabled = widget.eyesAnimated && !MediaQuery.disableAnimationsOf(context);
    final ticking = enabled && TickerMode.valuesOf(context).enabled;
    if (ticking && !ticker.isActive) {
      previous = null;
      ticker.start();
    } else if (!ticking && ticker.isActive) {
      ticker.stop();
      previous = null;
    }
  }

  void tick(Duration elapsed) {
    final before = previous;
    previous = elapsed;
    if (before == null) return;
    activeMicroseconds += (elapsed - before).inMicroseconds;
    final nextFrame = activeMicroseconds * profileEyeFramesPerSecond ~/ 1000000;
    if (nextFrame == eyeFrame) return;
    // Hold an exact sample of the native eye timeline between stop-motion
    // frames. Pointer rotation owns its own state and remains unquantized.
    setState(() {
      eyeFrame = nextFrame;
      seconds = eyeFrame / profileEyeFramesPerSecond;
    });
  }

  @override
  void dispose() {
    ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final eyes = profileEyesFor(widget.look, seconds, animated: enabled);
    return Listener(
      onPointerDown: (event) {
        pointer = event.pointer;
        pointerStart = event.localPosition;
        moved = false;
      },
      onPointerMove: (event) {
        if (event.pointer == pointer &&
            pointerStart != null &&
            (event.localPosition - pointerStart!).distance > 8)
          moved = true;
      },
      onPointerCancel: (_) => moved = true,
      child: SlopToonCharacter(
        size: widget.size,
        look: widget.look,
        animated: false,
        phaseOverride: 0,
        facePhaseOverride: eyes.phase,
        gaze: eyes.gaze,
        reducedMotion: true,
        interactive: false,
        rotatable: true,
        showRotationHint: false,
        orientationAngle: widget.orientationAngle,
        onOrientationChanged: widget.onOrientationChanged,
        onTap: widget.onActivate == null
            ? null
            : () {
                if (!moved) widget.onActivate!();
              },
        expression: SlopToonExpression.neutral,
        semanticLabel: 'Your Slop',
        semanticHint: widget.onActivate == null
            ? 'Drag horizontally to turn'
            : 'Tap to customize. Drag horizontally to turn.',
      ),
    );
  }
}
