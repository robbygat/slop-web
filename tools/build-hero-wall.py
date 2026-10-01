#!/usr/bin/env python3
"""Build the hero game wall: every game shown exactly once.

  python3 tools/build-hero-wall.py --clips SRC/media/recent-wall \
    --selected SRC/source/recent-wall-selected.json --out public/assets/brand \
    --extra 'Surfy Sub=public/assets/gameplay/surfy-sub.mp4'

SRC is slop-mobile/output/slop-update-film. Every clip NNN.mp4 (720x1280) maps
to selected[NNN]. Each becomes a seamless 3.0s loop (3.0-3.5s crossfaded into
0.0-0.5s) cropped to fill a 128x250 cell, starting at a random phase. The wall
is 22 columns x 6 rows of 134x256 cells; even columns scroll up, odd columns
down, each by one wall height per 15s, so the 15s video loops seamlessly.

FEATURED games are placed in columns 2 and 4 (beside the headline) and also
exported as 512x1000 loops with the identical timing. The page lifts only these
and phase-locks the lifted copy to the wall, so the lift is the same frame of
the same game. Layout and phases are written to src/lib/hero-wall-layout.json.
"""
import argparse, json, random, subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROWS, TW, TH, GAP, LOOP, FPS = 6, 128, 250, 6, 15, 24
CW, CH = TW + GAP, TH + GAP
TILE_LOOP = 3.0
# Clips that don't read as a tall tile (landscape desktop captures) or are broken.
EXCLUDE = ['Hole Rush', 'Blocks', 'Neon Bastion', 'Rift Runner', 'Void Pong', 'Neon Pinball', 'Neon Velocity']
FEATURED = ['Kickflip Coast', 'Run Infinite', 'Aqua Slide', 'Cube Surfer', 'Stumble Run', 'Draw Climber']
# (column, row) for each featured game: rows two apart (5s) in each column, and
# the column offsets (137px per column) stagger the two columns by ~2.7s, so a
# featured game reaches the lift line roughly every 2.5s, alternating sides.
FEATURED_CELLS = [(2, 0), (4, 0), (2, 2), (4, 2), (2, 4), (4, 4)]


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *map(str, args)], check=True)


def loop_clip(src, out, w, h, crf):
    # Cover-crop to the cell, then crossfade the tail into the head for a seamless 3s loop.
    ffmpeg('-ss', 1, '-t', 3.6, '-i', src, '-filter_complex',
           f'[0:v]fps={FPS},scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},setsar=1,split[a][b];'
           f'[a]trim=0.5:3.5,setpts=PTS-STARTPTS[A];[b]trim=0:0.5,setpts=PTS-STARTPTS[B];'
           f'[A][B]xfade=transition=fade:duration=0.5:offset=2.5[o]',
           '-map', '[o]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p',
           '-movflags', '+faststart', out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--clips', type=Path, required=True)
    ap.add_argument('--selected', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--extra', action='append', default=[], help='NAME=path.mp4 portrait clip to add')
    ap.add_argument('--work', type=Path, default=Path('/tmp/hero-wall-work'))
    a = ap.parse_args()
    selected = json.loads(a.selected.read_text())['selected']
    sources = [(g['name'].strip(), a.clips / f'{i:03d}.mp4') for i, g in enumerate(selected) if g['name'].strip() not in EXCLUDE]
    sources += [(e.split('=', 1)[0], Path(e.split('=', 1)[1])) for e in a.extra]
    names = [n for n, _ in sources]
    assert len({n.lower() for n in names}) == len(names), 'every game must be unique'
    assert len(names) % ROWS == 0, f'{len(names)} games do not fill {ROWS} rows'
    global COLS, W, H
    COLS = len(names) // ROWS
    W, H = COLS * CW, ROWS * CH
    games = names
    featured = [names.index(n) for n in FEATURED]

    # Place featured games, then every other game once, in original order.
    grid = {}
    for idx, cell in zip(featured, FEATURED_CELLS):
        grid[cell] = idx
    rest = iter(i for i in range(len(games)) if i not in featured)
    for r in range(ROWS):
        for c in range(COLS):
            if (c, r) not in grid:
                grid[(c, r)] = next(rest)
    assert sorted(grid.values()) == list(range(len(games)))

    a.work.mkdir(parents=True, exist_ok=True)
    lift_dir = a.out / 'lift'
    lift_dir.mkdir(parents=True, exist_ok=True)
    jobs = [(sources[i][1], a.work / f'{i:03d}.mp4', TW, TH, 12) for i in range(len(games))]
    jobs += [(sources[i][1], a.work / f'lift-{i:03d}.mp4', 512, 1000, 20) for i in featured]
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda j: loop_clip(*j), jobs))

    rng = random.Random(7)
    phase = {i: rng.randrange(int(TILE_LOOP * FPS)) / FPS for i in range(len(games))}
    inputs, parts = [], []
    order = [grid[(c, r)] for r in range(ROWS) for c in range(COLS)]
    for n, i in enumerate(order):
        inputs += ['-stream_loop', 6, '-i', a.work / f'{i:03d}.mp4']
        parts.append(f'[{n}:v]trim=start={phase[i]:.4f}:duration={LOOP},setpts=PTS-STARTPTS,'
                     f'pad={CW}:{CH}:0:0:color=0x0b110e[v{n}]')
    for c in range(COLS):
        cells = [r * COLS + c for r in range(ROWS)]
        parts += [f'[v{n}]split[a{n}][b{n}]' for n in cells]
        stack = ''.join(f'[a{n}]' for n in cells) + ''.join(f'[b{n}]' for n in cells)
        speed, off = H / LOOP, (c * 137) % H
        y = f'mod(t*{speed:.4f}+{off}\\,{H})' if c % 2 == 0 else f'{H}-mod(t*{speed:.4f}+{off}\\,{H})'
        parts.append(f"{stack}vstack=inputs={ROWS * 2},crop={CW}:{H}:0:'{y}'[c{c}]")
    parts.append(''.join(f'[c{c}]' for c in range(COLS)) + f'hstack=inputs={COLS}[out]')
    hd = a.out / 'game-wall-hd.mp4'
    ffmpeg(*inputs, '-filter_complex', ';'.join(parts), '-map', '[out]', '-an', '-r', FPS,
           '-c:v', 'libx264', '-preset', 'slow', '-crf', 30, '-tune', 'film', '-x264-params', 'aq-mode=3',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', LOOP, hd)
    ffmpeg('-i', hd, '-vf', 'scale=1600:-2:flags=lanczos', '-an', '-c:v', 'libx264', '-preset', 'slow',
           '-crf', 29, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out / 'game-wall.mp4')
    ffmpeg('-i', hd, '-frames:v', 1, '-vf', 'scale=1600:-2', '-q:v', 5, a.out / 'game-wall-poster.jpg')

    lifts = []
    for i, (c, r) in zip(featured, FEATURED_CELLS):
        slug = names[i].lower().replace(' ', '-')
        (a.work / f'lift-{i:03d}.mp4').replace(lift_dir / f'{slug}.mp4')
        ffmpeg('-i', lift_dir / f'{slug}.mp4', '-frames:v', 1, '-q:v', 4, lift_dir / f'{slug}.jpg')
        # The wall tile shows loop time (t + phase) mod 3 at wall time t.
        lifts.append({'id': slug, 'name': names[i], 'col': c, 'row': r, 'phase': phase[i]})
    layout = {'wall': {'w': W, 'h': H, 'cellW': CW, 'cellH': CH, 'tileW': TW, 'tileH': TH, 'loop': LOOP,
                       'fps': FPS, 'tileLoop': TILE_LOOP, 'colOffset': 137}, 'lifts': lifts,
              'games': [names[grid[(c, r)]] for r in range(ROWS) for c in range(COLS)]}
    Path('src/lib/hero-wall-layout.json').write_text(json.dumps(layout, indent=1) + '\n')


if __name__ == '__main__':
    main()
