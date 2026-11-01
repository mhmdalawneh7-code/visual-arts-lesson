#!/usr/bin/env python3
"""Re-time the animation to the real voiceover.

    python3 video/align.py video/voiceover.mp3

Finds the pauses in the narration with ffmpeg's silencedetect, splits it into
the 7 script lines (the 6 longest pauses), places the in-line cues (the three
primary-colour drops, the three mixes, etc.), and rewrites video/cues.json.
Check the printed table; nudge any value in cues.json by hand if needed, then
run `node video/render.cjs`.
"""
import json, re, subprocess, sys, shutil, os

src = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
noise = sys.argv[2] if len(sys.argv) > 2 else "-32dB"

dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).decode())
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", f"silencedetect=noise={noise}:d=0.18", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
sil = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))

# speech segments = complement of silences
segs, cur = [], 0.0
for a, b in sil:
    if a - cur > 0.05: segs.append([cur, a])
    cur = b
if dur - cur > 0.05: segs.append([cur, dur])
if len(segs) < 7: sys.exit(f"only {len(segs)} speech segments found; try a different noise floor, e.g. -40dB")

# Choose the 6 line breaks: each break should sit near where that line is
# expected (script proportions, scaled to the real length) and on a long pause.
EXPECT = [10.0, 20.0, 28.0, 33.0, 50.0, 58.0]       # line starts in a ~63 s read
scale = segs[-1][1] / 62.5
G = len(segs) - 1
def cost(i, k):
    gap = segs[i + 1][0] - segs[i][1]
    return abs(segs[i + 1][0] - EXPECT[k] * scale) - 4.0 * gap
INF = float("inf")
best = [[INF] * G for _ in range(6)]; prev = [[-1] * G for _ in range(6)]
for i in range(G): best[0][i] = cost(i, 0)
for k in range(1, 6):
    for i in range(G):
        for j in range(i):
            v = best[k - 1][j] + cost(i, k)
            if v < best[k][i]: best[k][i], prev[k][i] = v, j
i = min(range(G), key=lambda x: best[5][x]); cuts = []
for k in range(5, -1, -1): cuts.append(i); i = prev[k][i]
cuts.reverse()
lines, s = [], 0
for c in cuts + [len(segs) - 1]:
    lines.append(segs[s:c + 1]); s = c + 1
L = [(ln[0][0], ln[-1][1]) for ln in lines]

def inner_starts(ln, n):
    """start times of the n sub-phrases of a line (split at its n-1 longest pauses)."""
    if len(ln) >= n:
        g = sorted(sorted(range(len(ln) - 1), key=lambda i: ln[i + 1][0] - ln[i][1], reverse=True)[:n - 1])
        return [ln[0][0]] + [ln[i + 1][0] for i in g]
    a, b = ln[0][0], ln[-1][1]
    return [a + (b - a) * k / n for k in range(n)]

def last_starts(ln, n, frac):
    """the last n sub-phrases if the line has them, else fractions of the line."""
    if len(ln) >= n + 1: return [x[0] for x in ln[-n:]]
    a, b = ln[0][0], ln[-1][1]
    return [a + (b - a) * f for f in frac]

r, y, bl = last_starts(lines[1], 3, [.55, .7, .85])
m1, m2, m3 = inner_starts(lines[4], 3)
c = json.load(open(os.path.join(here, "cues.json")))
c.update({
    "l1": 0.0, "pause": round(L[0][1] + .1, 2), "l2": round(L[1][0] - .15, 2),
    "red": round(r, 2), "yellow": round(y, 2), "blue": round(bl, 2),
    "l3": round(L[2][0] - .15, 2), "base": round(L[2][0] + (L[2][1] - L[2][0]) * .55, 2),
    "l4": round(L[3][0] - .15, 2), "merge": round(L[3][0] + (L[3][1] - L[3][0]) * .55, 2),
    "l5": round(L[4][0] - .1, 2), "mix1": round(m1 - .1, 2), "mix2": round(m2 - .1, 2), "mix3": round(m3 - .1, 2),
    "l6": round(L[5][0] - .15, 2), "smile": round(L[5][0] + (L[5][1] - L[5][0]) * .6, 2),
    "l7": round(L[6][0] - .15, 2), "wf": round(L[6][0] + (L[6][1] - L[6][0]) * .5, 2),
})
c["end"] = round(max(L[6][1], c["wf"] + 1.6) + 2.0, 2)   # hold the last frame 2 s
c["audio"] = os.path.relpath(os.path.abspath(src), here) if os.path.abspath(src).startswith(here) else c.get("audio")
json.dump(c, open(os.path.join(here, "cues.json"), "w"), ensure_ascii=False, indent=2)
for i, (a, b) in enumerate(L, 1): print(f"line {i}: {a:6.2f} – {b:6.2f}")
print(json.dumps({k: v for k, v in c.items() if not k.startswith('_')}, indent=1))
