import 'package:flutter/material.dart';
import '../models/slop_look.dart';
import 'slop_toon_character.dart';
import 'slop_toon_parts_atlas.dart' show SlopToonExpression;

/// A stationary profile portrait with continuous, direct rotation.
///
/// The canonical renderer's reduced-motion presentation removes personality,
/// poke and gel-return movement without quantizing intentional drag rotation.
/// Its native geometry, materials and equipped appearance remain unchanged.
class ProfileCharacter extends StatelessWidget {
  const ProfileCharacter({
    super.key,
    required this.look,
    required this.size,
    this.orientationAngle = 0,
    this.onOrientationChanged,
  });

  final SlopLook look;
  final double size;
  final double orientationAngle;
  final ValueChanged<double>? onOrientationChanged;

  @override
  Widget build(BuildContext context) => SlopToonCharacter(
    size: size,
    look: look,
    animated: false,
    phaseOverride: 0,
    reducedMotion: true,
    interactive: false,
    rotatable: true,
    showRotationHint: false,
    orientationAngle: orientationAngle,
    onOrientationChanged: onOrientationChanged,
    expression: SlopToonExpression.neutral,
    semanticLabel: 'Your Slop. Drag horizontally to turn.',
  );
}
