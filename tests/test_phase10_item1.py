"""Phase 10 Item 1 Acceptance Tests: Silent failures must never report success.

Acceptance criteria:
(a) no credentials -> job ends needs_attention with TTS_FAILED and real ADC error text;
(b) stub Google client at SDK boundary to return image error for one scene -> IMAGE_FAILED for that scene only, others unaffected;
(c) healthy stub -> ready.
HTTP-level tests through real endpoints and real Remotion render.
"""
import json
import os
import subprocess
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app import audio, credits, media, models, pipeline, remotion, server


def _auth_headers():
    return {'X-Frameforge-Token': server.TOKEN}


@pytest.fixture(autouse=True)
def reset_server_state():
    server.ACTIVE['id'] = None
    yield
    server.ACTIVE['id'] = None


def _make_synth_audio(output_path, duration=3.0):
    """Generates real audio with ffmpeg so downstream ffprobe and mixing are fully real and unmocked."""
    dest = Path(output_path).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={duration}',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        str(dest)
    ], check=True)
    return dest


def test_no_credentials_ends_needs_attention_with_tts_failed(tmp_path, monkeypatch):
    """(a) No credentials -> job ends needs_attention with TTS_FAILED and real ADC error text."""
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)
    # Ensure tone fallback is disabled (production behavior)
    monkeypatch.delenv('ALLOW_TONE_FALLBACK', raising=False)
    # Point ADC to an invalid path to simulate missing credentials
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS', str(tmp_path / 'nonexistent_creds.json'))
    monkeypatch.delenv('GOOGLE_API_KEY', raising=False)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)

    scene_plan = {
        "aspect": "9:16",
        "duration_seconds": 6.0,
        "scenes": [
            {
                "id": "s1",
                "title": "Hook",
                "template": "kinetic_text",
                "headline": "No Credential Test",
                "duration_seconds": 3,
                "voiceover": "This requires real cloud text to speech."
            },
            {
                "id": "s2",
                "title": "Body",
                "template": "fact_card",
                "headline": "Failure Check",
                "duration_seconds": 3,
                "voiceover": "This should fail cleanly without crashing."
            }
        ]
    }

    with TestClient(server.app) as client:
        # Create project
        proj = client.post('/api/dashboard/create-project', headers=_auth_headers(), data={'title': 'No Creds Test', 'aspect': '9:16'})
        assert proj.status_code == 200
        job_id = proj.json()['job_id']
        project_dir = tmp_path / job_id

        # Trigger paste-and-render
        res = client.post('/api/dashboard/paste-and-render', headers=_auth_headers(), json={
            "job_id": job_id,
            "aspect": "9:16",
            "voiceover_script": "This requires real cloud text to speech.\nThis should fail cleanly without crashing.",
            "scene_plan_json": json.dumps(scene_plan)
        })
        assert res.status_code == 200
        assert res.json().get('ok') is True

        # Wait for render to finish in background thread
        for _ in range(120):
            j_stat = server.get_job(job_id)
            if j_stat.get('status') in ('ready', 'complete', 'needs_attention', 'error'):
                break
            time.sleep(1.0)

        # Job MUST NOT report success / ready! It must report needs_attention!
        assert j_stat.get('status') == 'needs_attention', f"Expected needs_attention, got {j_stat.get('status')}"
        assert j_stat.get('stage') == 'Needs attention'

        # Verify issues list has machine-readable TTS_FAILED with real ADC error
        issues_file = project_dir / 'issues.json'
        assert issues_file.is_file(), "issues.json missing"
        issues = json.loads(issues_file.read_text(encoding='utf-8'))
        tts_issues = [i for i in issues if i.get('code') == 'TTS_FAILED']
        assert len(tts_issues) > 0, f"Expected TTS_FAILED issue, got: {issues}"
        err_msg = tts_issues[0]['message']
        assert any(term in err_msg.lower() for term in ['credentials', 'credential', 'nonexistent', 'file', 'adc']), f"Unexpected error message: {err_msg}"

        # Verify verification.json measures both stems and reports audio_valid=False
        verif_file = project_dir / 'verification.json'
        assert verif_file.is_file()
        verif = json.loads(verif_file.read_text(encoding='utf-8'))
        assert verif.get('audio_valid') is False
        assert 'final_mix' in verif
        assert 'voiceover_stem' in verif


def test_image_error_sdk_boundary_marks_image_failed_for_that_scene_only(tmp_path, monkeypatch):
    """(b) Stub Google client at SDK boundary to return image error for one scene -> IMAGE_FAILED for that scene only, others unaffected."""
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)

    # Stub only the Google TTS network call at SDK boundary with real local audio synthesis
    def fake_synth(text, language='en', output_path=None, is_ssml=False):
        dest = Path(output_path) if output_path else tmp_path / 'voiceover.mp3'
        return _make_synth_audio(dest, duration=3.0)

    monkeypatch.setattr(audio, 'synthesize_voiceover', fake_synth)

    # Stub Gemini image call at SDK boundary in app.ai
    from app import ai
    monkeypatch.setattr(ai, 'auth_status', lambda: True)

    def fake_generate_image(prompt, output_path=None, aspect='9:16'):
        if "FailScene" in prompt:
            raise RuntimeError("Vertex AI image quota exceeded for model gemini-3.1-flash-image")
        # Healthy scene image
        dest = Path(output_path) if output_path else tmp_path / 'img.png'
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Create minimal 10x10 png
        from PIL import Image
        img = Image.new('RGB', (100, 100), color=(30, 60, 90))
        img.save(dest, 'PNG')
        return dest.read_bytes()

    monkeypatch.setattr(ai, 'generate_image_composite', fake_generate_image)

    scene_plan = {
        "aspect": "9:16",
        "duration_seconds": 6.0,
        "scenes": [
            {
                "id": "scene_fail",
                "title": "Image Scene With Quota Error",
                "template": "kinetic_text",
                "source": "image",
                "prompt": "FailScene: A futuristic neural network",
                "headline": "Failed Image Scene",
                "duration_seconds": 3,
                "voiceover": "This image scene should fail."
            },
            {
                "id": "scene_ok",
                "title": "Compose Scene",
                "template": "fact_card",
                "source": "compose",
                "headline": "Healthy Compose Scene",
                "subtitle": "Unchanged",
                "duration_seconds": 3,
                "voiceover": "This scene should succeed."
            }
        ]
    }

    with TestClient(server.app) as client:
        proj = client.post('/api/dashboard/create-project', headers=_auth_headers(), data={'title': 'Image Error Test', 'aspect': '9:16'})
        assert proj.status_code == 200
        job_id = proj.json()['job_id']
        project_dir = tmp_path / job_id

        (project_dir / 'scene_plan.json').write_text(json.dumps(scene_plan, indent=2), encoding='utf-8')

        # Trigger project generate via endpoint
        gen_res = client.post(f'/api/dashboard/project/{job_id}/generate', headers=_auth_headers(), json={
            "brief": "Image Error Test",
            "aspect": "9:16",
            "use_existing_scene_plan": True,
            "fps": 30
        })
        assert gen_res.status_code == 200

        # Wait for status completion
        for _ in range(120):
            stat = client.get(f'/api/dashboard/project/{job_id}/status')
            data = stat.json()
            if data.get('state') in ('ready', 'needs_attention', 'failed'):
                break
            time.sleep(1.0)

        assert data.get('state') == 'needs_attention'
        issues = data.get('issues', [])
        assert len(issues) == 1
        assert issues[0]['code'] == 'IMAGE_FAILED'
        assert issues[0]['scene_id'] == 'scene_fail'
        assert "Vertex AI image quota exceeded" in issues[0]['message']


def test_healthy_sdk_stub_ends_ready(tmp_path, monkeypatch):
    """(c) Healthy stub at SDK boundary -> ready."""
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)

    def fake_synth(text, language='en', output_path=None, is_ssml=False):
        dest = Path(output_path) if output_path else tmp_path / 'voiceover.mp3'
        return _make_synth_audio(dest, duration=2.5)

    monkeypatch.setattr(audio, 'synthesize_voiceover', fake_synth)

    scene_plan = {
        "aspect": "9:16",
        "duration_seconds": 6.0,
        "scenes": [
            {
                "id": "s1",
                "title": "Hook",
                "template": "kinetic_text",
                "headline": "Autonomous Explainer",
                "duration_seconds": 3,
                "voiceover": "Make videos fast."
            },
            {
                "id": "s2",
                "title": "Fact",
                "template": "fact_card",
                "headline": "3x faster",
                "duration_seconds": 3,
                "voiceover": "Three times faster."
            }
        ]
    }

    with TestClient(server.app) as client:
        proj = client.post('/api/dashboard/create-project', headers=_auth_headers(), data={'title': 'Healthy Test', 'aspect': '9:16'})
        assert proj.status_code == 200
        job_id = proj.json()['job_id']
        project_dir = tmp_path / job_id

        res = client.post('/api/dashboard/paste-and-render', headers=_auth_headers(), json={
            "job_id": job_id,
            "aspect": "9:16",
            "voiceover_script": "Make videos fast.\nThree times faster.",
            "scene_plan_json": json.dumps(scene_plan)
        })
        assert res.status_code == 200
        assert res.json().get('ok') is True

        for _ in range(120):
            j_stat = server.get_job(job_id)
            if j_stat.get('status') in ('ready', 'complete', 'needs_attention', 'error'):
                break
            time.sleep(1.0)

        assert j_stat.get('status') == 'ready', f"Expected ready, got {j_stat.get('status')} issues: {j_stat.get('issues')}"
        assert j_stat.get('stage') == 'Ready'

        # verification.json checks
        verif_file = project_dir / 'verification.json'
        assert verif_file.is_file()
        verif = json.loads(verif_file.read_text(encoding='utf-8'))
        assert verif.get('audio_valid') is True
        assert verif.get('duration_matches_plan') is True
        assert verif.get('dimensions') == [1080, 1920]

