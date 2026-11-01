# سحر الألوان: motion explainer video

A 1920×1080, 30 fps explainer for grades 5–6 on primary colours (red, yellow, blue) and the secondary colours made by mixing them (orange, green, purple).

| File | Purpose |
|---|---|
| `index.html` | The whole animation, drawn on canvas. `render(t)` is a pure function of time on the voiceover timeline. Open it in a browser to preview it. If the voiceover is present it plays in sync. |
| `cues.json` | The master timeline: when each line of narration starts, plus key beats (each primary drop, each mix, the artist's smile, the final card). |
| `align.py` | Reads the voiceover, finds the 7 spoken lines and the beats inside them, and rewrites `cues.json`. |
| `render.cjs` | Renders every frame in headless Chromium, then muxes the frames with the voiceover into H.264 MP4. |
| `out/sehr-al-alwan.mp4` | The rendered video. |

## Syncing to the voiceover

```bash
cp /path/to/voiceover.mp3 video/voiceover.mp3     # .m4a / .wav also work; set "audio" in cues.json
python3 video/align.py video/voiceover.mp3        # prints the detected line times and rewrites cues.json
node video/render.cjs                             # -> video/out/sehr-al-alwan.mp4
```

* The audio is stream-copied when MP4 can carry it (AAC or MP3), so it keeps its original quality. Other formats (such as WAV) are encoded to 320 kb/s AAC.
* The video ends 2 s after the last spoken word, and the last 2 s are a still frame.
* If a beat lands slightly off, edit that value in `cues.json` and render again. To check single moments quickly, run `node video/render.cjs --stills 15.2,33.5`.
* In this environment `playwright` is installed globally, so run with `NODE_PATH=$(npm root -g)`.

## Scenes (cue → visual)

1. `l1` Hook: a question mark made of paint splashes. Yellow and red blobs hop toward each other.
2. `pause` The blobs freeze mid-air, then drop and bounce.
3. `l2` Three dashed slots appear. Red, yellow and blue drop in on `red` / `yellow` / `blue`, each with a heart, sun or water-drop icon badge.
4. `l3` Pedestals rise. The other primaries bounce off each blob with a ✕ ("can't be made from other colours"). On `base`, sunbursts appear ("the base of all colours").
5. `l4` The blobs slide together into overlapping circles. On `merge`, splashes reveal orange, green and purple in the overlaps.
6. `mix1`–`mix3` Red + yellow make orange, yellow + blue make green, and blue + red make purple. Each pair merges with a gooey effect, splashes and wiggles, then the result is collected in a tray.
7. `l6` A paintbrush paints the colour wheel around a smiling artist (big smile on `smile`).
8. `l7` The artist winks and points at a plain shirt. Red, yellow and blue paint flies from the artist's finger and mixes into secondary colours on the shirt. On `wf`, the final card shows the colour wheel, then holds still.
