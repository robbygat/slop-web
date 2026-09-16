These transparent 512px portraits are painted by the production Flutter
`SlopToonRenderer` from slop-mobile commit 6c965890a609b68474f59e705cd8e6f4bd389922.
They contain the 29 distinct equipped appearances in the 33 publicly visible
non-null profile looks retrieved on 2026-09-16. Account identifiers and profile
names are not included. The images are lossless WebP.

`catalog.json` matches the same canonical appearance signature used by the web
native turntables. Only exact matches are selected. Unmatched appearances use
the existing native asset fallback until another export; the selected profile
continues to use the live native Flutter renderer.

To reproduce, run `tools/export_mobile_portraits_test.dart` from slop-mobile,
then convert each PNG using `cwebp -lossless -z 7 input.png -o output.webp`.
The exporter can consume this catalog, or an appearance-only JSON array through
`SLOP_PORTRAIT_LOOKS`. Native champion display authority remains intact; the
exporter never grants a competitive crown from a saved cosmetic alone.
