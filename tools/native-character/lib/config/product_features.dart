/// Mobile creation is preserved while the main Build destination introduces
/// the desktop workflow. Restore it with --dart-define=SLOP_MOBILE_CREATION=true.
const mobileCreationEnabled = bool.fromEnvironment(
  'SLOP_MOBILE_CREATION',
  defaultValue: false,
);

/// Keeps the original renderer available without changing stored trait IDs.
const reimaginedCharactersEnabled = !bool.fromEnvironment(
  'SLOP_LEGACY_CHARACTERS',
  defaultValue: false,
);
