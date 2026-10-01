#!/usr/bin/env python3
"""Rebuild only hero columns 2 and 4 with the six curated, full-bleed games.

Outputs are staged separately for review:
  python3 tools/prepare-hero-curated-wall.py --wall ORIGINAL-game-wall-hd.mp4 \
    --clips-dir public/assets/brand/lift --out-dir /tmp/hero-wall-fixed

The guarded original is a 2948x1536, 15s/24fps wall of 22x6 cells. The
replacement changes only complete 134x1536 columns at x268 and x536, retaining
the original upward scrolling offsets (column*137). Each cell has 128x250 video
pixels and a 6px gutter. Both columns use the row order in GAMES below.

Hole Rush (recent-wall-selected.json selected[114], id
295eeb9e-93cd-4d76-8d53-1c1e46056775) was column4/row5, confirmed by decoding
the original frame-zero cell x536/y732. Replacing column4 removes its hero video.
Other game previews and catalog data remain untouched.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path

WALL_SHA256 = "3765a7abe990cda99d7ab4b4582be9fce3454c2325d2f304f5cb39b134397e00"
GAMES = [
    ("kickflip-coast", "c711d89177bfbab9e4e043a37fb3d2c3cb4342a8183009cbff85e103e2817ea3"),
    ("run-infinite", "307a685e43234fc0b5aa7b7981c3ad6996973e03964fb0bade669d067a208908"),
    ("aqua-slide", "bc3c8e9925285a682b7879426fad3e1a20f696058efa1b30dbc371f03704c81b"),
    ("cube-surfer", "4f066f8b9ed103ecd15a8021a5bbe54d0771217ac09c8d8654d7e7631e0bf4aa"),
    ("stumble-run", "6f8a5bcd0f22601be5dc0493691364ea36c8ef466eeeb01c0ad5aea2ccf333cc"),
    ("draw-climber", "fc388af1fefe1e79d6f16b898fb025795f21c116e700ad85c2d8c7d2b848bae7"),
]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def encode(*args):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1",
        *map(str, args)
    ], check=True)


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=width,height,r_frame_rate,nb_frames:format=duration,size", "-of", "json", str(path)
    ]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wall", type=Path, required=True)
    parser.add_argument("--clips-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    for executable in ("ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            parser.error(f"{executable} must be installed")
    sources = [(args.wall, WALL_SHA256), *[
        (args.clips_dir / f"{name}.mp4", checksum) for name, checksum in GAMES
    ]]
    for path, expected in sources:
        if not path.is_file() or digest(path) != expected:
            parser.error(f"Unrecognized original asset: {path}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    loops = []
    for name, _ in GAMES:
        clip = args.clips_dir / f"{name}.mp4"
        loop = args.out_dir / f"{name}-cell-loop.mp4"
        loops.append(loop)
        # Remove the authored 5% top/bottom letterboxing, then cover the slot.
        # Starting at source 0.5s and blending 3.0-3.5s into 0.0-0.5s makes a 3s
        # seamless loop, an exact divisor of the 15s wall timeline.
        encode("-i", clip, "-filter_complex",
               "[0:v]fps=24,trim=end=3.5,setpts=PTS-STARTPTS,"
               "crop=512:900:0:50,scale=128:250:force_original_aspect_ratio=increase:flags=lanczos,"
               "crop=128:250,pad=134:256:0:0:color=0x0b110e,split=2[a][b];"
               "[a]trim=start=0.5:end=3.5,setpts=PTS-STARTPTS,settb=AVTB[tail];"
               "[b]trim=start=0:end=0.5,setpts=PTS-STARTPTS,settb=AVTB[head];"
               "[tail][head]xfade=transition=fade:duration=0.5:offset=2.5,format=yuv420p[loop]",
               "-map", "[loop]", "-t", "3", "-an", "-c:v", "libx264", "-crf", "16",
               "-preset", "medium", "-threads", "2", "-movflags", "+faststart", loop)
    strip = args.out_dir / "featured-column-loop.mp4"
    inputs = [arg for loop in loops for arg in ("-i", loop)]
    encode(*inputs, "-filter_complex",
           "".join(f"[{i}:v]" for i in range(6)) + "vstack=inputs=6,format=yuv420p[strip]",
           "-map", "[strip]", "-t", "3", "-an", "-c:v", "libx264", "-crf", "16",
           "-preset", "medium", "-threads", "2", "-movflags", "+faststart", strip)
    hd = args.out_dir / "game-wall-hd.mp4"
    small = args.out_dir / "game-wall.mp4"
    poster = args.out_dir / "game-wall-poster.jpg"
    encode("-i", args.wall, "-stream_loop", "-1", "-i", strip, "-filter_complex",
           "[1:v]trim=duration=15,setpts=PTS-STARTPTS,split=4[c2a][c2b][c4a][c4b];"
           "[c2a][c2b]vstack=inputs=2,crop=134:1536:0:'mod(t*1536/15+274,1536)'[c2];"
           "[c4a][c4b]vstack=inputs=2,crop=134:1536:0:'mod(t*1536/15+548,1536)'[c4];"
           "[0:v][c2]overlay=x=268:y=0:shortest=1[first];"
           "[first][c4]overlay=x=536:y=0:shortest=1[wall]",
           "-map", "[wall]", "-t", "15", "-an", "-c:v", "libx264", "-crf", "26",
           "-preset", "medium", "-threads", "2", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", hd)
    encode("-i", hd, "-vf", "scale=1600:834:flags=lanczos", "-an", "-c:v", "libx264",
           "-crf", "30", "-preset", "medium", "-threads", "2", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", small)
    encode("-i", small, "-frames:v", "1", "-q:v", "3", poster)
    for asset, dimensions in ((hd, (2948, 1536)), (small, (1600, 834)), (poster, (1600, 834))):
        data = probe(asset)
        stream = data["streams"][0]
        if (stream["width"], stream["height"]) != dimensions:
            raise RuntimeError(f"Unexpected output dimensions: {asset}")
        if asset.suffix == ".mp4" and (
            data["format"]["duration"] != "15.000000" or stream["r_frame_rate"] != "24/1"
            or stream.get("nb_frames") != "360"
        ):
            raise RuntimeError(f"Unexpected output timeline: {asset}")
        print(json.dumps({"asset": str(asset), "sha256": digest(asset), "probe": data}), flush=True)
    print(json.dumps({"elapsedSeconds": round(time.monotonic()-started, 2),
                      "columns": [2, 4], "rows": [name for name, _ in GAMES]}), flush=True)


if __name__ == "__main__":
    main()
