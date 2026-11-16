"""Phase 10 Item 3 Acceptance Tests: Validated & non-leaky reference deconstruction.

Acceptance:
- Non-leaking test: run deconstruction on a reference video containing distinctive phrases (e.g. 'Acme SuperWidget 3000').
  Assert NONE of those phrases appear anywhere in blueprint.json.
- Resilience test: stub Gemini to return ```json { ... } ``` with a trailing comma on attempt 1,
  assert the retry succeeds and writes valid blueprint.json.
- Audit artifacts saved to job/deconstruct/: keyframes/, evidence.json, raw_response.json, blueprint.json.
"""
import json
import subprocess
import time
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app import ai, dashboard_agent, media, pipeline, server
from app.dashboard_agent import BlueprintShot, BlueprintStructure


def _auth_headers():
    return {'X-Frameforge-Token': server.TOKEN}


@pytest.fixture(autouse=True)
def reset_server_state():
    server.ACTIVE['id'] = None
    yield
    server.ACTIVE['id'] = None


def test_deconstruction_resilience_trailing_comma_retry(tmp_path, monkeypatch):
    """Stub Gemini at SDK boundary to return ```json { ... } ``` with a trailing comma on attempt 1.
    Assert the retry succeeds and writes valid blueprint.json.
    """
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(ai, 'auth_status', lambda: True)

    attempt_counter = {"count": 0}

    # Trailing comma payload inside markdown code fences for attempt 1
    bad_attempt_1 = """```json
{
  "hook_seconds": 3.0,
  "body_seconds": 22.0,
  "cta_seconds": 5.0,
  "total_seconds": 30.0,
  "aspect": "9:16",
  "cuts_per_minute": 24,
  "avg_shot_duration": 2.5,
  "shots": [
    {
      "t_start": 0.0,
      "t_end": 3.0,
      "shot_type": "typography card",
      "camera_motion": "slow zoom in",
      "transition": "cut",
      "visual_purpose": "Hook the viewer with dynamic question",
      "text_overlay_style": "bold typography",
    },
  ],
  "rules": [
    "Hook within 2.5s",
    "Fast paced cuts",
    "Clear visual contrast",
    "Beat-synced transitions",
    "Final CTA card"
  ],
  "voice_tone": "Crisp and engaging",
  "music_mood": "Modern tech upbeat",
}
```"""

    # Valid payload for attempt 2
    clean_attempt_2 = """{
  "hook_seconds": 3.0,
  "body_seconds": 22.0,
  "cta_seconds": 5.0,
  "total_seconds": 30.0,
  "aspect": "9:16",
  "cuts_per_minute": 24,
  "avg_shot_duration": 2.5,
  "shots": [
    {
      "t_start": 0.0,
      "t_end": 3.0,
      "shot_type": "typography card",
      "camera_motion": "slow zoom in",
      "transition": "cut",
      "visual_purpose": "Hook the viewer with dynamic question",
      "text_overlay_style": "bold typography"
    }
  ],
  "rules": [
    "Hook within 2.5s",
    "Fast paced cuts",
    "Clear visual contrast",
    "Beat-synced transitions",
    "Final CTA card"
  ],
  "voice_tone": "Crisp and engaging",
  "music_mood": "Modern tech upbeat"
}"""

    class FakeClient:
        class models:
            @staticmethod
            def generate_content(model, contents, config=None):
                attempt_counter["count"] += 1
                mock_resp = MagicMock()
                if attempt_counter["count"] == 1:
                    mock_resp.text = bad_attempt_1
                else:
                    # Verify that attempt 2 received the validation error in its prompt
                    prompt_str = str(contents[0])
                    assert "Previous response failed schema validation" in prompt_str
                    mock_resp.text = clean_attempt_2
                return mock_resp

    monkeypatch.setattr(dashboard_agent, "get_gemini_client", lambda tier=None: (FakeClient(), "gemini-3.1-pro-preview", "vertex"))

    project_dir = tmp_path / "resilience_job"
    project_dir.mkdir(parents=True, exist_ok=True)

    result = pipeline.step_deconstruct(
        project_dir=project_dir,
        source_video=None,
        brief_notes="Resilience test",
        aspect="9:16"
    )

    # 1. Assert exactly 2 attempts occurred (initial + 1 retry)
    assert attempt_counter["count"] == 2

    # 2. Assert valid blueprint result was returned and written to disk
    assert result["hook_seconds"] == 3.0
    assert (project_dir / "blueprint.json").is_file()
    assert (project_dir / "deconstruct" / "blueprint.json").is_file()
    assert (project_dir / "deconstruct" / "raw_response.json").is_file()

    # Verify content of saved blueprint
    saved_bp = json.loads((project_dir / "blueprint.json").read_text(encoding="utf-8"))
    assert saved_bp["cuts_per_minute"] == 24


def test_deconstruction_non_leaking_and_audit_artifacts(tmp_path, monkeypatch):
    """Run deconstruction on a reference video containing distinctive phrases ('Acme SuperWidget 3000').
    Assert:
    (a) None of those phrases leak into blueprint.json
    (b) Local evidence (keyframes/, evidence.json) and Gemini audit artifacts are saved in deconstruct/
    """
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(ai, 'auth_status', lambda: True)

    # Create real 4s reference video with ffmpeg
    ref_video = tmp_path / "acme_source.mp4"
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=4:size=320x240:rate=10',
        '-pix_fmt', 'yuv420p', '-c:v', 'libx264',
        str(ref_video)
    ], check=True)

    distinctive_phrase = "Acme SuperWidget 3000"

    class FakeClient:
        class models:
            @staticmethod
            def generate_content(model, contents, config=None):
                prompt = contents[0]
                # Assert the prompt strictly includes non-leakage instructions
                assert "Extract ONLY the structure, pacing, scene types, visual compositions, transitions, and motion rhythm" in prompt
                assert "DO NOT copy text, dialogue, company names, product names, or slogans from the reference" in prompt

                # Return valid structural blueprint (clean, with NO reference text)
                clean_blueprint = {
                    "hook_seconds": 2.0,
                    "body_seconds": 23.0,
                    "cta_seconds": 5.0,
                    "total_seconds": 30.0,
                    "aspect": "9:16",
                    "cuts_per_minute": 30,
                    "avg_shot_duration": 2.0,
                    "shots": [
                        {
                            "t_start": 0.0,
                            "t_end": 2.0,
                            "shot_type": "kinetic_text",
                            "camera_motion": "fast zoom punch",
                            "transition": "cut",
                            "visual_purpose": "Stop scroll with high curiosity question",
                            "text_overlay_style": "headline bold"
                        },
                        {
                            "t_start": 2.0,
                            "t_end": 5.0,
                            "shot_type": "fact_card",
                            "camera_motion": "subtle pan right",
                            "transition": "slide-left",
                            "visual_purpose": "State key statistical problem",
                            "text_overlay_style": "minimal stat"
                        }
                    ],
                    "rules": [
                        "Curiosity hook in first 2 seconds",
                        "High contrast typography",
                        "Maintain safe margins 10%",
                        "Fast body transitions",
                        "Actionable end CTA"
                    ],
                    "voice_tone": "Crisp and direct",
                    "music_mood": "Minimalist electronic"
                }
                mock_resp = MagicMock()
                mock_resp.text = json.dumps(clean_blueprint)
                return mock_resp

    monkeypatch.setattr(dashboard_agent, "get_gemini_client", lambda tier=None: (FakeClient(), "gemini-3.1-pro-preview", "vertex"))

    with TestClient(server.app) as client:
        # Create project and upload reference
        c_res = client.post('/api/dashboard/create-project', headers=_auth_headers(), data={'title': 'Acme Deconstruct Test', 'aspect': '9:16'})
        assert c_res.status_code == 200
        job_id = c_res.json()['job_id']
        project_dir = tmp_path / job_id

        # Attach reference video
        with open(ref_video, 'rb') as f:
            ref_res = client.post(f'/api/dashboard/project/{job_id}/reference', headers=_auth_headers(), files={'video': ('source.mp4', f, 'video/mp4')})
        assert ref_res.status_code == 200

        # Trigger deconstruct endpoint
        decon_res = client.post('/api/dashboard/deconstruct', headers=_auth_headers(), json={
            'job_id': job_id,
            'aspect': '9:16',
            'notes': f'Analyze {distinctive_phrase} video structure'
        })
        assert decon_res.status_code == 200
        bp_data = decon_res.json()['blueprint']

        # 1. Assert distinctive phrase does NOT leak anywhere into blueprint
        bp_json_str = json.dumps(bp_data)
        assert distinctive_phrase not in bp_json_str
        assert "Acme" not in bp_json_str
        assert "SuperWidget" not in bp_json_str

        # 2. Check audit artifacts in job/deconstruct/
        decon_dir = project_dir / "deconstruct"
        assert decon_dir.is_dir()
        assert (decon_dir / "evidence.json").is_file()
        assert (decon_dir / "raw_response.json").is_file()
        assert (decon_dir / "blueprint.json").is_file()
        assert (decon_dir / "keyframes").is_dir()

        # Evidence must contain scene cuts and duration
        evidence = json.loads((decon_dir / "evidence.json").read_text(encoding="utf-8"))
        assert "scene_cuts" in evidence
        assert "meta" in evidence

