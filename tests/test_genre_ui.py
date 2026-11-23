import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.server import app
from app import server

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch, tmp_path):
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setattr(server, 'ACTIVE', {'id': None})
    yield

@pytest.fixture
def headers():
    return {'X-Frameforge-Token': server.TOKEN}

def test_style_selector_present_in_dashboard(headers):
    """UI check 1: Style selector (Auto, Science explainer, Icon explainer) present in dashboard DOM."""
    res = client.get("/dashboard", headers=headers)
    assert res.status_code == 200
    html = res.text

    # Style selector segmented control
    assert 'id="style-control-group"' in html
    assert 'class="segmented-control style-control-group"' in html
    assert 'data-style="auto"' in html
    assert 'data-style="science"' in html
    assert 'data-style="icon"' in html

    # Genre voiceover card & upload dropzone
    assert 'id="genre-voiceover-card"' in html
    assert 'id="genre-beats-container"' in html
    assert 'id="genre-upload-dropzone"' in html
    assert 'id="genre-voiceover-file-input"' in html
    assert 'id="genre-feedback-banner"' in html


def test_science_mode_calls_genre_plan_then_voiceover_upload_then_generate(headers, tmp_path, monkeypatch):
    """UI check 2: Science mode calls genre-plan, then voiceover-upload, then generate in that order."""
    # 1. Create a project
    create_res = client.post("/api/dashboard/create-project", data={"name": "Science UI Test"}, headers=headers)
    assert create_res.status_code == 200
    job_id = create_res.json()["job_id"]
    folder = server.DATA / job_id

    # Order check: calling voiceover-upload before genre-plan MUST fail with 409
    dummy_wav = tmp_path / "voice.wav"
    import wave
    with wave.open(str(dummy_wav), 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b'\x00\x00' * 22050 * 2)

    with open(dummy_wav, "rb") as f:
        early_upload = client.post(
            f"/api/dashboard/project/{job_id}/voiceover-upload",
            files={"file": ("voice.wav", f, "audio/wav")},
            headers=headers
        )
    assert early_upload.status_code == 409
    assert "Run genre-plan first" in early_upload.json()["detail"]

    # Step 1: Call genre-plan (mock LLM to return valid science plan without network)
    from app.science_director import SciencePlan, ScienceBeat, Slot
    mock_plan = SciencePlan(
        beats=[
            ScienceBeat(id=1, text="Action games sharpen your reflexes.", layout="single", slots=[Slot(kind="person", variant="gamer", talking=True)]),
            ScienceBeat(id=2, text="The brain focuses on targets.", layout="single", slots=[Slot(kind="brain", variant="glow")])
        ]
    )

    from app import layered_pipeline
    monkeypatch.setattr(layered_pipeline, "gemini_llm", lambda: lambda prompt, schema: mock_plan.model_dump_json())

    plan_res = client.post(
        f"/api/dashboard/project/{job_id}/genre-plan",
        json={"genre": "science", "topic": "Action games and visual attention", "language": "english", "seconds": 6},
        headers=headers
    )
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert plan_data["ok"] is True
    assert plan_data["scenes"] == 2
    assert (folder / "scene_plan.json").is_file()

    # Step 2: Call voiceover-upload now that genre-plan has succeeded
    with open(dummy_wav, "rb") as f:
        upload_res = client.post(
            f"/api/dashboard/project/{job_id}/voiceover-upload",
            files={"file": ("voice.wav", f, "audio/wav")},
            headers=headers
        )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert "confidence" in upload_data
    assert (folder / "voiceover_upload.mp3").is_file()
    assert (folder / "voiceover.mp3").is_file()

    # Step 3: Call generate with use_existing_scene_plan=true
    gen_called = []
    def mock_run_pipeline(*args, **kwargs):
        gen_called.append(kwargs)
        return {"output_url": f"/media/{job_id}/output.mp4"}

    from app import pipeline
    monkeypatch.setattr(pipeline, "run_pipeline", mock_run_pipeline)

    gen_res = client.post(
        f"/api/dashboard/project/{job_id}/generate",
        json={
            "brief": "Science UI Test",
            "aspect": "9:16",
            "duration": "30s",
            "use_existing_scene_plan": True,
            "fps": 30
        },
        headers=headers
    )
    assert gen_res.status_code == 200
    assert gen_res.json()["status"] == "started"
