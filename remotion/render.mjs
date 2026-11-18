import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia, renderStill, makeCancelSignal} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import os from 'node:os';

const cpuCount = os.cpus()?.length || 2;
// In headless containers (Cloud Run 2 vCPU), concurrency 1 prevents CPU starvation and browser context deadlocks
const defaultConcurrency = Math.min(2, Math.max(1, Math.floor(cpuCount / 2) || 1));
const concurrency = parseInt(process.env.REMOTION_CONCURRENCY || '', 10) || defaultConcurrency;
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
function getAllFiles(dir, base = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full, rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

const srcFiles = getAllFiles(path.join(root, 'src'), 'src');
const signature = ['package-lock.json', ...srcFiles]
  .map(f => {
    const p = path.join(root, f);
    return (fs.existsSync(p) && fs.statSync(p).isFile()) ? fs.readFileSync(p, 'utf8') : '';
  }).join('\n');
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

const chromiumOptions = {
  gl: 'swangle', // ANGLE SwiftShader software rendering: essential for headless containers / Cloud Run
  disableWebSecurity: true,
  ignoreCertificateErrors: true,
  enableMultiProcessOnLinux: true,
};

// Locate Remotion's dedicated chrome-headless-shell binary
function findHeadlessShell(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findHeadlessShell(full);
      if (found) return found;
    } else if (entry.name.startsWith('chrome-headless-shell') && !entry.name.endsWith('.zip')) {
      return full;
    }
  }
  return null;
}

const managedShell = findHeadlessShell(path.join(root, 'node_modules/.remotion')) ||
                     findHeadlessShell(path.join(process.cwd(), 'node_modules/.remotion')) ||
                     findHeadlessShell(path.join(os.homedir(), '.remotion'));

let browserExecutable = undefined;
let chromeMode = 'headless-shell';

if (managedShell) {
  browserExecutable = managedShell;
  chromeMode = 'headless-shell';
} else if (process.env.REMOTION_BROWSER && fs.existsSync(process.env.REMOTION_BROWSER)) {
  browserExecutable = process.env.REMOTION_BROWSER;
  chromeMode = browserExecutable.includes('headless-shell') ? 'headless-shell' : 'chrome-for-testing';
} else {
  const fallbacks = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  browserExecutable = fallbacks.find(p => p && fs.existsSync(p));
  chromeMode = 'chrome-for-testing';
}

const onBrowserLog = (log) => {
  if (log.text.includes('favicon.ico')) return;
  console.log(`[Browser ${log.type}] ${log.text}`);
};

console.log(`[Remotion] Browser executable: ${browserExecutable || 'auto'} (mode: ${chromeMode})`);
console.log(`[Remotion] Selecting composition '${targetCompId}'...`);

const composition = await selectComposition({
  serveUrl: bundleDir,
  id: targetCompId,
  inputProps: project,
  browserExecutable,
  chromiumOptions,
  chromeMode,
  timeoutInMilliseconds: 120000,
  onBrowserLog
});

console.log(`[Remotion] Composition selected: ${composition.id} (${composition.width}x${composition.height}, ${composition.durationInFrames} frames @ ${composition.fps}fps)`);

const {cancelSignal,cancel} = makeCancelSignal();
const cancelFile = process.env.FRAMEFORGE_CANCEL_FILE;
const timer = cancelFile ? setInterval(() => {if(fs.existsSync(cancelFile)) cancel();},200) : null;
fs.mkdirSync(path.dirname(destination),{recursive:true});

try {
  if (still) {
    const frameToRender = Math.min(composition.durationInFrames - 1, Math.round(composition.durationInFrames * 0.4));
    console.log(`[Remotion] Rendering still frame ${frameToRender}...`);
    await renderStill({
      serveUrl: bundleDir,
      composition,
      inputProps: project,
      output: destination,
      frame: frameToRender,
      browserExecutable,
      chromiumOptions,
      chromeMode,
      timeoutInMilliseconds: 120000,
      onBrowserLog,
      cancelSignal,
      imageFormat: 'png'
    });
    process.stdout.write(JSON.stringify({progress: 100}) + '\n');
  } else if (isProres) {
    console.log(`[Remotion] Rendering ProRes video (concurrency=${concurrency})...`);
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
      concurrency: concurrency,
      browserExecutable,
      chromiumOptions,
      chromeMode,
      timeoutInMilliseconds: 120000,
      onBrowserLog,
      cancelSignal,
      muted: project.muted === true,
      scale: preview ? 0.5 : 1,
      onProgress: ({progress}) => process.stdout.write(JSON.stringify({progress: Math.round(progress * 100)}) + '\n')
    });
  } else {
    console.log(`[Remotion] Rendering H.264 video (concurrency=${concurrency})...`);
    // High quality H.264 MP4 export
    await renderMedia({
      serveUrl: bundleDir,
      composition,
      inputProps: project,
      outputLocation: destination,
      codec: 'h264',
      crf: preview ? 24 : 18,
      concurrency: concurrency,
      browserExecutable,
      chromiumOptions,
      chromeMode,
      timeoutInMilliseconds: 120000,
      onBrowserLog,
      cancelSignal,
      muted: project.muted === true,
      scale: preview ? 0.5 : 1,
      onProgress: ({progress}) => process.stdout.write(JSON.stringify({progress: Math.round(progress * 100)}) + '\n')
    });
  }
  console.log(`[Remotion] Render complete -> ${destination}`);
} finally {
  if (timer) clearInterval(timer);
}
