import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia, renderStill, makeCancelSignal} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectFile = path.resolve(process.argv[2] || path.join(root,'public/project.json'));
const destination = path.resolve(process.argv[3] || path.join(root,'out/video.mp4'));
const preview = process.argv.includes('--preview');
const still = process.argv.includes('--still');
const isProres = process.argv.includes('--prores') || process.argv.some(a => a.startsWith('--codec=prores'));
const compArg = process.argv.find(a => a.startsWith('--composition='));
let targetCompId = compArg ? compArg.split('=')[1] : 'Motion';
if (targetCompId) targetCompId = targetCompId.replace(/_/g, '-');

const project = JSON.parse(fs.readFileSync(projectFile,'utf8'));
const publicDir = path.dirname(projectFile);
const bundleDir = path.join(root,'.bundle');
const signature = ['package-lock.json','src/index.jsx','src/Composition.jsx','src/motion.mjs']
  .map(f => fs.existsSync(path.join(root,f)) ? fs.readFileSync(path.join(root,f),'utf8') : '').join('\n');
const {createHash} = await import('node:crypto');
const stamp = createHash('sha256').update(signature).digest('hex');
const stampFile = path.join(bundleDir,'.signature');
if (!fs.existsSync(stampFile) || fs.readFileSync(stampFile,'utf8') !== stamp) {
  await bundle({entryPoint:path.join(root,'src/index.jsx'), outDir:bundleDir, publicDir:path.join(root,'public')});
  fs.writeFileSync(stampFile, stamp);
}

// Stage all assets from publicDir (including assets subfolder) into the static bundle public directory
const staticDir = path.join(bundleDir,'public');
fs.mkdirSync(staticDir,{recursive:true});

function syncDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, {recursive: true});
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) syncDir(s, d);
    else if (!fs.existsSync(d) || fs.statSync(s).mtimeMs > fs.statSync(d).mtimeMs) {
      fs.copyFileSync(s, d);
    }
  }
}
syncDir(publicDir, staticDir);

const browsers = [
  process.env.REMOTION_BROWSER,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const browserExecutable = browsers.find(p => p && fs.existsSync(p));
const composition = await selectComposition({
  serveUrl: bundleDir,
  id: targetCompId,
  inputProps: project,
  browserExecutable,
  chromeMode: 'chrome-for-testing'
});
const {cancelSignal,cancel} = makeCancelSignal();
const cancelFile = process.env.FRAMEFORGE_CANCEL_FILE;
const timer = cancelFile ? setInterval(() => {if(fs.existsSync(cancelFile)) cancel();},200) : null;
fs.mkdirSync(path.dirname(destination),{recursive:true});

try {
  if (still) {
    const frameToRender = Math.min(composition.durationInFrames - 1, Math.round(composition.durationInFrames * 0.4));
    await renderStill({
      serveUrl: bundleDir,
      composition,
      inputProps: project,
      output: destination,
      frame: frameToRender,
      browserExecutable,
      chromeMode: 'chrome-for-testing',
      cancelSignal,
      imageFormat: 'png'
    });
    process.stdout.write(JSON.stringify({progress: 100}) + '\n');
  } else if (isProres) {
    // Transparent ProRes 4444 video export with real alpha channel (from RANGY.AI starter kit)
    await renderMedia({
      serveUrl: bundleDir,
      composition,
      inputProps: project,
      outputLocation: destination,
      codec: 'prores',
      proresProfile: '4444',
      pixelFormat: 'yuva444p10le',
      imageFormat: 'png',
      concurrency: 2,
      browserExecutable,
      chromeMode: 'chrome-for-testing',
      cancelSignal,
      muted: project.muted === true,
      scale: preview ? Math.min(1, 960 / composition.width) : 1,
      onProgress: ({progress}) => process.stdout.write(JSON.stringify({progress: Math.round(progress * 100)}) + '\n')
    });
  } else {
    // High quality H.264 MP4 export
    await renderMedia({
      serveUrl: bundleDir,
      composition,
      inputProps: project,
      outputLocation: destination,
      codec: 'h264',
      crf: preview ? 24 : 18,
      concurrency: 2,
      browserExecutable,
      chromeMode: 'chrome-for-testing',
      cancelSignal,
      muted: project.muted === true,
      scale: preview ? Math.min(1, 960 / composition.width) : 1,
      onProgress: ({progress}) => process.stdout.write(JSON.stringify({progress: Math.round(progress * 100)}) + '\n')
    });
  }
} finally {
  if (timer) clearInterval(timer);
}
