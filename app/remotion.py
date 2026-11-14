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

    # 1. Determine Aspect Ratio and Dimensions
    # 9:16 -> 1080x1920 @30fps
    # 16:9 -> 1920x1080 @30fps
    # 1:1  -> 1080x1080 @30fps
    aspect = '9:16'
    dashboard_file = folder / 'dashboard_project.json'
    dashboard_data = {}
    if dashboard_file.is_file():
        try:
            dashboard_data = json.loads(dashboard_file.read_text(encoding='utf-8'))
            if dashboard_data.get('aspect'):
                aspect = dashboard_data['aspect']
        except Exception:
            pass

    scene_plan_file = folder / 'scene_plan.json'
    scene_plan_data = {}
    if scene_plan_file.is_file():
        try:
            scene_plan_data = json.loads(scene_plan_file.read_text(encoding='utf-8'))
            if scene_plan_data.get('aspect'):
                aspect = scene_plan_data['aspect']
        except Exception:
            pass

    if aspect == '16:9':
        width, height = 1920, 1080
    elif aspect == '1:1':
        width, height = 1080, 1080
    else:
        width, height = 1080, 1920  # Default 9:16 vertical reel

    fps = 30

    # 2. Duration: strictly sum of scene durations (default 30s), not hard-coded 61.53s
    scenes = scene_plan_data.get('scenes', []) or dashboard_data.get('scene_plan', {}).get('scenes', [])
    if scenes:
        duration = round(sum(float(s.get('duration_seconds', 0)) for s in scenes), 2)
    elif scene_plan_data.get('duration_seconds'):
        duration = float(scene_plan_data['duration_seconds'])
    elif plan and hasattr(plan, 'tracks') and plan.tracks:
        duration = max((t.end for t in plan.tracks), default=30.0)
    else:
        duration = 30.0

    if duration <= 0:
        duration = 30.0

    # 2b. Voiceover and Audio Mix Generation if voiceover scripts or music are present
    has_narration = any(
        s.get('voiceover_script') or s.get('voiceover_script_en') or s.get('voiceover_script_hi')
        for s in scenes
    )
    lang = dashboard_data.get('language') or scene_plan_data.get('language') or 'en'
    from . import audio
    audio.ensure_music_library()

    if has_narration and not (folder / 'voiceover.mp3').is_file():
        try:
            audio.generate_scene_voiceovers(scenes, language=lang, output_dir=folder)
        except Exception as exc:
            logger.error(f"Voiceover TTS synthesis failed: {exc}")
            raise RuntimeError(f"Voiceover TTS synthesis failed: {exc}") from exc

    # Background music resolution
    music_id = dashboard_data.get('music_track') or 'tech_upbeat'
    music_file = audio.STATIC_MUSIC_DIR / f'{music_id}.mp3'
    if not music_file.is_file():
        for p in (folder / 'assets').glob('*') if (folder / 'assets').is_dir() else []:
            if p.suffix.lower() in ('.mp3', '.wav', '.m4a', '.aac'):
                music_file = p
                break

    if (folder / 'voiceover.mp3').is_file() and not (folder / 'final_mix.mp3').is_file():
        try:
            cut_times = []
            curr = 0.0
            for s in scenes[:-1]:
                curr += float(s.get('duration_seconds') or 3.0)
                cut_times.append(curr)
            audio.duck_and_mix_audio(
                voiceover_path=folder / 'voiceover.mp3',
                music_path=music_file if music_file.is_file() else audio.STATIC_MUSIC_DIR / 'tech_upbeat.mp3',
                output_path=folder / 'final_mix.mp3',
                sfx_transitions=cut_times,
                target_lufs=-14.0,
                duration=duration
            )
        except Exception:
            pass

    # Audio check
    audio_file_name = None
    audio_candidates = [
        folder / 'final_audio.mp3',
        folder / 'final_mix.mp3',
        folder / 'voiceover.mp3',
        folder / 'voiceover.wav',
        folder / 'audio.mp3'
    ]
    for cand in audio_candidates:
        if cand.is_file() and cand.stat().st_size > 1024:
            shutil.copy2(cand, dest / cand.name)
            audio_file_name = cand.name
            break

    media = {
        'width': width,
        'height': height,
        'fps': fps,
        'duration': duration,
        'audio': bool(audio_file_name),
        'aspect': aspect
    }
    (folder / 'media.json').write_text(json.dumps(media, indent=2), encoding='utf-8')

    data = {
        'plan': plan.model_dump() if hasattr(plan, 'model_dump') else plan,
        'media': media,
        'aspect': aspect,
        'fps': fps,
        'duration_seconds': duration,
        'scenes': scenes,
        'scene_plan': scene_plan_data or None,
        'logo': None,
        'audio': audio_file_name,
        'assets': []
    }

    if (folder / 'logo.png').exists():
        shutil.copy2(folder / 'logo.png', dest / 'logo.png')
        data['logo'] = 'logo.png'

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

    (dest / 'project.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
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
        # Mux high-fidelity ducked mix with -14 LUFS audio if produced
        final_mix = folder / 'final_mix.mp3'
        if final_mix.is_file() and final_mix.stat().st_size > 1024:
            from . import audio
            temp_mux = folder / 'muxed_output.mp4'
            try:
                audio.mux_final_video(output, final_mix, temp_mux)
                if temp_mux.is_file() and temp_mux.stat().st_size > 1024:
                    temp_mux.replace(output)
            except Exception:
                pass

        progress('Verifying frames and audio', 97)
        run(['ffmpeg', '-v', 'error', '-i', str(output), '-c', 'copy', '-f', 'null', '-'], timeout=120, cancel=cancel)
        actual = probe(output)
        media_file = folder / 'media.json'
        media = json.loads(media_file.read_text(encoding='utf-8')) if media_file.is_file() else {'duration': actual['duration'], 'fps': actual['fps']}
        count = int(run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
            'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', str(output)]))
        expected = math.ceil(media['duration'] * media['fps'])

        # Robust Loudness and Audio Verification using measure_loudness
        from . import audio
        integrated_lufs = -70.0
        if actual['audio']:
            try:
                loudness_info = audio.measure_loudness(output)
                integrated_lufs = float(loudness_info.get('integrated_lufs', -70.0))
            except Exception as e:
                logger.warning(f"Loudness measurement error: {e}")

        # Target: -14 LUFS, tolerance: 2 LU (-16.0 <= LUFS <= -12.0)
        is_loudness_compliant = (-16.0 <= integrated_lufs <= -12.0)
        is_silent = (integrated_lufs <= -60.0)
        duration_matches_plan = abs(actual['duration'] - media['duration']) <= 0.3
        audio_valid = actual['audio'] and not is_silent and is_loudness_compliant

        report = dict(
            decoded=True,
            expected_frames=expected,
            actual_frames=count,
            audio_present=actual['audio'],
            integrated_lufs=integrated_lufs,
            loudness_compliant=is_loudness_compliant,
            duration_matches_plan=duration_matches_plan,
            audio_valid=audio_valid,
            dimensions=[actual['width'], actual['height']],
            fps=actual['fps'],
            duration=actual['duration'],
            mode='rebuild',
            renderer='remotion'
        )
        (folder / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

    return output
