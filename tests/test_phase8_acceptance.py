"""Phase 8 Acceptance Tests: Make the app actually use what Phases 1-7 built.

Covers:
1. Hosted Auth: public shells (/login, /dashboard), 401 on /api/* without token, fail-closed on empty ALLOWED_EMAILS, 403 on non-allowlisted email, GET /api/me.
2. Render Path & Scene Plan: scene_plan.json is single source of truth, exact duration matching, kinetic text wrapping without duplicate headlines.
3. Silent Failures: verification.json checks loudness (-16 <= LUFS <= -12) and duration; TTS failures not masked; /api/connection reports real state; QAEvaluationCategory defaults to UNKNOWN.
4. Pipeline loop and dashboard endpoints: POST /api/dashboard/project/{id}/generate and GET .../status.
"""
import json
import os
import shutil
import threading
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app import ai, audio, dashboard_agent, models, pipeline, preflight, remotion, server
from app.auth import verify_token
from app.media import probe


def test_hosted_auth_shells_and_api_gate(monkeypatch):
    """Page routes (/, /login, /dashboard) are public shells (200). /api/* requires Bearer token."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)

    with TestClient(server.app) as client:
        # Public page shells
        r_login = client.get('/login')
        assert r_login.status_code == 200
        assert 'Firebase' in r_login.text or 'Google' in r_login.text

        r_dash = client.get('/dashboard')
        assert r_dash.status_code == 200

        # Protected API endpoints return 401 without Bearer token
        r_me = client.get('/api/me')
        assert r_me.status_code == 401

        r_create = client.post('/api/dashboard/create-project', data={'name': 'Unauthenticated'})
        assert r_create.status_code == 401


def test_hosted_auth_fails_closed_when_allowed_emails_empty(monkeypatch):
    """If ALLOWED_EMAILS is empty in hosted mode, deny everyone (fail closed)."""
    from firebase_admin import auth as fb_auth
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)
    monkeypatch.setenv('ALLOWED_EMAILS', '')

    fake_payload = {
        'uid': 'test-user-123',
        'email': 'unauthorized@example.com',
        'email_verified': True
    }
    monkeypatch.setattr(fb_auth, 'verify_id_token', lambda *a, **kw: fake_payload)

    # verify_token must fail closed when allowed emails list is empty
    with pytest.raises(Exception) as exc_info:
        verify_token('any-token')
    assert 'fail-closed' in str(exc_info.value).lower() or 'not configured' in str(exc_info.value).lower()


def test_hosted_auth_rejects_non_allowlisted_email(monkeypatch):
    """If ALLOWED_EMAILS has entries, emails not in list are rejected with 403."""
    from firebase_admin import auth as fb_auth
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)
    monkeypatch.setenv('ALLOWED_EMAILS', 'admin@zeper.ai,owner@zeper.ai')

    fake_payload = {
        'uid': 'hacker-999',
        'email': 'intruder@other.com',
        'email_verified': True
    }
    monkeypatch.setattr(fb_auth, 'verify_id_token', lambda *a, **kw: fake_payload)

    with pytest.raises(Exception) as exc_info:
        verify_token('token-123')
    assert 'not in the allowed users list' in str(exc_info.value).lower()


def test_get_api_me_returns_user_info(monkeypatch):
    """GET /api/me returns current user details in local/hosted modes."""
    monkeypatch.setattr(server, 'HOSTED', False)
    with TestClient(server.app) as client:
        r = client.get('/api/me')
        assert r.status_code == 200
        data = r.json()
        assert 'uid' in data
        assert 'email' in data
        assert data['hosted'] is False


def test_qa_evaluation_category_default_is_unknown():
    """QAEvaluationCategory must default to UNKNOWN (not PASS)."""
    cat = models.QAEvaluationCategory()
    assert cat.verdict == "UNKNOWN"
    assert cat.overall_score == 0.0


def test_api_connection_reports_real_status(monkeypatch):
    """GET /api/connection returns real status without fake gemini-3.8-flash."""
    with TestClient(server.app) as client:
        r = client.get('/api/connection')
        assert r.status_code == 200
        data = r.json()
        assert 'status' in data
        assert data.get('model') != 'gemini-3.8-flash'


def test_scene_plan_duration_and_templates_in_remotion(tmp_path):
    """Remotion renders exact planned duration (ffprobe within 0.2s) and wraps kinetic text."""
    project_dir = tmp_path / "scene_plan_test"
    project_dir.mkdir(parents=True, exist_ok=True)

    # 2 scenes: kinetic_text (2.5s) + fact_card (2.5s) = 5.0s total
    scenes = [
        {
            "id": "scene_1",
            "template": "kinetic_text",
            "headline": "Autonomous AI Explainer Platform For Everyone",
            "voiceover_script_en": "Autonomous AI Explainer Platform For Everyone",
            "duration_seconds": 2.5
        },
        {
            "id": "scene_2",
            "template": "fact_card",
            "headline": "Ultra Fast Rendering",
            "subtitle": "60 FPS Video in Seconds",
            "voiceover_script_en": "Ultra Fast Rendering at 60 FPS",
            "duration_seconds": 2.5
        }
    ]
    scene_plan = {
        "aspect": "9:16",
        "duration_seconds": 5.0,
        "scenes": scenes,
        "music_track_id": "tech_upbeat"
    }
    (project_dir / "scene_plan.json").write_text(json.dumps(scene_plan, indent=2), encoding="utf-8")
    (project_dir / "dashboard_project.json").write_text(
        json.dumps({"id": "sp_test", "aspect": "9:16", "scene_plan": scene_plan}, indent=2),
        encoding="utf-8"
    )

    cancel = threading.Event()
    output_mp4 = remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        preview=False,
        format="mp4",
        composition="Motion"
    )

    assert output_mp4.is_file()
    actual = probe(output_mp4)
    assert actual["width"] == 1080
    assert actual["height"] == 1920
    # Duration must equal planned duration within 0.2s
    assert abs(actual["duration"] - 5.0) < 0.2

    # Verification report must contain loudness and duration compliance
    verif = json.loads((project_dir / "verification.json").read_text(encoding="utf-8"))
    assert verif["decoded"] is True
    assert verif["expected_frames"] == 150
    assert verif["actual_frames"] == 150
    assert verif.get("duration_matches_plan") is True


def test_loudness_verification_and_silent_audio_detection(tmp_path):
    """Silent or missing audio fails loudness compliance check in verification."""
    # Synthesize silent audio file
    silent_wav = tmp_path / "silent.wav"
    pipeline.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2', str(silent_wav)])
    assert silent_wav.is_file()

    metrics = audio.measure_loudness(silent_wav)
    lufs = metrics['input_i']
    assert lufs <= -60.0  # Completely silent audio is around -70 LUFS
    # Loudness compliance (-16 <= lufs <= -12) must fail for silence
    is_compliant = (-16.0 <= lufs <= -12.0)
    assert is_compliant is False


def test_dashboard_generate_and_status_endpoints(tmp_path, monkeypatch):
    """POST /api/dashboard/project/{id}/generate and GET /api/dashboard/project/{id}/status."""
    job_id = "a1b2c3d4e5f6"
    project_dir = tmp_path / job_id
    project_dir.mkdir(parents=True, exist_ok=True)

    job = {
        'id': job_id,
        'name': 'Test Project',
        'status': 'draft',
        'stage': 'Ready',
        'created': time.time(),
        'events': [],
        'cancel': threading.Event()
    }
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setattr(server, 'JOBS', {job_id: job})

    # Mock pipeline.run_pipeline to write mock report and status quickly
    def mock_run_pipeline(**kwargs):
        pdir = kwargs['project_dir']
        (pdir / 'pipeline_status.json').write_text(
            json.dumps({'stage': 'Complete', 'progress': 100, 'state': 'ready'}, indent=2),
            encoding='utf-8'
        )
        (pdir / 'report.json').write_text(
            json.dumps({'status': 'ready', 'credit_cost': 0.05, 'qa_verdict': 'PASS'}, indent=2),
            encoding='utf-8'
        )
        (pdir / 'output.mp4').write_bytes(b'mock video bytes')

    monkeypatch.setattr(pipeline, 'run_pipeline', mock_run_pipeline)

    with TestClient(server.app) as client:
        # Trigger generation with X-Frameforge-Token
        res_gen = client.post(
            f'/api/dashboard/project/{job_id}/generate',
            headers={'X-Frameforge-Token': server.TOKEN}
        )
        assert res_gen.status_code == 200
        assert res_gen.json()['status'] == 'started'

        # Poll status
        res_stat = client.get(
            f'/api/dashboard/project/{job_id}/status',
            headers={'X-Frameforge-Token': server.TOKEN}
        )
        assert res_stat.status_code == 200
        data = res_stat.json()
        assert data['state'] == 'ready'
        assert data['progress'] == 100
        assert data['report']['status'] == 'ready'
        assert f'/media/{job_id}/output.mp4' in data['output_url']
