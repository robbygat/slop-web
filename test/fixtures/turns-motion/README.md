# Turn-based preview motion fixtures

These are complete 222-frame, 30 fps captures from the official publisher's
7-second mobile recording path, made on 2026-10-19 with headless Edge and FFmpeg
7.1. No game source or SDK was changed. `provenance.json` records all six source
hashes per game, the concatenated source-JPEG hash and both decoded sample hashes.
There are no account, connection, project or publication identifiers.

`pocket-play` contains real putts, a CPU reply and a course change.
`blob-play` contains real moves and CPU captures. The recorder used its existing
generic trusted touch gestures; there is no game-specific input policy.
`pocket-idle` and `blob-idle` use the identical official host and virtual clock
with only the call to `input(frame)` omitted in a diagnostic in-memory copy of
the recorder. They retain water, flag, aim-dot, leaf and character animation.
The diagnostic copy is never used for publication.

For each frame, FFmpeg produced gray8 pixels with the exact filter in
`provenance.json`. Each `.gray.gz` contains the first frame verbatim, followed by
each frame XORed byte-for-byte with the preceding decoded frame, then gzip.
This is lossless packing, not a new visual approximation. The test verifies both
compressed and reconstructed SHA256 values before analyzing the frames.

Expected measurements for all 222 frames:

| Capture | Original whole-frame moving | Local moving | Result with local fallback |
| --- | ---: | ---: | --- |
| Pocket gameplay | 1 | 156 | Accept |
| Blob gameplay | 0 | 107 | Accept |
| Pocket idle | 0 | 0 | Reject |
| Blob idle | 0 | 6 | Reject |

Every capture has 222 nonblank frames. The unchanged 15% requirement needs at
least 34 moving frames. Tests also cover static real scenes, low-amplitude noise,
an isolated hot pixel, outer-edge animation, flat blank frames, malformed data,
and the exact threshold boundary. These fixtures measure visible activity, not
semantic correctness; independent multiplayer gameplay testing remains required.
