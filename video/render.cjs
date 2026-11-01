#!/usr/bin/env node
// Renders video/index.html frame by frame with headless Chromium and muxes
// it with the voiceover into a 1920x1080, 30 fps H.264 MP4.
//
//   node video/render.cjs                      -> video/out/sehr-al-alwan.mp4
//   node video/render.cjs --stills 3,15.5,47   -> PNG stills only (for checking)
//   options: --audio <file>  --cues <file>  --out <file>  --workers <n>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const dir = __dirname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const cues = JSON.parse(fs.readFileSync(arg('cues', path.join(dir, 'cues.json')), 'utf8'));
const audioArg = arg('audio', null);
const audio = audioArg || (cues.audio && fs.existsSync(path.join(dir, cues.audio)) ? path.join(dir, cues.audio) : null);
const out = arg('out', path.join(dir, 'out', 'sehr-al-alwan.mp4'));
const workers = +arg('workers', 4);
const stills = arg('stills', null);
const FPS = 30;

async function main() {
  const browser = await chromium.launch();
  const url = 'file://' + path.join(dir, 'index.html') + '?render';
  const mkPage = async () => {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await p.goto(url); await p.waitForFunction('window.ready === true');
    await p.evaluate(c => window.setCues(c), cues); return p;
  };
  const shot = async (p, t, file) => {
    await p.evaluate(t => window.renderFrame(t), t);
    await p.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  };

  if (stills) {
    const p = await mkPage(); const sd = path.join(dir, 'out', 'stills'); fs.mkdirSync(sd, { recursive: true });
    for (const s of stills.split(',')) await shot(p, +s, path.join(sd, `t${(+s).toFixed(2).padStart(6, '0')}.png`));
    await browser.close(); console.log('stills ->', sd); return;
  }

  const end = cues.end, N = Math.round(end * FPS);
  const fd = path.join(dir, 'out', 'frames'); fs.rmSync(fd, { recursive: true, force: true }); fs.mkdirSync(fd, { recursive: true });
  let done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const p = await mkPage();
    for (let i = w; i < N; i += workers) {
      await shot(p, i / FPS, path.join(fd, `f${String(i).padStart(5, '0')}.png`));
      if (++done % 150 === 0) console.log(`${done}/${N} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  await browser.close();

  const args = ['-y', '-framerate', String(FPS), '-i', path.join(fd, 'f%05d.png')];
  if (audio) {
    const codec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', audio]).toString().trim();
    args.push('-i', audio, '-map', '0:v', '-map', '1:a:0');
    // Keep the voiceover untouched when MP4 can carry it as-is; otherwise encode at high bitrate.
    if (['aac', 'mp3', 'alac'].includes(codec)) args.push('-c:a', 'copy'); else args.push('-c:a', 'aac', '-b:a', '320k');
    console.log('audio:', audio, `(${codec})`);
  } else {
    console.log('audio: none found — muxing a silent track');
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  }
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-t', String(end), '-movflags', '+faststart', out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  fs.rmSync(fd, { recursive: true, force: true });
  console.log('wrote', out);
}
main().catch(e => { console.error(e); process.exit(1); });
