"""Phase 10 Item 5 Acceptance Tests: Automated Quality Review Loop.

Acceptance:
- Stub Gemini at SDK boundary to return FAIL on scene 2 on pass 1 ('text clipped'), then PASS on pass 2.
- Verify: pass 1 re-renders scene 2, pass 2 succeeds, job ends in ready,
  review/pass_1.json and review/pass_2.json both exist on disk and record the verdicts.
"""
import json
import subprocess
import time
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app import ai, audio, media, pipeline, remotion, review, server
from app.models import Brief, Plan
from app.review import ReviewPassReport, SceneQAResult, SuggestedFix


def _auth_headers():
    return {'X-Frameforge-Token': server.TOKEN}


@pytest.fixture(autouse=True)
def reset_server_state():
    server.ACTIVE['id'] = None
    yield
    server.ACTIVE['id'] = None


def _make_synth_audio(output_path, duration=3.0):
    dest = Path(output_path).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={duration}',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        str(dest)
    ], check=True)
    return dest


def test_quality_review_loop_multi_pass_rerender(tmp_path, monkeypatch):
    """Stub Gemini at SDK boundary to return FAIL on scene 2 on pass 1 ('text clipped'), then PASS on pass 2.
    Asserts:
    (a) Scene 2 fails pass 1 and triggers re-render with suggested fix.
    (b) Pass 2 succeeds with PASS.
    (c) Job ends in ready.
    (d) review/pass_1.json and review/pass_2.json exist on disk with recorded verdicts.
    """
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(ai, 'auth_status', lambda: True)

    # Stub TTS at SDK boundary with real local audio synthesis
    monkeypatch.setattr(audio, 'synthesize_voiceover', lambda text, language='en', output_path=None, is_ssml=False: _make_synth_audio(output_path or tmp_path / 'vo.mp3', duration=2.5))

    pass_counter = {"count": 0}

    pass1_report = ReviewPassReport(
        pass_number=1,
        overall_verdict="FAIL",
        scenes=[
            SceneQAResult(scene_id="s1", verdict="PASS"),
            SceneQAResult(
                scene_id="s2",
                verdict="FAIL",
                reasons=["text clipped by outer margin at 9:16"],
                suggested_fix=SuggestedFix(text_adjust="3x faster")
            )
        ]
    )

    pass2_report = ReviewPassReport(
        pass_number=2,
        overall_verdict="PASS",
        scenes=[
            SceneQAResult(scene_id="s1", verdict="PASS"),
            SceneQAResult(scene_id="s2", verdict="PASS")
        ]
    )

    class FakeGeminiClient:
        class models:
            @staticmethod
            def generate_content(model, contents, config=None):
                pass_counter["count"] += 1
                mock_resp = MagicMock()
                if pass_counter["count"] == 1:
                    mock_resp.text = pass1_report.model_dump_json()
                else:
                    mock_resp.text = pass2_report.model_dump_json()
                return mock_resp

    monkeypatch.setattr(ai, "get_gemini_client", lambda tier=None: (FakeGeminiClient(), "gemini-3.1-pro-preview", "vertex"))

    scene_plan = {
        "aspect": "9:16",
        "duration_seconds": 6.0,
        "scenes": [
            {
                "id": "s1",
                "title": "Hook",
                "template": "kinetic_text",
                "headline": "Make videos fast",
                "duration_seconds": 3.0,
                "voiceover": "Make videos fast."
            },
            {
                "id": "s2",
                "title": "Fact",
                "template": "fact_card",
                "headline": "Three times faster than manual editing",
                "duration_seconds": 3.0,
                "voiceover": "Three times faster."
            }
        ]
    }

    with TestClient(server.app) as client:
        # Create project
        proj = client.post('/api/dashboard/create-project', headers=_auth_headers(), data={'title': 'Review Loop Test', 'aspect': '9:16'})
        assert proj.status_code == 200
        job_id = proj.json()['job_id']
        project_dir = tmp_path / job_id

        (project_dir / 'scene_plan.json').write_text(json.dumps(scene_plan, indent=2), encoding='utf-8')

        # Trigger project generation (which executes step_review_loop in pipeline)
        gen_res = client.post(f'/api/dashboard/project/{job_id}/generate', headers=_auth_headers(), json={
            "brief": "Review Loop Test",
            "aspect": "9:16",
            "use_existing_scene_plan": True,
            "fps": 30
        })
        assert gen_res.status_code == 200

        # Wait for pipeline to finish
        for _ in range(180):
            stat = client.get(f'/api/dashboard/project/{job_id}/status')
            data = stat.json()
            if data.get('state') in ('ready', 'needs_attention', 'failed'):
                break
            time.sleep(1.0)

        # 1. Assert Gemini evaluated 2 passes
        assert pass_counter["count"] == 2

        # 2. Assert pass_1.json and pass_2.json both exist on disk and record the verdicts
        review_dir = project_dir / "review"
        assert review_dir.is_dir()
        p1_file = review_dir / "pass_1.json"
        p2_file = review_dir / "pass_2.json"
        assert p1_file.is_file(), "review/pass_1.json missing"
        assert p2_file.is_file(), "review/pass_2.json missing"

        p1_data = json.loads(p1_file.read_text(encoding='utf-8'))
        p2_data = json.loads(p2_file.read_text(encoding='utf-8'))

        assert p1_data["overall_verdict"] == "FAIL"
        assert any("text clipped" in r for sc in p1_data["scenes"] for r in sc.get("reasons", []))
        assert p2_data["overall_verdict"] == "PASS"

        # 3. Assert job completed with ready
        assert data.get('state') == 'ready', f"Expected ready, got {data.get('state')}: {data.get('issues')}"

        # 4. Assert scene 2 received suggested fix in scene_plan.json
        updated_sp = json.loads((project_dir / "scene_plan.json").read_text(encoding='utf-8'))
        assert updated_sp["scenes"][1]["headline"] == "3x faster"

