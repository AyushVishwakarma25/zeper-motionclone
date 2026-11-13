"""Dashboard API routes for MotionClone: Reference-to-Video Studio."""
import json
import logging
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal
from fastapi import File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .dashboard_agent import (
    ASPECT_RATIOS,
    ROYALTY_FREE_MUSIC_TRACKS,
    BlueprintStructure,
    ExplainerScenePlan,
    generate_blueprint_from_reference,
    generate_scene_plan,
    process_dashboard_chat_turn,
)

logger = logging.getLogger('motionclone.dashboard.routes')


class ChatRequest(BaseModel):
    message: str
    job_id: str = ""
    history: list[dict[str, str]] = Field(default_factory=list)
    aspect: str = "9:16"
    language: str = "en"


class BlueprintGenerateRequest(BaseModel):
    job_id: str = ""
    aspect: str = "9:16"
    notes: str = ""


class ScenePlanGenerateRequest(BaseModel):
    job_id: str = ""
    user_story: str = ""
    brand_name: str = ""
    brand_tagline: str = ""
    language: str = "en"
    aspect: str = "9:16"
    music_track_id: str = "tech_upbeat"


class PreflightEstimateRequest(BaseModel):
    engine_type: str = "REMOTION_CODE_SCENE"
    resolution: str = "1080p"
    duration_sec: float = 5.0
    quality_preset: str = "standard"


class PreflightEstimateResponse(BaseModel):
    engine_type: str
    credits_required: int
    is_free: bool
    description: str


def install(app, server):
    DATA: Path = server.DATA

    @app.post('/api/dashboard/preflight-estimate')
    def api_preflight_estimate(req: PreflightEstimateRequest):
        from .preflight import estimate_cost
        cost = estimate_cost(
            engine_type=req.engine_type,
            resolution=req.resolution,
            duration_sec=req.duration_sec,
            quality_preset=req.quality_preset
        )
        return {
            "engine_type": req.engine_type,
            "credits_required": cost,
            "is_free": cost == 0,
            "description": "Zero credit execution" if cost == 0 else f"{cost} credits required for high-fidelity generation"
        }

    @app.get('/api/dashboard/music-library')
    def get_music_library():
        return {
            "tracks": ROYALTY_FREE_MUSIC_TRACKS,
            "aspect_ratios": ASPECT_RATIOS
        }

    @app.get('/api/dashboard/project/{id}')
    def get_dashboard_project(id: str):
        job = server.get_job(id)
        folder = DATA / id
        dashboard_file = folder / 'dashboard_project.json'
        
        default_state = {
            "job_id": id,
            "name": job.get("name", "Untitled Explainer"),
            "aspect": "9:16",
            "language": "en",
            "stage": job.get("stage", "Reference imported"),
            "status": job.get("status", "draft"),
            "reference_url": job.get("url", ""),
            "has_reference": (folder / "source.mp4").is_file(),
            "blueprint": None,
            "scene_plan": None,
            "music_track": "tech_upbeat",
            "assets": [],
            "preview_url": f"/media/{id}/output.mp4" if (folder / "output.mp4").is_file() else None,
            "source_url": f"/media/{id}/source.mp4" if (folder / "source.mp4").is_file() else None,
        }

        if dashboard_file.is_file():
            try:
                saved = json.loads(dashboard_file.read_text(encoding='utf-8'))
                default_state.update(saved)
            except Exception:
                pass

        # Check for blueprint.json
        if (folder / 'blueprint.json').is_file() and not default_state.get('blueprint'):
            try:
                default_state['blueprint'] = json.loads((folder / 'blueprint.json').read_text(encoding='utf-8'))
            except Exception:
                pass

        # Check for scene_plan.json
        if (folder / 'scene_plan.json').is_file() and not default_state.get('scene_plan'):
            try:
                default_state['scene_plan'] = json.loads((folder / 'scene_plan.json').read_text(encoding='utf-8'))
            except Exception:
                pass

        # List assets
        assets_dir = folder / 'assets'
        if assets_dir.is_dir():
            default_state['assets'] = [
                {
                    "name": p.name,
                    "url": f"/media/{id}/assets/{p.name}",
                    "size": p.stat().st_size
                }
                for p in assets_dir.glob('*') if p.is_file() and not p.name.startswith('.')
            ]

        # Filesystem truth overrides stale JSON state
        source_p = folder / "source.mp4"
        if not source_p.is_file() and assets_dir.is_dir():
            # Check if any video was uploaded to assets drawer (e.g. WhatsApp_Video)
            for p in sorted(assets_dir.glob('*'), key=lambda x: x.stat().st_mtime, reverse=True):
                if p.is_file() and (re.search(r'\.(mp4|mov|webm)$', p.name, re.I) or 'video' in p.name.lower()) and p.stat().st_size > 10240:
                    try:
                        shutil.copy2(p, source_p)
                        from .media import thumbnail, probe
                        meta = probe(source_p)
                        (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                        thumbnail(source_p, folder / 'thumbnail.jpg')
                        break
                    except Exception:
                        pass

        if source_p.is_file() and source_p.stat().st_size > 10240:
            default_state["has_reference"] = True
            default_state["source_url"] = f"/media/{id}/source.mp4"
        else:
            default_state["has_reference"] = False
            default_state["source_url"] = None

        output_p = folder / "output.mp4"
        if output_p.is_file() and output_p.stat().st_size > 10240:
            default_state["preview_url"] = f"/media/{id}/output.mp4"
        else:
            default_state["preview_url"] = None

        return default_state

    @app.post('/api/dashboard/chat')
    def api_dashboard_chat(req: ChatRequest):
        project_state = {}
        if req.job_id:
            try:
                project_state = get_dashboard_project(req.job_id)
            except Exception:
                pass

        response = process_dashboard_chat_turn(
            message=req.message,
            history=req.history,
            project_state=project_state
        )
        return response

    @app.post('/api/dashboard/blueprint')
    def api_generate_blueprint(req: BlueprintGenerateRequest):
        if not req.job_id:
            raise HTTPException(400, "Missing job_id")
        
        server.get_job(req.job_id)
        folder = DATA / req.job_id
        
        ref_video_path = folder / 'source.mp4'
        meta = {}
        if (folder / 'media.json').is_file():
            meta = json.loads((folder / 'media.json').read_text(encoding='utf-8'))
        elif (folder / 'temporal.json').is_file():
            meta = json.loads((folder / 'temporal.json').read_text(encoding='utf-8'))
        elif ref_video_path.is_file():
            from .media import probe
            try:
                meta = probe(ref_video_path)
                (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
            except Exception:
                meta = {"duration": 30.0, "fps": 30, "aspect": req.aspect}
        else:
            meta = {"duration": 30.0, "fps": 30, "aspect": req.aspect}

        blueprint = generate_blueprint_from_reference(
            reference_meta=meta,
            aspect=req.aspect,
            brief_notes=req.notes,
            reference_video_path=ref_video_path if ref_video_path.is_file() else None
        )

        # Persist blueprint
        (folder / 'blueprint.json').write_text(blueprint.model_dump_json(indent=2), encoding='utf-8')
        
        return {
            "ok": True,
            "blueprint": blueprint.model_dump(),
            "message": "AI Blueprint generated successfully. Review and approve the scene flow below."
        }

    @app.post('/api/dashboard/scene-plan')
    def api_generate_scene_plan(req: ScenePlanGenerateRequest):
        if not req.job_id:
            raise HTTPException(400, "Missing job_id")

        server.get_job(req.job_id)
        folder = DATA / req.job_id

        # Load blueprint
        blueprint_file = folder / 'blueprint.json'
        if not blueprint_file.is_file():
            raise HTTPException(400, "Please generate a blueprint from the reference first.")

        blueprint_data = json.loads(blueprint_file.read_text(encoding='utf-8'))
        blueprint = BlueprintStructure.model_validate(blueprint_data)

        # List user assets
        assets = []
        assets_dir = folder / 'assets'
        if assets_dir.is_dir():
            assets = [p.name for p in assets_dir.glob('*') if p.is_file() and not p.name.startswith('.')]

        plan = generate_scene_plan(
            blueprint=blueprint,
            user_story=req.user_story,
            brand_name=req.brand_name,
            brand_tagline=req.brand_tagline,
            language=req.language,
            aspect=req.aspect,
            uploaded_assets=assets
        )
        plan.music_track_id = req.music_track_id

        # Persist scene plan & Remotion plan
        (folder / 'scene_plan.json').write_text(plan.model_dump_json(indent=2), encoding='utf-8')
        try:
            from .dashboard_agent import export_scene_plan_to_remotion_plan
            remotion_plan = export_scene_plan_to_remotion_plan(plan)
            (folder / 'plan.json').write_text(remotion_plan.model_dump_json(indent=2), encoding='utf-8')
        except Exception as e:
            logger.warning(f"Could not convert scene plan to plan.json: {e}")

        return {
            "ok": True,
            "scene_plan": plan.model_dump(),
            "message": f"Scene plan created with {len(plan.scenes)} scenes in {req.language.upper()} and English!"
        }

    @app.post('/api/dashboard/scenes/update')
    def api_update_scene(req: dict[str, Any]):
        job_id = req.get('job_id')
        scene_index = req.get('scene_index', 0)
        scene_data = req.get('scene', {})
        if not job_id:
            raise HTTPException(400, "Missing job_id")
        
        server.get_job(job_id)
        folder = DATA / job_id
        plan_file = folder / 'scene_plan.json'
        
        if not plan_file.is_file():
            # Create minimal scene plan if none exists
            from .dashboard_agent import ExplainerScenePlan, SceneItem
            initial_scene = SceneItem(
                scene_index=0,
                template=scene_data.get('template', 'kinetic_text'),
                start_seconds=0.0,
                duration_seconds=float(scene_data.get('duration_seconds', 3.0)),
                headline=scene_data.get('headline', 'Your Hook Headline'),
                subtitle=scene_data.get('subtitle', ''),
                voiceover_script_en=scene_data.get('voiceover_script_en', ''),
                voiceover_script_hi=scene_data.get('voiceover_script_hi', ''),
                assigned_asset=scene_data.get('assigned_asset', ''),
                transition=scene_data.get('transition', 'cut')
            )
            plan = ExplainerScenePlan(
                title="Explainer Video",
                duration_seconds=initial_scene.duration_seconds,
                scenes=[initial_scene]
            )
        else:
            from .dashboard_agent import ExplainerScenePlan
            plan = ExplainerScenePlan.model_validate_json(plan_file.read_text(encoding='utf-8'))
            if 0 <= scene_index < len(plan.scenes):
                target = plan.scenes[scene_index]
                for k, v in scene_data.items():
                    if hasattr(target, k):
                        setattr(target, k, v)
            elif len(plan.scenes) == 0:
                from .dashboard_agent import SceneItem
                new_scene = SceneItem(
                    scene_index=0,
                    template=scene_data.get('template', 'kinetic_text'),
                    start_seconds=0.0,
                    duration_seconds=float(scene_data.get('duration_seconds', 3.0)),
                    headline=scene_data.get('headline', 'Your Hook Headline'),
                    subtitle=scene_data.get('subtitle', ''),
                    voiceover_script_en=scene_data.get('voiceover_script_en', ''),
                    voiceover_script_hi=scene_data.get('voiceover_script_hi', ''),
                    assigned_asset=scene_data.get('assigned_asset', ''),
                    transition=scene_data.get('transition', 'cut')
                )
                plan.scenes.append(new_scene)
        
        plan_file.write_text(plan.model_dump_json(indent=2), encoding='utf-8')
        
        # Mirror to dashboard_project.json
        dashboard_file = folder / 'dashboard_project.json'
        if dashboard_file.is_file():
            try:
                state = json.loads(dashboard_file.read_text(encoding='utf-8'))
                state['scene_plan'] = plan.model_dump()
                dashboard_file.write_text(json.dumps(state, indent=2), encoding='utf-8')
            except Exception:
                pass
                
        return {"ok": True, "scene_plan": plan.model_dump(), "message": "Scene updated and persisted!"}

    @app.post('/api/dashboard/paste-and-render')
    def api_paste_and_render(req: dict[str, Any]):
        job_id = req.get('job_id')
        if not job_id:
            raise HTTPException(400, "Missing job_id")
        
        server.get_job(job_id)
        folder = DATA / job_id
        jsx_code = req.get('jsx_code', '').strip()
        voiceover_script = req.get('voiceover_script', '').strip()
        scene_plan_str = req.get('scene_plan_json', '').strip()
        aspect = req.get('aspect', '9:16')

        # 1. Save JSX code if provided
        if jsx_code:
            rebuild_dir = folder / 'rebuild'
            rebuild_dir.mkdir(parents=True, exist_ok=True)
            (rebuild_dir / 'Composition.jsx').write_text(jsx_code, encoding='utf-8')
            (folder / 'CustomComposition.jsx').write_text(jsx_code, encoding='utf-8')

        # 2. Save voiceover script
        if voiceover_script:
            (folder / 'voiceover.txt').write_text(voiceover_script, encoding='utf-8')

        # 3. Save or generate scene plan
        if scene_plan_str:
            try:
                parsed_plan = json.loads(scene_plan_str)
                (folder / 'scene_plan.json').write_text(json.dumps(parsed_plan, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Failed to parse pasted scene plan JSON: {e}")

        # Update dashboard_project.json
        dashboard_file = folder / 'dashboard_project.json'
        if dashboard_file.is_file():
            try:
                state = json.loads(dashboard_file.read_text(encoding='utf-8'))
                state['stage'] = 'Custom code merged. Rendering…'
                state['aspect'] = aspect
                dashboard_file.write_text(json.dumps(state, indent=2), encoding='utf-8')
            except Exception:
                pass

        # 4. Ensure plan.json exists for Remotion runner
        plan_file = folder / 'plan.json'
        if not plan_file.is_file():
            from .models import Plan, Track, Keyframe
            fallback_plan = Plan(
                title=f"Custom Explainer ({job_id})",
                summary="User custom JSX & voiceover merge",
                tracks=[
                    Track(id="main_title", kind="text", text="Autonomous AI Platform", start=0.0, end=5.0, color="#ffffff", keyframes=[Keyframe(t=0.0, opacity=1.0)])
                ],
                background="#0a0a0f"
            )
            plan_file.write_text(fallback_plan.model_dump_json(indent=2), encoding='utf-8')

        # Trigger Remotion render
        from .rebrand import api_render_remotion
        comp = 'DashboardShowcase' if aspect == '16:9' else 'Motion'
        render_res = api_render_remotion(job_id, format='mp4', composition=comp)
        return {
            "ok": True,
            "message": "Custom JSX & voiceover merged successfully! Remotion 60 FPS render started.",
            "render": render_res
        }

    @app.post('/api/dashboard/project/{id}/save')
    def api_save_dashboard_project(id: str, payload: dict[str, Any]):
        server.get_job(id)
        folder = DATA / id
        dashboard_file = folder / 'dashboard_project.json'
        dashboard_file.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        
        if 'blueprint' in payload and payload['blueprint']:
            (folder / 'blueprint.json').write_text(json.dumps(payload['blueprint'], indent=2), encoding='utf-8')
        if 'scene_plan' in payload and payload['scene_plan']:
            (folder / 'scene_plan.json').write_text(json.dumps(payload['scene_plan'], indent=2), encoding='utf-8')

        return {"ok": True, "message": "Dashboard project saved to disk."}

    @app.post('/api/dashboard/project/{id}/reference')
    async def api_attach_project_reference(
        id: str,
        video: UploadFile | None = File(None),
        url: str = Form("")
    ):
        job = server.get_job(id)
        folder = DATA / id
        clean_url = url.strip()

        if not video and not clean_url:
            raise HTTPException(400, "Please provide a video file or public video URL.")

        if video and video.filename:
            # Direct video file upload
            await server.save_upload(video, folder / 'source.mp4', server.MAX_BYTES)
            from .media import thumbnail, probe
            try:
                meta = probe(folder / 'source.mp4')
                (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                job['media'] = meta
                thumbnail(folder / 'source.mp4', folder / 'thumbnail.jpg')
            except Exception as e:
                logger.warning(f"Metadata probe failed on uploaded reference: {e}")
            job['has_reference'] = True
            job['url'] = ''
        elif clean_url:
            # Download from public URL (YouTube, Vimeo, X, direct mp4)
            from .media import download, prepare, thumbnail
            cancel = threading.Event()
            input_bin = folder / 'input.bin'
            try:
                download(clean_url, input_bin, cancel, lambda stage, pct: None)
                if not input_bin.exists() or input_bin.stat().st_size < 10240:
                    raise ValueError("Downloaded file is empty or under 10KB. Link may be private or protected.")
                meta, _ = prepare(input_bin, folder, cancel, lambda stage, pct: None, rebuild=True)
                if not (folder / 'source.mp4').exists() or (folder / 'source.mp4').stat().st_size < 10240:
                    raise ValueError("Failed to extract valid MP4 from video link.")
                job['media'] = meta
                job['url'] = clean_url
                thumbnail(folder / 'source.mp4', folder / 'thumbnail.jpg')
            except Exception as e:
                logger.error(f"URL download failed: {e}")
                # Clean up failed download artifacts
                input_bin.unlink(missing_ok=True)
                raise HTTPException(400, f"Could not download video from link: {e}")

        job['stage'] = 'Reference ready'
        job['status'] = 'draft'
        with server.LOCK:
            server.JOBS[id] = job
        server.persist(job)

        # Update dashboard_project.json
        dashboard_file = folder / 'dashboard_project.json'
        state = {}
        if dashboard_file.is_file():
            try:
                state = json.loads(dashboard_file.read_text(encoding='utf-8'))
            except Exception:
                pass
        state.update({
            "job_id": id,
            "has_reference": (folder / "source.mp4").is_file(),
            "reference_url": clean_url,
            "source_url": f"/media/{id}/source.mp4" if (folder / "source.mp4").is_file() else None,
            "stage": "Reference ready"
        })
        dashboard_file.write_text(json.dumps(state, indent=2), encoding='utf-8')

        return {
            "ok": True,
            "job_id": id,
            "source_url": f"/media/{id}/source.mp4",
            "has_reference": True,
            "message": "Reference video attached successfully!"
        }

    @app.post('/api/dashboard/create-project')
    async def api_create_dashboard_project(
        name: str = Form("New Explainer Project"),
        aspect: str = Form("9:16"),
        language: str = Form("en"),
        reference_url: str = Form(""),
        reference_file: UploadFile | None = File(None)
    ):
        with server.LOCK:
            if server.ACTIVE['id']:
                raise HTTPException(409, 'Another project is processing. Please wait.')
            new_id = uuid.uuid4().hex[:12]
            server.ACTIVE['id'] = new_id

        folder = DATA / new_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'assets').mkdir(exist_ok=True)

        try:
            clean_ref_url = reference_url.strip()
            if reference_file and reference_file.filename:
                await server.save_upload(reference_file, folder / 'source.mp4', server.MAX_BYTES)
                from .media import thumbnail, probe
                try:
                    meta = probe(folder / 'source.mp4')
                    (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                    thumbnail(folder / 'source.mp4', folder / 'thumbnail.jpg')
                except Exception:
                    pass
            elif clean_ref_url:
                from .media import download, prepare, thumbnail
                cancel = threading.Event()
                input_bin = folder / 'input.bin'
                try:
                    download(clean_ref_url, input_bin, cancel, lambda stage, pct: None)
                    if not input_bin.exists() or input_bin.stat().st_size < 10240:
                        raise ValueError("Downloaded file is empty or under 10KB. Link may be private or protected.")
                    meta, _ = prepare(input_bin, folder, cancel, lambda stage, pct: None, rebuild=True)
                    if not (folder / 'source.mp4').exists() or (folder / 'source.mp4').stat().st_size < 10240:
                        raise ValueError("Failed to extract valid MP4 from video link.")
                    thumbnail(folder / 'source.mp4', folder / 'thumbnail.jpg')
                except Exception as e:
                    logger.warning(f"Initial URL download error: {e}")
                    input_bin.unlink(missing_ok=True)
                    shutil.rmtree(folder, ignore_errors=True)
                    with server.LOCK:
                        server.ACTIVE['id'] = None
                    raise HTTPException(400, f"Could not download video from link. Platforms like Instagram often require login. Please upload your video file directly using the 'Upload MP4' button: {e}")
            
            job = {
                'id': new_id,
                'created': time.time(),
                'name': name.strip() or 'Explainer Project',
                'status': 'draft',
                'stage': 'Reference loaded',
                'progress': 100,
                'brief': {'brand': name, 'instructions': '', 'mode': 'rebuild', 'accent': '#00f2fe'},
                'url': clean_ref_url,
                'events': [],
                'error': None
            }
            with server.LOCK:
                server.JOBS[new_id] = job
            server.persist(job)

            dashboard_state = {
                "job_id": new_id,
                "name": name,
                "aspect": aspect,
                "language": language,
                "stage": "Reference loaded",
                "status": "draft",
                "reference_url": reference_url.strip(),
                "has_reference": (folder / "source.mp4").is_file(),
                "music_track": "tech_upbeat",
                "assets": []
            }
            (folder / 'dashboard_project.json').write_text(json.dumps(dashboard_state, indent=2), encoding='utf-8')

            return dashboard_state
        finally:
            with server.LOCK:
                server.ACTIVE['id'] = None

    @app.post('/api/dashboard/upload-custom-music/{id}')
    async def api_upload_custom_music(id: str, file: UploadFile = File(...)):
        server.get_job(id)
        folder = DATA / id
        assets_dir = folder / 'assets'
        assets_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "custom_music_" + re.sub(r'[^a-zA-Z0-9_\-\.]', '_', file.filename or 'track.mp3')
        if not re.search(r'\.(mp3|wav|m4a|aac|ogg)$', safe_name, re.I):
            safe_name += '.mp3'

        dest = assets_dir / safe_name
        contents = await file.read()
        dest.write_bytes(contents)

        return {
            "ok": True,
            "filename": safe_name,
            "url": f"/media/{id}/assets/{safe_name}",
            "name": f"User Upload: {Path(file.filename or 'audio').stem}"
        }

