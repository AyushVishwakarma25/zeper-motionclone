"""Dashboard API routes for MotionClone: Reference-to-Video Studio."""
import json
import logging
import re
import shutil
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
        
        meta = {}
        if (folder / 'media.json').is_file():
            meta = json.loads((folder / 'media.json').read_text(encoding='utf-8'))
        elif (folder / 'temporal.json').is_file():
            meta = json.loads((folder / 'temporal.json').read_text(encoding='utf-8'))
        else:
            meta = {"duration": 30.0, "fps": 30, "aspect": req.aspect}

        blueprint = generate_blueprint_from_reference(
            reference_meta=meta,
            aspect=req.aspect,
            brief_notes=req.notes
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

        # Persist scene plan
        (folder / 'scene_plan.json').write_text(plan.model_dump_json(indent=2), encoding='utf-8')

        return {
            "ok": True,
            "scene_plan": plan.model_dump(),
            "message": f"Scene plan created with {len(plan.scenes)} scenes in {req.language.upper()} and English!"
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
            if reference_file and reference_file.filename:
                await server.save_upload(reference_file, folder / 'source.mp4', server.MAX_BYTES)
            
            job = {
                'id': new_id,
                'created': time.time(),
                'name': name.strip() or 'Explainer Project',
                'status': 'draft',
                'stage': 'Reference loaded',
                'progress': 100,
                'brief': {'brand': name, 'instructions': '', 'mode': 'rebuild', 'accent': '#00f2fe'},
                'url': reference_url.strip(),
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

