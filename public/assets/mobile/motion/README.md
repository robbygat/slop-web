These animations are exported directly from slop-mobile commit
6c965890a609b68474f59e705cd8e6f4bd389922. They contain no generated replacement
character artwork and require no Flutter engine during website playback.

- `ghost-tangerine-idle.webm`: production `SlopToonRenderer`, 512px, 60fps,
  384 frames / 6.4 seconds. A mathematically closed native performance phase
  and gentle +/-23 degree yaw keep the face visible throughout the loop.
- `slop-morph-showcase.webm`: actual `SlopShowcasePainter` used by the mobile
  Build desktop companion, with its default look, clay material, cursor,
  morphing silhouettes, facial animation and original 7.2 second cadence.
  512px, 60fps, 432 frames.

Each animation has an exact native lossless WebP poster. Videos use VP9 alpha
in a WebM container; decoded alpha was checked to retain transparent pixels.
Use posters for reduced motion and browsers without transparent WebM support.

Reproduce the PNG frames using `tools/export_mobile_hero_loop_test.dart` or
`tools/export_mobile_morph_loop_test.dart` from the slop-mobile checkout. Encode:

```
ffmpeg -framerate 60 -i frame-%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p \
  -b:v 0 -crf 27 -row-mt 1 -cpu-used 3 -auto-alt-ref 0 -an output.webm
cwebp -lossless -z 7 frame-0000.png -o poster.webp
```
