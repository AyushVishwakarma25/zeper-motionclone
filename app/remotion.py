"""Trusted Remotion source and render bridge for validated editable layers."""
import json
import math
import shutil
import subprocess
import time
import zipfile
import os
from pathlib import Path
from .media import probe
from .process import Cancelled, popen, run

RUNTIME = Path(__file__).resolve().parents[1] / 'remotion'


def write_project(folder, plan, brief):
    folder = Path(folder).resolve()
    dest = (folder / 'remotion' / 'public').resolve()
    dest.mkdir(parents=True, exist_ok=True)
    media_file = folder / 'media.json'
    media = json.loads(media_file.read_text(encoding='utf-8')) if media_file.is_file() else {'width':1920,'height':1080,'fps':30,'duration':5.0,'audio':False}
    data = {'plan':plan.model_dump() if hasattr(plan, 'model_dump') else plan, 'media':media, 'logo':None, 'audio':None, 'assets':[]}

    if (folder/'logo.png').exists():
        shutil.copy2(folder/'logo.png',dest/'logo.png')
        data['logo']='logo.png'

    # Stage assets from folder/assets and folder/rebuild/assets
    dest_assets = dest / 'assets'
    dest_assets.mkdir(parents=True, exist_ok=True)
    for src_assets in [folder / 'assets', folder / 'rebuild' / 'assets']:
        if src_assets.is_dir():
            for p in src_assets.glob('*'):
                if p.is_file() and not p.name.startswith('.'):
                    shutil.copy2(p, dest_assets / p.name)
                    data['assets'].append(f'assets/{p.name}')

    # Stage sound effects into dest/sfx
    sfx_source = RUNTIME / 'public' / 'sfx'
    if sfx_source.is_dir():
        dest_sfx = dest / 'sfx'
        dest_sfx.mkdir(parents=True, exist_ok=True)
        for sfx_file in sfx_source.glob('*.wav'):
            shutil.copy2(sfx_file, dest_sfx / sfx_file.name)

    (dest/'project.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
    return dest


def export_project(folder, plan, brief):
    public = write_project(folder,plan,brief)
    dest = folder / 'remotion-project.zip'
    with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ['package.json','package-lock.json','render.mjs']:
            if (RUNTIME/name).exists():archive.write(RUNTIME/name,name)
        for path in (RUNTIME/'src').glob('*'):archive.write(path,'src/'+path.name)
        data=json.loads((public/'project.json').read_text(encoding='utf-8'))
        for name in ['project.json',data['logo'],data['audio']]:
            if name and (public/name).exists():archive.write(public/name,'public/'+name)
        if (public/'assets').is_dir():
            for p in (public/'assets').glob('*'):
                if p.is_file(): archive.write(p, f'public/assets/{p.name}')

        readme = (
            '# RANGY·AI & MotionClone Remotion Motion-Graphics Studio\n\n'
            '## Commands\n'
            '- Preview Live Studio:\n'
            '  `npm run studio`\n\n'
            '- Export MP4 (H.264, 60fps):\n'
            '  `npx remotion render Motion out/video.mp4 --codec=h264 --crf=18`\n\n'
            '- Export Transparent Overlay (ProRes 4444 with real alpha channel for Premiere/Final Cut/CapCut/DaVinci):\n'
            '  `npx remotion render TransparentOverlay out/overlay.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png`\n\n'
            '- Export Dashboard Screenshot Showcase:\n'
            '  `npx remotion render DashboardShowcase out/dashboard.mp4 --codec=h264 --crf=18`\n\n'
            '- Export PNG Sequence:\n'
            '  `npx remotion render Motion out/frames/frame-%04d.png --image-format=png`\n\n'
            '## Compositions Available\n'
            '- `Motion`: Dynamic AI-rebuilt layers\n'
            '- `DashboardShowcase`: Animated website or dashboard screenshot with spring entrance, float, and cursor ripple click\n'
            '- `TitleCard`: Pro title card with enter & exit\n'
            '- `LowerThird`: Sleek animated lower-third\n'
            '- `KineticText`: Kinetic typographic pop reveal\n'
            '- `TransparentOverlay`: Alpha channel badge for video editors\n'
        )
        archive.writestr('README.md', readme)
    return dest


def render(folder, plan, brief, cancel, progress, *, preview=False, format='mp4', composition='Motion'):
    folder = Path(folder).resolve()
    if not (RUNTIME/'node_modules/@remotion/renderer').exists():
        raise ValueError('Remotion is not installed. Run npm ci inside the remotion directory.')

    public = write_project(folder, plan, brief)

    if format == 'prores':
        output = (folder / 'output.mov').resolve()
    elif format == 'still':
        output = (folder / 'still.png').resolve()
    else:
        output = (folder / ('preview.mp4' if preview else 'output.mp4')).resolve()

    pending = output.with_name(output.stem + '.pending' + output.suffix)
    signal = folder / 'remotion.cancel'
    signal.unlink(missing_ok=True)
    env = os.environ.copy()
    env['FRAMEFORGE_CANCEL_FILE'] = str(signal)

    args = ['node', str((RUNTIME/'render.mjs').resolve()), str((public/'project.json').resolve()), str(pending.resolve())]
    if preview:
        args.append('--preview')
    if format == 'prores':
        args.append('--prores')
    elif format == 'still':
        args.append('--still')
    if composition and composition != 'Motion':
        args.append(f'--composition={composition}')

    label = 'Rendering Remotion preview' if preview else ('Rendering transparent ProRes overlay' if format == 'prores' else 'Rendering Remotion video')
    progress(label, 48 if preview else 78)

    log = folder / 'remotion-render.log'
    with log.open('w', encoding='utf-8') as stream:
        proc = popen(args, cwd=RUNTIME, stdout=stream, stderr=subprocess.STDOUT, env=env)
        started = time.monotonic()
        stopping = None
        timed_out = False
        try:
            while proc.poll() is None:
                if cancel.is_set() or time.monotonic() - started > 900:
                    if stopping is None:
                        timed_out = not cancel.is_set()
                        signal.touch()
                        stopping = time.monotonic()
                    if time.monotonic() - stopping > 20:
                        proc.terminate()
                        proc.wait(timeout=10)
                        break
                lines = log.read_text(encoding='utf-8', errors='replace').splitlines()
                for line in reversed(lines[-10:]):
                    try:
                        value = json.loads(line)['progress']
                        progress(label, round((48 if preview else 78) + value * (.16 if preview else .18)))
                        break
                    except (ValueError, KeyError, TypeError):
                        pass
                time.sleep(.3)
            if cancel.is_set():
                raise Cancelled()
            if timed_out:
                raise TimeoutError('Remotion render timed out.')
            if proc.returncode:
                raise ValueError('Remotion render failed. Check remotion-render.log for details.')
        finally:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=10)
            signal.unlink(missing_ok=True)

    pending.replace(output)

    if not preview and format == 'mp4':
        progress('Verifying frames and audio', 97)
        run(['ffmpeg', '-v', 'error', '-i', str(output), '-c', 'copy', '-f', 'null', '-'], timeout=120, cancel=cancel)
        actual = probe(output)
        media_file = folder / 'media.json'
        media = json.loads(media_file.read_text(encoding='utf-8')) if media_file.is_file() else {'duration': actual['duration'], 'fps': actual['fps']}
        count = int(run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
            'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', str(output)]))
        expected = math.ceil(media['duration'] * media['fps'])
        report = dict(decoded=True, expected_frames=expected, actual_frames=count, audio_present=actual['audio'],
            dimensions=[actual['width'], actual['height']], fps=actual['fps'], duration=actual['duration'],
            mode='rebuild', renderer='remotion')
        (folder/'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

    return output
