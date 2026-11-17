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
from fastapi import BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from . import dashboard_agent
from .dashboard_agent import (
    ASPECT_RATIOS,
    ROYALTY_FREE_MUSIC_TRACKS,
    BlueprintStructure,
    ExplainerScenePlan,
    SceneItem,
)
from .security import (
    ALLOWED_AUDIO_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    ALLOWED_ASSET_EXTENSIONS,
    validate_and_save_upload,
)

logger = logging.getLogger('motionclone.dashboard.routes')


# --- Domain Errors (Phase 2 Specification) ---
class DomainError(HTTPException):
    def __init__(self, message: str, code: str = "DOMAIN_ERROR", status_code: int = 400, hint: str = ""):
        detail: dict[str, Any] = {"error": message, "code": code}
        if hint:
            detail["hint"] = hint
        super().__init__(status_code=status_code, detail=detail)


class GeminiNotConfiguredError(DomainError):
    def __init__(
        self,
        message: str = "Gemini not configured",
        hint: str = "Set GEMINI_API_KEY or configure Vertex AI in Settings."
    ):
        super().__init__(message=message, code="GEMINI_NOT_CONFIGURED", status_code=400, hint=hint)


class UpstreamAIError(DomainError):
    def __init__(self, message: str):
        super().__init__(message=message, code="UPSTREAM_AI_ERROR", status_code=502)


# --- Request and Response Schemas ---
class ChatRequest(BaseModel):
    message: str
    job_id: str = ""
    history: list[dict[str, str]] = Field(default_factory=list)
    aspect: str = "9:16"
    language: str = "en"


class BlueprintGenerateRequest(BaseModel):
    job_id: str
    aspect: str = "9:16"
    notes: str = ""


class ScenePlanGenerateRequest(BaseModel):
    job_id: str
    user_story: str = ""
    brand_name: str = ""
    brand_tagline: str = ""
    language: str = "en"
    aspect: str = "9:16"
    target_duration: str = "30s"
    voice_id: str = "hm_omega"
    music_track_id: str = "tech_upbeat"


class PreflightEstimateRequest(BaseModel):
    job_id: str = ""
    engine_type: str = "REMOTION_CODE_SCENE"
    resolution: str = "1080p"
    duration_sec: float = 5.0
    quality_preset: str = "standard"


class PreflightEstimateResponse(BaseModel):
    engine_type: str
    credits_required: int
    is_free: bool
    total_credits: int
    description: str
    breakdown: list[dict[str, Any]] = Field(default_factory=list)


class DeductCreditsRequest(BaseModel):
    amount: int | float
    reason: str = "generation"
    job_id: str = ""
    user_id: str = "default_user"


class SceneUpdateRequest(BaseModel):
    job_id: str
    id: int | str | None = None
    shot_index: int | None = None
    scene_index: int | None = None
    title: str | None = None
    scene: dict[str, Any] | None = None
    model_config = ConfigDict(extra="allow")


class DashboardProjectSaveRequest(BaseModel):
    job_id: str | None = None
    name: str | None = None
    aspect: str | None = "9:16"
    language: str | None = "en"
    stage: str | None = None
    status: str | None = None
    reference_url: str | None = None
    has_reference: bool | None = None
    blueprint: BlueprintStructure | None = None
    scene_plan: ExplainerScenePlan | None = None
    music_track: str | None = None
    assets: list[Any] | None = None
    preview_url: str | None = None
    source_url: str | None = None
    model_config = ConfigDict(extra="allow")


class PasteAndRenderRequest(BaseModel):
    job_id: str
    jsx_code: str = ""
    voiceover_script: str = ""
    scene_plan_json: str = ""
    aspect: str = "9:16"
    model_config = ConfigDict(extra="allow")


class GenerateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    brief: str | None = None
    language: str | None = "en"
    aspect: str | None = "9:16"
    music_track: str | None = "tech_upbeat"
    voice_id: str | None = "hm_omega"
    duration: str | None = "30s"
    use_existing_scene_plan: bool = False
    fps: int = 30


def install(app, server):
    @app.exception_handler(DomainError)
    def domain_error_handler(request: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    @app.middleware("http")
    async def dashboard_error_boundary(request: Request, call_next):
        if not request.url.path.startswith("/api/dashboard"):
            return await call_next(request)
        try:
            return await call_next(request)
        except HTTPException:
            raise
        except DomainError as de:
            return JSONResponse(status_code=de.status_code, content=de.detail)
        except Exception as exc:
            msg = str(exc)
            logger.exception(f"Unhandled error on dashboard route {request.url.path}: {exc}")
            if "not configured" in msg.lower() or ("gemini" in msg.lower() and "key" in msg.lower()):
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "Gemini not configured",
                        "code": "GEMINI_NOT_CONFIGURED",
                        "hint": "Set GEMINI_API_KEY or configure Vertex AI in Settings."
                    }
                )
            req_id = uuid.uuid4().hex[:8]
            return JSONResponse(
                status_code=500,
                content={
                    "error": msg or "Internal server error",
                    "code": "INTERNAL_SERVER_ERROR",
                    "request_id": req_id
                }
            )

    @app.post('/api/dashboard/preflight-estimate')
    def api_preflight_estimate(req: PreflightEstimateRequest):
        # Pass real scene plan saved on the project if job_id is provided
        if req.job_id:
            server.get_job(req.job_id)
            folder = server.DATA / req.job_id
            plan_file = folder / 'scene_plan.json'
            if plan_file.is_file():
                try:
                    plan_data = json.loads(plan_file.read_text(encoding='utf-8'))
                    cost_info = dashboard_agent.estimate_cost(plan_data)
                    credits = cost_info['total_credits']
                    return {
                        "job_id": req.job_id,
                        "engine_type": req.engine_type,
                        "credits_required": credits,
                        "is_free": credits == 0,
                        "total_credits": credits,
                        "breakdown": cost_info.get('breakdown', []),
                        "description": "Zero credit execution" if credits == 0 else f"{credits} credits required for high-fidelity generation"
                    }
                except Exception as e:
                    logger.warning(f"Error estimating cost from project scene plan: {e}")

        # Fallback to single shot / synthetic shot plan with requested parameters
        cost_info = dashboard_agent.estimate_cost([{
            'engine': req.engine_type,
            'duration_seconds': req.duration_sec,
            'resolution': req.resolution,
            'quality_preset': req.quality_preset
        }])
        credits = cost_info['total_credits']
        return {
            "engine_type": req.engine_type,
            "credits_required": credits,
            "is_free": credits == 0,
            "total_credits": credits,
            "breakdown": cost_info.get('breakdown', []),
            "description": "Zero credit execution" if credits == 0 else f"{credits} credits required for high-fidelity generation"
        }

    @app.get('/api/dashboard/music-library')
    def get_music_library():
        return {
            "tracks": ROYALTY_FREE_MUSIC_TRACKS,
            "aspect_ratios": ASPECT_RATIOS
        }

    @app.post('/api/credits/deduct')
    def api_deduct_credits(req: DeductCreditsRequest, request: Request):
        from . import credits
        uid = req.user_id or "default_user"
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            from .security import verify_token
            try:
                decoded = verify_token(auth_header.split('Bearer ')[1].strip())
                uid = decoded.get('uid') or decoded.get('email') or uid
            except Exception:
                pass

        try:
            res = credits.check_and_deduct_credits(
                user_id=uid,
                required_credits=req.amount,
                description=req.reason,
                job_id=req.job_id
            )
            return res
        except credits.InsufficientCreditsError as ice:
            curr = credits.get_balance(uid)
            raise HTTPException(
                status_code=402,
                detail={
                    "error": str(ice),
                    "code": "INSUFFICIENT_CREDITS",
                    "required": req.amount,
                    "available": curr
                }
            )

    @app.get('/api/credits/balance')
    def api_get_credits_balance(request: Request, user_id: str = "default_user"):
        from . import credits
        uid = user_id
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            from .security import verify_token
            try:
                decoded = verify_token(auth_header.split('Bearer ')[1].strip())
                uid = decoded.get('uid') or decoded.get('email') or uid
            except Exception:
                pass
        return {"user_id": uid, "balance": credits.get_balance(uid)}

    @app.get('/api/dashboard/project/{id}')
    def get_dashboard_project(id: str):
        # Pure read-only, side-effect free: NO file copying, probing, or thumbnail generation on read.
        job = server.get_job(id)
        folder = server.DATA / id
        dashboard_file = folder / 'dashboard_project.json'
        
        default_state = {
            "job_id": id,
            "name": job.get("name", "Untitled Explainer"),
            "aspect": "9:16",
            "language": "en",
            "stage": job.get("stage", "Reference imported"),
            "status": job.get("status", "draft"),
            "reference_url": job.get("url", ""),
            "has_reference": False,
            "blueprint": None,
            "scene_plan": None,
            "music_track": "tech_upbeat",
            "assets": [],
            "preview_url": None,
            "source_url": None,
        }

        if dashboard_file.is_file():
            try:
                saved = json.loads(dashboard_file.read_text(encoding='utf-8'))
                default_state.update(saved)
            except Exception:
                pass

        # Blueprint on disk
        if (folder / 'blueprint.json').is_file() and not default_state.get('blueprint'):
            try:
                default_state['blueprint'] = json.loads((folder / 'blueprint.json').read_text(encoding='utf-8'))
            except Exception:
                pass

        # Scene plan on disk
        if (folder / 'scene_plan.json').is_file() and not default_state.get('scene_plan'):
            try:
                default_state['scene_plan'] = json.loads((folder / 'scene_plan.json').read_text(encoding='utf-8'))
            except Exception:
                pass

        # Assets drawer listing
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

        # Read-only reference inspection (no copying)
        source_p = folder / "source.mp4"
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
        from .ai import auth_status
        if not auth_status():
            raise GeminiNotConfiguredError()

        project_state = {}
        if req.job_id:
            try:
                project_state = get_dashboard_project(req.job_id)
            except Exception:
                pass

        try:
            response = dashboard_agent.process_dashboard_chat_turn(
                message=req.message,
                history=req.history,
                project_state=project_state
            )
            return response
        except ValueError as ve:
            if "not configured" in str(ve).lower():
                raise GeminiNotConfiguredError(str(ve))
            raise UpstreamAIError(str(ve))
        except Exception as e:
            if "not configured" in str(e).lower():
                raise GeminiNotConfiguredError(str(e))
            raise UpstreamAIError(f"Chat processing failed: {e}")

    @app.post('/api/dashboard/blueprint')
    @app.post('/api/dashboard/deconstruct')
    def api_generate_blueprint(req: BlueprintGenerateRequest):
        server.get_job(req.job_id)
        folder = server.DATA / req.job_id

        from .ai import auth_status
        if not auth_status():
            raise GeminiNotConfiguredError()
        
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

        deconstruct_dir = folder / 'deconstruct'
        deconstruct_dir.mkdir(parents=True, exist_ok=True)
        evidence = {}
        if ref_video_path.is_file():
            from .pipeline import extract_evidence
            try:
                evidence = extract_evidence(ref_video_path, deconstruct_dir)
            except Exception as ev_err:
                logger.warning(f"Local evidence extraction error: {ev_err}")

        try:
            blueprint = dashboard_agent.generate_blueprint_from_reference(
                reference_meta=meta,
                aspect=req.aspect,
                brief_notes=req.notes,
                reference_video_path=ref_video_path if ref_video_path.is_file() else None,
                evidence=evidence,
                deconstruct_dir=deconstruct_dir
            )
        except ValueError as ve:
            if "not configured" in str(ve).lower():
                raise GeminiNotConfiguredError(str(ve))
            raise UpstreamAIError(str(ve))
        except Exception as e:
            if "not configured" in str(e).lower():
                raise GeminiNotConfiguredError(str(e))
            raise UpstreamAIError(f"Upstream blueprint generation failed: {e}")

        # Persist blueprint
        (folder / 'blueprint.json').write_text(blueprint.model_dump_json(indent=2), encoding='utf-8')
        
        return {
            "ok": True,
            "blueprint": blueprint.model_dump(),
            "message": "AI Blueprint generated successfully. Review and approve the scene flow below."
        }

    @app.post('/api/dashboard/scene-plan')
    def api_generate_scene_plan(req: ScenePlanGenerateRequest):
        server.get_job(req.job_id)
        folder = server.DATA / req.job_id

        from .ai import auth_status
        if not auth_status():
            raise GeminiNotConfiguredError()

        # Load blueprint
        blueprint_file = folder / 'blueprint.json'
        if not blueprint_file.is_file():
            raise HTTPException(400, "Please generate a blueprint from the reference first.")

        try:
            blueprint_data = json.loads(blueprint_file.read_text(encoding='utf-8'))
            blueprint = BlueprintStructure.model_validate(blueprint_data)
        except Exception as e:
            raise HTTPException(400, f"Corrupted blueprint file: {e}")

        # List user assets
        assets = []
        assets_dir = folder / 'assets'
        if assets_dir.is_dir():
            assets = [p.name for p in assets_dir.glob('*') if p.is_file() and not p.name.startswith('.')]

        try:
            plan = dashboard_agent.generate_scene_plan(
                blueprint=blueprint,
                user_story=req.user_story,
                brand_name=req.brand_name,
                brand_tagline=req.brand_tagline,
                language=req.language,
                aspect=req.aspect,
                uploaded_assets=assets,
                target_duration=req.target_duration
            )
            plan.music_track_id = req.music_track_id
        except ValueError as ve:
            if "not configured" in str(ve).lower():
                raise GeminiNotConfiguredError(str(ve))
            raise UpstreamAIError(str(ve))
        except Exception as e:
            if "not configured" in str(e).lower():
                raise GeminiNotConfiguredError(str(e))
            raise UpstreamAIError(f"Upstream scene plan generation failed: {e}")

        # Persist scene plan & Remotion plan
        (folder / 'scene_plan.json').write_text(plan.model_dump_json(indent=2), encoding='utf-8')
        try:
            remotion_plan = dashboard_agent.export_scene_plan_to_remotion_plan(plan)
            (folder / 'plan.json').write_text(remotion_plan.model_dump_json(indent=2), encoding='utf-8')
        except Exception as e:
            logger.warning(f"Could not convert scene plan to plan.json: {e}")

        return {
            "ok": True,
            "scene_plan": plan.model_dump(),
            "message": f"Scene plan created with {len(plan.scenes)} scenes in {req.language.upper()} and English!"
        }

    @app.post('/api/dashboard/scenes/update')
    def api_update_scene(req: SceneUpdateRequest):
        server.get_job(req.job_id)
        folder = server.DATA / req.job_id
        plan_file = folder / 'scene_plan.json'
        
        if not plan_file.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Scene plan not found for project '{req.job_id}'. Please generate a scene plan first."
            )

        try:
            plan = ExplainerScenePlan.model_validate_json(plan_file.read_text(encoding='utf-8'))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid scene plan file on project '{req.job_id}': {e}")

        if not plan.scenes:
            raise HTTPException(status_code=404, detail=f"No scenes found in project '{req.job_id}'.")

        target_scene: SceneItem | None = None
        target_idx: int | None = None

        # 1. Primary lookup by scene id
        if req.id is not None:
            for idx, s in enumerate(plan.scenes):
                if str(s.id) == str(req.id):
                    target_scene = s
                    target_idx = idx
                    break

        # 2. Fallback lookup by shot_index or scene_index
        if target_scene is None:
            cand = req.shot_index if req.shot_index is not None else req.scene_index
            if cand is None and req.id is not None:
                try:
                    cand = int(req.id)
                except (ValueError, TypeError):
                    cand = None

            if cand is not None:
                if 0 <= cand < len(plan.scenes):
                    target_scene = plan.scenes[cand]
                    target_idx = cand
                elif 1 <= cand <= len(plan.scenes):
                    target_scene = plan.scenes[cand - 1]
                    target_idx = cand - 1

        # 3. Not found -> 404 with helpful error message
        if target_scene is None:
            available = [s.id for s in plan.scenes]
            raise HTTPException(
                status_code=404,
                detail=f"Scene with id='{req.id}' (index={req.shot_index or req.scene_index}) not found in project '{req.job_id}'. Available scene IDs: {available}."
            )

        # Update scene title
        scene_dict = req.scene or {}
        new_title = req.title or scene_dict.get('title') or scene_dict.get('name')
        if new_title:
            target_scene.title = str(new_title)

        # Update other fields
        updatable_fields = [
            'template', 'start_seconds', 'duration_seconds', 'headline',
            'subtitle', 'voiceover_script_en', 'voiceover_script_hi',
            'assigned_asset', 'transition', 'accent_color', 'background_color'
        ]
        for f in updatable_fields:
            if f in scene_dict:
                setattr(target_scene, f, scene_dict[f])
            elif hasattr(req, f) and getattr(req, f) is not None:
                setattr(target_scene, f, getattr(req, f))

        # Persist scene plan
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
                
        return {
            "ok": True,
            "scene_plan": plan.model_dump(),
            "updated_scene": target_scene.model_dump(),
            "message": f"Scene '{target_scene.title}' (ID {target_scene.id}) updated successfully."
        }

    @app.post('/api/dashboard/paste-and-render')
    def api_paste_and_render(req: PasteAndRenderRequest):
        server.get_job(req.job_id)
        folder = server.DATA / req.job_id
        jsx_code = req.jsx_code.strip()
        voiceover_script = req.voiceover_script.strip()
        scene_plan_str = req.scene_plan_json.strip()
        aspect = req.aspect

        # Detect if JSON scene plan was pasted into the code box
        if jsx_code.startswith(('{', '[')) and not scene_plan_str:
            try:
                parsed = json.loads(jsx_code)
                if isinstance(parsed, dict) and ('scenes' in parsed or 'shots' in parsed):
                    scene_plan_str = jsx_code
                    jsx_code = ""
            except Exception:
                pass
        elif jsx_code:
            # Validate sandboxed JSX imports: must be restricted to 'remotion' and 'react'
            for line in jsx_code.splitlines():
                line_str = line.strip()
                if line_str.startswith('import ') and not (
                    "'remotion'" in line_str or '"remotion"' in line_str or
                    "'react'" in line_str or '"react"' in line_str
                ):
                    raise HTTPException(400, "Sandboxed JSX compilation error: imports are restricted to 'remotion' and 'react'.")

        # 1. Save JSX code if provided (only when not JSON scene plan)
        if jsx_code:
            rebuild_dir = folder / 'rebuild'
            rebuild_dir.mkdir(parents=True, exist_ok=True)
            (rebuild_dir / 'Composition.jsx').write_text(jsx_code, encoding='utf-8')
            (folder / 'CustomComposition.jsx').write_text(jsx_code, encoding='utf-8')

        # 2. Save voiceover script
        if voiceover_script:
            (folder / 'voiceover.txt').write_text(voiceover_script, encoding='utf-8')

        # 3. Save scene plan if provided (Single source of truth)
        scenes = []
        if scene_plan_str:
            try:
                parsed_plan = json.loads(scene_plan_str)
                scenes = parsed_plan.get('scenes', []) or parsed_plan.get('shots', [])
                parsed_plan['aspect'] = aspect
                (folder / 'scene_plan.json').write_text(json.dumps(parsed_plan, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Failed to parse pasted scene plan JSON: {e}")

        # Check existing scene_plan.json if not provided in request
        if not scenes and (folder / 'scene_plan.json').is_file():
            try:
                existing_sp = json.loads((folder / 'scene_plan.json').read_text(encoding='utf-8'))
                scenes = existing_sp.get('scenes', []) or existing_sp.get('shots', [])
            except Exception:
                pass

        # Normalise duration and duration_seconds across all scenes
        for s in scenes:
            if 'duration' in s and 'duration_seconds' not in s:
                s['duration_seconds'] = float(s['duration'])
            elif 'duration_seconds' in s and 'duration' not in s:
                s['duration'] = float(s['duration_seconds'])
            elif 'duration_seconds' not in s and 'duration' not in s:
                s['duration_seconds'] = 3.0
                s['duration'] = 3.0

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

        # 4. Single Source of Truth: ensure plan.json strictly aligns with scene_plan
        from .models import Plan, Track, Keyframe
        plan_file = folder / 'plan.json'
        if scenes:
            # When scenes exist, scene_plan is the single source of truth.
            total_dur = round(sum(float(s.get('duration_seconds', 3.0)) for s in scenes), 2)
            plan = Plan(
                title=f"Explainer ({req.job_id})",
                summary="Scene plan driven render",
                tracks=[],
                scenes=scenes,
                background="#0a0a0f"
            )
            plan_file.write_text(plan.model_dump_json(indent=2), encoding='utf-8')
        elif not plan_file.is_file():
            # Fallback only when there is NO scene plan
            tracks = []
            if voiceover_script:
                lines = [l.strip() for l in voiceover_script.splitlines() if l.strip() and not l.strip().startswith(('#', '//'))]
                t_curr = 0.0
                for idx, line in enumerate(lines[:8]):
                    dur = max(2.5, min(6.0, len(line.split()) * 0.4))
                    t_start = round(t_curr, 2)
                    t_end = round(t_curr + dur, 2)
                    t_curr = t_end
                    tracks.append(
                        Track(
                            id=f"vo_track_{idx + 1}",
                            kind="text",
                            text=line[:120],
                            start=t_start,
                            end=t_end,
                            color="#ffffff",
                            size=0.065,
                            keyframes=[Keyframe(t=0.0, opacity=1.0)]
                        )
                    )
            if not tracks:
                tracks = [
                    Track(id="main_title", kind="text", text="Autonomous AI Platform", start=0.0, end=5.0, color="#ffffff", keyframes=[Keyframe(t=0.0, opacity=1.0)])
                ]
            fallback_plan = Plan(
                title=f"Custom Explainer ({req.job_id})",
                summary="User custom JSX & voiceover merge",
                tracks=tracks,
                background="#0a0a0f"
            )
            plan_file.write_text(fallback_plan.model_dump_json(indent=2), encoding='utf-8')

        # Trigger Remotion render using the universal Motion multi-scene composition
        from .rebrand import trigger_remotion_render
        render_res = trigger_remotion_render(req.job_id, format='mp4', composition='Motion')
        return {
            "ok": True,
            "message": "Scene plan merged successfully! Remotion render started.",
            "render": render_res
        }

    @app.post('/api/dashboard/project/{id}/save')
    def api_save_dashboard_project(id: str, payload: DashboardProjectSaveRequest):
        # Validates with Pydantic; invalid scene_plan or blueprint schemas return 422 with field-level errors
        server.get_job(id)
        folder = server.DATA / id
        dashboard_file = folder / 'dashboard_project.json'
        save_data = payload.model_dump(exclude_none=True)
        dashboard_file.write_text(json.dumps(save_data, indent=2), encoding='utf-8')
        
        if payload.blueprint:
            (folder / 'blueprint.json').write_text(payload.blueprint.model_dump_json(indent=2), encoding='utf-8')
        if payload.scene_plan:
            (folder / 'scene_plan.json').write_text(payload.scene_plan.model_dump_json(indent=2), encoding='utf-8')

        return {"ok": True, "message": "Dashboard project saved to disk."}

    @app.post('/api/dashboard/project/{id}/reference')
    async def api_attach_project_reference(
        id: str,
        video: UploadFile | None = File(None),
        url: str = Form("")
    ):
        job = server.get_job(id)
        folder = server.DATA / id
        clean_url = url.strip()

        if not video and not clean_url:
            raise HTTPException(400, "Please provide a video file or public video URL.")

        if video and video.filename:
            # Direct video file upload
            await validate_and_save_upload(video, folder / 'source.mp4', ALLOWED_VIDEO_EXTENSIONS)
            from .media import thumbnail, probe
            try:
                meta = await run_in_threadpool(probe, folder / 'source.mp4')
                (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                job['media'] = meta
                await run_in_threadpool(thumbnail, folder / 'source.mp4', folder / 'thumbnail.jpg')
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
                await run_in_threadpool(download, clean_url, input_bin, cancel, lambda stage, pct: None)
                if not input_bin.exists() or input_bin.stat().st_size < 10240:
                    raise ValueError("Downloaded file is empty or under 10KB. Link may be private or protected.")
                meta, _ = await run_in_threadpool(prepare, input_bin, folder, cancel, lambda stage, pct: None, True)
                if not (folder / 'source.mp4').exists() or (folder / 'source.mp4').stat().st_size < 10240:
                    raise ValueError("Failed to extract valid MP4 from video link.")
                job['media'] = meta
                job['url'] = clean_url
                await run_in_threadpool(thumbnail, folder / 'source.mp4', folder / 'thumbnail.jpg')
            except Exception as e:
                logger.error(f"URL download failed: {e}")
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
        name: str = Form(""),
        title: str = Form(""),
        aspect: str = Form("9:16"),
        language: str = Form("en"),
        duration: str = Form("30s"),
        voice_id: str = Form("hm_omega"),
        reference_url: str = Form(""),
        reference_file: UploadFile | None = File(None)
    ):
        project_name = (title or name or "New Explainer Project").strip()
        with server.LOCK:
            if server.ACTIVE['id']:
                raise HTTPException(409, 'Another project is processing. Please wait.')
            new_id = uuid.uuid4().hex[:12]
            server.ACTIVE['id'] = new_id

        folder = server.DATA / new_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'assets').mkdir(exist_ok=True)

        try:
            clean_ref_url = reference_url.strip()
            if reference_file and reference_file.filename:
                await validate_and_save_upload(reference_file, folder / 'source.mp4', ALLOWED_VIDEO_EXTENSIONS)
                from .media import thumbnail, probe
                try:
                    meta = await run_in_threadpool(probe, folder / 'source.mp4')
                    (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                    await run_in_threadpool(thumbnail, folder / 'source.mp4', folder / 'thumbnail.jpg')
                except Exception:
                    pass
            elif clean_ref_url:
                from .media import download, prepare, thumbnail
                cancel = threading.Event()
                input_bin = folder / 'input.bin'
                try:
                    await run_in_threadpool(download, clean_ref_url, input_bin, cancel, lambda stage, pct: None)
                    if not input_bin.exists() or input_bin.stat().st_size < 10240:
                        raise ValueError("Downloaded file is empty or under 10KB. Link may be private or protected.")
                    meta, _ = await run_in_threadpool(prepare, input_bin, folder, cancel, lambda stage, pct: None, True)
                    if not (folder / 'source.mp4').exists() or (folder / 'source.mp4').stat().st_size < 10240:
                        raise ValueError("Failed to extract valid MP4 from video link.")
                    await run_in_threadpool(thumbnail, folder / 'source.mp4', folder / 'thumbnail.jpg')
                except Exception as e:
                    logger.warning(f"Initial URL download error: {e}")
                    input_bin.unlink(missing_ok=True)
                    shutil.rmtree(folder, ignore_errors=True)
                    with server.LOCK:
                        server.ACTIVE['id'] = None
                    raise HTTPException(400, f"Could not download video from link: {e}")
            
            job = {
                'id': new_id,
                'created': time.time(),
                'name': project_name,
                'status': 'draft',
                'stage': 'Reference loaded',
                'progress': 100,
                'cancel': threading.Event(),
                'brief': {'brand': project_name, 'instructions': '', 'mode': 'rebuild', 'accent': '#00f2fe'},
                'url': clean_ref_url,
                'events': [],
                'error': None
            }
            with server.LOCK:
                server.JOBS[new_id] = job
            server.persist(job)

            dashboard_state = {
                "job_id": new_id,
                "name": project_name,
                "aspect": aspect,
                "language": language,
                "duration": duration,
                "target_duration": duration,
                "voice_id": voice_id,
                "stage": "Reference loaded",
                "status": "draft",
                "reference_url": clean_ref_url,
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
        folder = server.DATA / id
        assets_dir = folder / 'assets'
        assets_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "custom_music_" + re.sub(r'[^a-zA-Z0-9_\-\.]', '_', file.filename or 'track.mp3')
        dest = assets_dir / safe_name
        await validate_and_save_upload(file, dest, ALLOWED_AUDIO_EXTENSIONS)

        return {
            "ok": True,
            "filename": safe_name,
            "url": f"/media/{id}/assets/{safe_name}",
            "name": f"User Upload: {Path(file.filename or 'audio').stem}"
        }

    @app.post('/api/dashboard/project/{id}/generate')
    def api_generate_project_video(
        id: str,
        background_tasks: BackgroundTasks,
        request: Request,
        req: GenerateProjectRequest | None = None
    ):
        if req is None:
            req = GenerateProjectRequest()
        job = server.get_job(id)
        folder = server.DATA / id
        dashboard_file = folder / 'dashboard_project.json'
        project_state = {}
        if dashboard_file.is_file():
            try:
                project_state = json.loads(dashboard_file.read_text(encoding='utf-8'))
            except Exception:
                pass

        user_brief = req.brief or project_state.get('name') or job.get('name') or "AI Explainer Video"
        aspect = req.aspect or project_state.get('aspect') or '9:16'
        language = req.language or project_state.get('language') or 'en'
        music_track = req.music_track or project_state.get('music_track') or 'tech_upbeat'
        if req and req.fps == 60:
            raise HTTPException(
                status_code=400,
                detail="60 FPS is not supported. MotionClone V3 canonical frame rate is strictly 30 FPS."
            )
        fps = 30

        # User identification for credit gate
        user = getattr(request.state, 'user', None) or {}
        user_id = user.get('uid') or user.get('user_id') or user.get('email') or 'default_user'

        # Preflight credit check
        from . import credits, preflight
        scenes = []
        if req.use_existing_scene_plan:
            if (folder / 'scene_plan.json').is_file():
                try:
                    sp_data = json.loads((folder / 'scene_plan.json').read_text(encoding='utf-8'))
                    scenes = sp_data.get('scenes', [])
                except Exception:
                    pass
            if not scenes and project_state.get('scene_plan', {}).get('scenes'):
                scenes = project_state['scene_plan']['scenes']

        cost = preflight.estimate_cost(scenes) if scenes else {'total_credits': 0, 'breakdown': []}
        req_credits = cost.get('total_credits', 0)
        user_balance = credits.get_balance(user_id)
        if user_balance < req_credits:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Insufficient credits",
                    "code": "INSUFFICIENT_CREDITS",
                    "required_credits": req_credits,
                    "available_credits": user_balance,
                    "breakdown": cost.get('breakdown', [])
                }
            )

        voice_id = (req and req.voice_id) or project_state.get('voice_id') or 'hm_omega'
        target_duration = (req and req.duration) or project_state.get('duration') or '30s'

        # Update dashboard_project.json
        project_state.update({
            'name': user_brief,
            'aspect': aspect,
            'language': language,
            'music_track': music_track,
            'voice_id': voice_id,
            'duration': target_duration,
            'fps': fps,
            'stage': 'Generating video…',
            'status': 'processing'
        })
        dashboard_file.write_text(json.dumps(project_state, indent=2), encoding='utf-8')

        from . import pipeline

        def _run_pipeline_bg():
            try:
                pipeline.run_pipeline(
                    project_dir=folder,
                    user_brief=user_brief,
                    aspect=aspect,
                    language=language,
                    music_track=music_track,
                    voice_id=voice_id,
                    target_duration=target_duration,
                    use_existing_scene_plan=req.use_existing_scene_plan,
                    fps=fps,
                    user_id=user_id,
                    cancel=job.get('cancel')
                )
            except Exception as e:
                logger.error(f"Background pipeline failed for project {id}: {e}")

        background_tasks.add_task(_run_pipeline_bg)
        return {
            "status": "started",
            "job_id": id,
            "message": f"Full generation pipeline started (30 FPS, {target_duration})."
        }

    @app.get('/api/dashboard/project/{id}/status')
    def api_get_project_status(id: str):
        server.get_job(id)
        folder = server.DATA / id
        status_file = folder / 'pipeline_status.json'
        status_data = {
            "stage": "idle",
            "progress": 0,
            "state": "idle",
            "error": None
        }
        if status_file.is_file():
            try:
                status_data.update(json.loads(status_file.read_text(encoding='utf-8')))
            except Exception:
                pass

        report_file = folder / 'report.json'
        if report_file.is_file():
            try:
                status_data['report'] = json.loads(report_file.read_text(encoding='utf-8'))
                if status_data['report'].get('elapsed_seconds'):
                    status_data['elapsed_seconds'] = status_data['report']['elapsed_seconds']
            except Exception:
                pass

        # Check job.json for error or status updates
        job_file = folder / 'job.json'
        if job_file.is_file():
            try:
                job_data = json.loads(job_file.read_text(encoding='utf-8'))
                if job_data.get('status') == 'error':
                    status_data['state'] = 'failed'
                    status_data['stage'] = job_data.get('stage') or 'Render failed'
                    status_data['error'] = job_data.get('error') or status_data.get('error') or 'Generation failed'
            except Exception:
                pass

        # Check issues.json if issues not yet loaded
        issues_file = folder / 'issues.json'
        if not status_data.get('issues') and issues_file.is_file():
            try:
                status_data['issues'] = json.loads(issues_file.read_text(encoding='utf-8'))
            except Exception:
                pass

        if (folder / 'output.mp4').is_file():
            status_data['output_url'] = f"/media/{id}/output.mp4"

        if status_data.get('report', {}).get('signed_output_url'):
            status_data['signed_output_url'] = status_data['report']['signed_output_url']

        return status_data

    @app.get('/api/dashboard/tts/voices')
    def api_get_tts_voices():
        from .tts import get_supported_voices, get_license_registry
        return {
            "voices": get_supported_voices(),
            "registry": get_license_registry()
        }

    @app.get('/api/dashboard/tts/preview')
    def api_tts_preview(voice: str = "hm_omega"):
        from fastapi.responses import FileResponse
        from .tts import get_tts_provider, resolve_voice_id
        resolved = resolve_voice_id(voice)
        provider = get_tts_provider("kokoro")
        sample_text = "नमस्ते, यह मोशनक्लोन का नया नेचुरल वॉयस सिस्टम है।" if resolved.startswith("h") else "Hello, welcome to MotionClone Studio."
        preview_dir = server.DATA / 'tts_previews'
        preview_dir.mkdir(parents=True, exist_ok=True)
        out_wav = preview_dir / f"preview_{resolved}.wav"
        if not out_wav.is_file() or out_wav.stat().st_size < 1000:
            provider.synthesize_scene(sample_text, voice_id=resolved, language="hi", output_path=out_wav)
        return FileResponse(out_wav, media_type="audio/wav")
