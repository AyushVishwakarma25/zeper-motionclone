from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_DURATION = 120

# Active 2026 Vertex AI & Generative Model Tiers
MODEL_TIERS = {
    'vision_deconstruct': 'gemini-2.5-flash',
    'qa_gate': 'gemini-2.5-flash',
    'code_synthesis': 'gemini-2.5-flash',
    'image_composite_pro': 'gemini-2.5-flash-image',
    'image_composite_fast': 'gemini-2.5-flash-image',
    'video_motion': 'veo-3.1-generate-001',
    'video_motion_lite': 'veo-3.1-lite',
    'video_motion_seedance': 'seedance-2.5',
}


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


# DOP Camera Motion Presets (Ported from Higgsfield Camera Presets)
class CameraMotion(Strict):
    id: Literal[
        'pan_left', 'pan_right', 'tilt_up', 'tilt_down',
        'zoom_in', 'zoom_out', 'dolly_in', 'dolly_out',
        'pedestal_up', 'pedestal_down', 'truck_left', 'truck_right',
        'roll_clockwise', 'roll_counterclockwise',
        'orbit_left', 'orbit_right', 'crane_up', 'crane_down',
        'handheld', 'fpv_drone'
    ] = 'zoom_in'
    strength: float = Field(default=1.0, ge=0.0, le=10.0)


# 4 Universal Execution Engines
ShotEngineType = Literal[
    'REMOTION_CODE_SCENE',
    'HYBRID_ANNOTATED_SCENE',
    'FFMPEG_SPEAKER_TRACKER',
    'GENERATIVE_I2V_MOTION'
]


# Universal Context Slots supporting Explainers, Medical/Dental Reels, Podcasts, and D2C
class UniversalContextSlots(Strict):
    ref_video: str = Field(default='', description='Reference video URL or local file path')
    source_media: str = Field(default='', description='Source talking head or raw product footage')
    visual_1: str = Field(default='', description='Context asset 1 (e.g. logo, primary packaging, before photo)')
    visual_2: str = Field(default='', description='Context asset 2 (e.g. dashboard screenshot, after photo)')
    visual_3: str = Field(default='', description='Context asset 3 (e.g. product macro, diagram)')
    visual_4: str = Field(default='', description='Context asset 4 (e.g. badge, secondary proof)')
    visual_5: str = Field(default='', description='Context asset 5 (e.g. testimonial, doctor credential)')
    niche_preset: Literal['explainer', 'medical_dental', 'podcast_clip', 'd2c_product'] = 'explainer'


# 10-Category QA Evaluation Gate Schema
class QAEvaluationCategory(Strict):
    pacing_score: float = Field(default=9.5, ge=0.0, le=10.0)
    framing_score: float = Field(default=9.0, ge=0.0, le=10.0)
    text_contrast_score: float = Field(default=9.8, ge=0.0, le=10.0)
    cut_smoothness_score: float = Field(default=9.2, ge=0.0, le=10.0)
    audio_ducking_score: float = Field(default=9.5, ge=0.0, le=10.0)
    brand_consistency_score: float = Field(default=9.6, ge=0.0, le=10.0)
    motion_blur_score: float = Field(default=9.0, ge=0.0, le=10.0)
    temporal_coherence_score: float = Field(default=9.4, ge=0.0, le=10.0)
    artifact_level_score: float = Field(default=9.7, ge=0.0, le=10.0)
    cta_prominence_score: float = Field(default=9.5, ge=0.0, le=10.0)
    overall_score: float = Field(default=9.4, ge=0.0, le=10.0)
    verdict: Literal['PASS', 'WARN', 'FAIL'] = 'PASS'
    critique_notes: list[str] = Field(default_factory=list)


# Universal Shot definition for Katana 4-Engine Workflow
class UniversalShot(Strict):
    id: int
    title: str = Field(default='', max_length=120)
    engine: ShotEngineType = 'REMOTION_CODE_SCENE'
    start_seconds: float = Field(default=0.0, ge=0.0, le=MAX_DURATION)
    duration_seconds: float = Field(default=3.0, ge=0.5, le=30.0)
    headline: str = Field(default='', max_length=200)
    subtitle: str = Field(default='', max_length=300)
    voiceover_script_en: str = Field(default='', max_length=1000)
    voiceover_script_hi: str = Field(default='', max_length=1000)
    assigned_slot: Literal['none', 'visual_1', 'visual_2', 'visual_3', 'visual_4', 'visual_5'] = 'none'
    transition: str = Field(default='cut', max_length=50)
    accent_color: str = Field(default='#00f2fe', pattern=r'^#[0-9a-fA-F]{6}$')
    camera_motions: list[CameraMotion] = Field(default_factory=lambda: [CameraMotion(id='zoom_in', strength=1.0)])
    prompt: str = Field(default='', max_length=1500)
    credit_cost: int = 0
    qa_eval: QAEvaluationCategory = Field(default_factory=QAEvaluationCategory)


class UniversalKatanaPlan(Strict):
    title: str = Field(default='Universal Katana Reference-to-Video Plan', max_length=200)
    aspect: Literal['9:16', '16:9', '1:1'] = '9:16'
    language: Literal['en', 'hi', 'bilingual'] = 'en'
    duration_seconds: float = Field(default=30.0, ge=5.0, le=MAX_DURATION)
    context_slots: UniversalContextSlots = Field(default_factory=UniversalContextSlots)
    music_track_id: str = Field(default='tech_upbeat')
    shots: list[UniversalShot] = Field(default_factory=list)
    total_credits_estimated: int = 0


# ==============================================================================
# Existing Backward-Compatible Models (preserves scripts/*_acceptance.py suite)
# ==============================================================================
class Keyframe(Strict):
    t: float = Field(ge=0, le=MAX_DURATION)
    x: float = Field(default=.1, ge=-2, le=2)
    y: float = Field(default=.4, ge=-2, le=2)
    w: float = Field(default=.8, ge=0.001, le=3)
    h: float = Field(default=.15, ge=0.001, le=3)
    opacity: float = Field(default=1, ge=0, le=1)
    rotation: float = Field(default=0, ge=-360, le=360)
    blur: float = Field(default=0, ge=0, le=30)
    reveal: float = Field(default=1, ge=0, le=1)


class Track(Strict):
    id: str = Field(max_length=80)
    kind: Literal['text','rect','ellipse','line','image','gradient']
    start: float = Field(default=0, ge=0, le=MAX_DURATION)
    end: float = Field(default=5, ge=0.001, le=MAX_DURATION)
    text: str = Field(default='', max_length=500)
    color: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    color2: str = Field(default='#000000', pattern=r'^#[0-9a-fA-F]{6}$')
    font: Literal['sans','serif','mono'] = 'sans'
    weight: Literal['regular','bold'] = 'bold'
    align: Literal['left','center','right'] = 'center'
    size: float = Field(default=.08, ge=0.001, le=1)
    radius: float = Field(default=.02, ge=0, le=1)
    stroke: float = Field(default=0, ge=0, le=.1)
    asset: Literal['logo','none'] = 'none'
    easing: Literal['linear','smooth','out','step'] = 'linear'
    keyframes: list[Keyframe] = Field(default_factory=lambda:[Keyframe(t=0)], min_length=1)

    @model_validator(mode='after')
    def timing(self):
        if self.end <= self.start: raise ValueError('Layer end must be after start.')
        self.keyframes.sort(key=lambda k:k.t)
        return self


class Mask(Strict):
    id: str = Field(max_length=80)
    start: float = Field(ge=0, le=MAX_DURATION)
    end: float = Field(ge=0.001, le=MAX_DURATION)
    method: Literal['gradient','solid','inpaint'] = 'gradient'
    color: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    keyframes: list[Keyframe] = Field(min_length=1)

    @model_validator(mode='after')
    def timing(self):
        if self.end <= self.start: raise ValueError('Mask end must be after start.')
        self.keyframes.sort(key=lambda k:k.t)
        return self


class Plan(Strict):
    title: str = Field(default='Untitled film', max_length=160)
    summary: str = Field(default='', max_length=3000)
    observations: list[str] = Field(default_factory=list)
    background: str = Field(default='#101112', pattern=r'^#[0-9a-fA-F]{6}$')
    masks: list[Mask] = Field(default_factory=list)
    tracks: list[Track] = Field(default_factory=list, min_length=1)


class Brief(Strict):
    brand: str = Field(default='', max_length=120)
    instructions: str = Field(default='', max_length=6000)
    mode: Literal['hyperframes','faithful','adapt','rebuild'] = 'hyperframes'
    accent: str = Field(default='#bcf76a', pattern=r'^#[0-9a-fA-F]{6}$')
    keep_audio: bool = True
    auto_review: bool = True
    sampling: Literal['standard','detailed'] = 'standard'


class LibraryUpdate(Strict):
    name: str = Field(default='', min_length=1, max_length=160)
    favorite: bool = False
    archived: bool = False
    collection: str = Field(default='', max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def clean(self):
        if 'name' in self.model_fields_set:
            self.name=self.name.strip()
            if not self.name:raise ValueError('Name is required.')
        object.__setattr__(self,'tags',list(dict.fromkeys(t.strip() for t in self.tags if t.strip())))
        if any(len(t)>40 for t in self.tags):raise ValueError('Tags must be 40 characters or fewer.')
        object.__setattr__(self,'collection',self.collection.strip())
        return self


class Review(Strict):
    summary: str = Field(max_length=3000)
    observations: list[str] = Field(default_factory=list)
    replace_tracks: list[Track] = Field(default_factory=list)
    replace_masks: list[Mask] = Field(default_factory=list)
    remove_tracks: list[str] = Field(default_factory=list)
    remove_masks: list[str] = Field(default_factory=list)


def apply_review(plan: Plan, review: Review):
    data=plan.model_dump()
    for key in ['tracks','masks']:
        replacements={x.id:x.model_dump() for x in getattr(review,'replace_'+key)}
        removed=set(getattr(review,'remove_'+key))
        items=[]
        for old in data[key]:
            if old['id'] not in removed:items.append(replacements.pop(old['id'],old))
        items.extend(x for id,x in replacements.items() if id not in removed)
        data[key]=items
    data['summary']=review.summary;data['observations']=review.observations
    return Plan.model_validate(data)


def output_schema(model=Plan):
    schema = model.model_json_schema()
    def strict(node):
        if isinstance(node, dict):
            node.pop('default', None)
            if node.get('type') == 'object':
                node['additionalProperties'] = False
                node['required'] = list(node.get('properties', {}))
            for v in node.values(): strict(v)
        elif isinstance(node, list):
            for v in node: strict(v)
    strict(schema)
    return schema
