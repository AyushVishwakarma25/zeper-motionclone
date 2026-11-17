"""Acceptance tests for Phase 2: Crashing Endpoints.
Covers every route in app/dashboard_routes.py with happy path, missing project,
bad body, and domain error handling. Verifies zero bare 500 responses.
"""
import io
import json
import pytest
from fastapi.testclient import TestClient

import app.server as server
import app.ai as ai
import app.dashboard_agent as agent
from app.dashboard_routes import (
    DomainError,
    GeminiNotConfiguredError,
    UpstreamAIError,
)


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


@pytest.fixture
def sample_project(headers):
    with TestClient(server.app) as client:
        res = client.post('/api/dashboard/create-project', data={'name': 'Phase 2 Test Project'}, headers=headers)
        assert res.status_code == 200
        return res.json()['job_id']


# --- 1. /preflight-estimate ---
def test_preflight_estimate_standalone(headers):
    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/preflight-estimate',
            json={'engine_type': 'REMOTION_CODE_SCENE', 'duration_sec': 10.0},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data['is_free'] is True
        assert data['credits_required'] == 0


def test_preflight_estimate_with_project_scene_plan(sample_project, headers):
    folder = server.DATA / sample_project
    scene_plan = {
        "title": "Saved Scene Plan",
        "aspect": "9:16",
        "duration_seconds": 30.0,
        "scenes": [
            {"id": 1, "title": "Hook", "template": "kinetic_text", "start_seconds": 0.0, "duration_seconds": 3.0, "headline": "Hook headline"},
            {"id": 2, "title": "Demo", "template": "dashboard_3d_float", "start_seconds": 3.0, "duration_seconds": 27.0, "headline": "Demo headline"}
        ]
    }
    (folder / 'scene_plan.json').write_text(json.dumps(scene_plan), encoding='utf-8')

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/preflight-estimate',
            json={'job_id': sample_project, 'engine_type': 'REMOTION_CODE_SCENE'},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data['job_id'] == sample_project
        assert data['total_credits'] == 0
        assert len(data['breakdown']) == 2


def test_preflight_estimate_bad_body(headers):
    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/preflight-estimate',
            json={'duration_sec': 'not-a-number'},
            headers=headers
        )
        assert res.status_code == 422


# --- 2. /music-library ---
def test_music_library():
    with TestClient(server.app) as client:
        res = client.get('/api/dashboard/music-library')
        assert res.status_code == 200
        data = res.json()
        assert 'tracks' in data
        assert 'aspect_ratios' in data
        assert len(data['tracks']) > 0


# --- 3. /project/{id} (side-effect free) ---
def test_get_project_side_effect_free(sample_project):
    folder = server.DATA / sample_project
    assets_dir = folder / 'assets'
    assets_dir.mkdir(parents=True, exist_ok=True)
    fake_video = assets_dir / 'WhatsApp_Video.mp4'
    fake_video.write_bytes(b"dummy video data exceeding 10kb " * 500)

    source_path = folder / 'source.mp4'
    assert not source_path.exists()

    with TestClient(server.app) as client:
        res = client.get(f'/api/dashboard/project/{sample_project}')
        assert res.status_code == 200
        data = res.json()
        assert data['job_id'] == sample_project

        # Crucial acceptance check: GET /project/{id} MUST NOT copy file or generate thumbnail
        assert not source_path.exists()
        assert not (folder / 'thumbnail.jpg').exists()


def test_get_project_missing():
    with TestClient(server.app) as client:
        res = client.get('/api/dashboard/project/000000000000')
        assert res.status_code == 404
        assert res.status_code != 500


# --- 4. /chat ---
def test_chat_happy_path(monkeypatch, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(
        agent,
        'process_dashboard_chat_turn',
        lambda message, history, project_state: {'reply': 'Mocked assistant reply', 'action': 'none'}
    )

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/chat',
            json={'message': 'Hello AI director'},
            headers=headers
        )
        assert res.status_code == 200
        assert res.json().get('reply') == 'Mocked assistant reply'


def test_chat_missing_gemini_config(monkeypatch, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: False)

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/chat',
            json={'message': 'Create a video'},
            headers=headers
        )
        assert res.status_code == 400
        body = res.json()
        assert body['code'] == 'GEMINI_NOT_CONFIGURED'
        assert 'hint' in body


# --- 5. /blueprint ---
def test_blueprint_happy_path(monkeypatch, sample_project, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    mock_bp = agent.BlueprintStructure(
        hook_seconds=3.0,
        body_seconds=22.0,
        cta_seconds=5.0,
        total_seconds=30.0,
        shots=[]
    )
    monkeypatch.setattr(agent, 'generate_blueprint_from_reference', lambda **kwargs: mock_bp)

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/blueprint',
            json={'job_id': sample_project, 'aspect': '9:16'},
            headers=headers
        )
        assert res.status_code == 200
        assert res.json()['ok'] is True
        assert (server.DATA / sample_project / 'blueprint.json').is_file()


def test_blueprint_missing_project(headers):
    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/blueprint',
            json={'job_id': '000000000000'},
            headers=headers
        )
        assert res.status_code == 404
        assert res.status_code != 500


def test_blueprint_missing_gemini(monkeypatch, sample_project, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: False)
    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/blueprint',
            json={'job_id': sample_project},
            headers=headers
        )
        assert res.status_code == 400
        assert res.json()['code'] == 'GEMINI_NOT_CONFIGURED'


def test_blueprint_upstream_ai_failure(monkeypatch, sample_project, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: True)

    def mock_fail(**kwargs):
        raise RuntimeError("Upstream Vertex AI Quota Exceeded 429")

    monkeypatch.setattr(agent, 'generate_blueprint_from_reference', mock_fail)

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/blueprint',
            json={'job_id': sample_project},
            headers=headers
        )
        assert res.status_code == 502
        assert res.json()['code'] == 'UPSTREAM_AI_ERROR'


# --- 6. /scene-plan ---
def test_scene_plan_happy_path(monkeypatch, sample_project, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    folder = server.DATA / sample_project
    bp = agent.BlueprintStructure(hook_seconds=3.0, body_seconds=22.0, cta_seconds=5.0, total_seconds=30.0)
    (folder / 'blueprint.json').write_text(bp.model_dump_json(), encoding='utf-8')

    mock_plan = agent.ExplainerScenePlan(
        title="AI Explainer",
        duration_seconds=30.0,
        scenes=[
            agent.SceneItem(id=1, title="Hook", headline="Hook headline", start_seconds=0.0, duration_seconds=5.0)
        ]
    )
    monkeypatch.setattr(agent, 'generate_scene_plan', lambda **kwargs: mock_plan)

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/scene-plan',
            json={'job_id': sample_project, 'user_story': 'A story about AI'},
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data['ok'] is True
        assert len(data['scene_plan']['scenes']) == 1


def test_scene_plan_missing_blueprint(monkeypatch, sample_project, headers):
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/scene-plan',
            json={'job_id': sample_project, 'user_story': 'Test'},
            headers=headers
        )
        assert res.status_code == 400
        assert "blueprint" in res.json()['detail'].lower()


# --- 7. /scenes/update ---
def test_scene_update_by_id_and_shot_index(sample_project, headers):
    folder = server.DATA / sample_project
    initial_plan = agent.ExplainerScenePlan(
        title="Test Plan",
        duration_seconds=30.0,
        scenes=[
            agent.SceneItem(id=101, title="Original Hook", headline="Old Headline", start_seconds=0.0, duration_seconds=5.0),
            agent.SceneItem(id=102, title="Original Body", headline="Old Body", start_seconds=5.0, duration_seconds=25.0),
        ]
    )
    (folder / 'scene_plan.json').write_text(initial_plan.model_dump_json(), encoding='utf-8')

    with TestClient(server.app) as client:
        # 1. Update by ID
        res_id = client.post(
            '/api/dashboard/scenes/update',
            json={
                'job_id': sample_project,
                'id': 101,
                'title': 'Updated Hook Title',
                'scene': {'headline': 'New Awesome Headline', 'duration_seconds': 6.0}
            },
            headers=headers
        )
        assert res_id.status_code == 200
        updated = res_id.json()['updated_scene']
        assert updated['id'] == 101
        assert updated['title'] == 'Updated Hook Title'
        assert updated['headline'] == 'New Awesome Headline'

        # 2. Update by shot_index fallback (shot_index=2 -> targets second scene, id 102)
        res_idx = client.post(
            '/api/dashboard/scenes/update',
            json={
                'job_id': sample_project,
                'shot_index': 2,
                'title': 'Updated Body Title'
            },
            headers=headers
        )
        assert res_idx.status_code == 200
        assert res_idx.json()['updated_scene']['id'] == 102
        assert res_idx.json()['updated_scene']['title'] == 'Updated Body Title'


def test_scene_update_not_found(sample_project, headers):
    folder = server.DATA / sample_project
    initial_plan = agent.ExplainerScenePlan(
        title="Test Plan",
        duration_seconds=10.0,
        scenes=[agent.SceneItem(id=1, title="Shot 1", headline="H", start_seconds=0.0, duration_seconds=10.0)]
    )
    (folder / 'scene_plan.json').write_text(initial_plan.model_dump_json(), encoding='utf-8')

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/scenes/update',
            json={'job_id': sample_project, 'id': 9999},
            headers=headers
        )
        assert res.status_code == 404
        assert "not found" in res.json()['detail'].lower()


# --- 8. /project/{id}/save ---
def test_save_project_valid_pydantic_schema(sample_project, headers):
    valid_scene_plan = {
        "title": "Valid Plan",
        "aspect": "9:16",
        "duration_seconds": 30.0,
        "scenes": [
            {
                "id": 1,
                "title": "Scene 1",
                "template": "kinetic_text",
                "start_seconds": 0.0,
                "duration_seconds": 5.0,
                "headline": "Punchy Headline"
            }
        ]
    }
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/project/{sample_project}/save',
            json={'name': 'Updated Project', 'scene_plan': valid_scene_plan},
            headers=headers
        )
        assert res.status_code == 200
        assert res.json()['ok'] is True
        assert (server.DATA / sample_project / 'scene_plan.json').is_file()


def test_save_project_invalid_schema_returns_422(sample_project, headers):
    invalid_payload = {
        "scene_plan": {
            "title": "Broken Plan",
            "duration_seconds": "not-a-number",
            "scenes": "should-be-a-list"
        }
    }
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/project/{sample_project}/save',
            json=invalid_payload,
            headers=headers
        )
        assert res.status_code == 422
        assert isinstance(res.json()['detail'], list)


# --- 9. /project/{id}/reference ---
def test_attach_reference_video(sample_project, headers):
    fake_video = io.BytesIO(b"dummy mp4 bytes for testing " * 1000)
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/project/{sample_project}/reference',
            files={'video': ('source.mp4', fake_video, 'video/mp4')},
            headers=headers
        )
        assert res.status_code == 200
        assert res.json()['ok'] is True
        assert (server.DATA / sample_project / 'source.mp4').is_file()


def test_attach_reference_bad_extension(sample_project, headers):
    bad_file = io.BytesIO(b"executable payload")
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/project/{sample_project}/reference',
            files={'video': ('malicious.exe', bad_file, 'application/x-msdownload')},
            headers=headers
        )
        assert res.status_code == 400
        assert "not permitted" in res.json()['detail']


def test_attach_reference_empty_body(sample_project, headers):
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/project/{sample_project}/reference',
            data={'url': ''},
            headers=headers
        )
        assert res.status_code == 400


# --- 10. /upload-custom-music/{id} ---
def test_upload_custom_music(sample_project, headers):
    fake_audio = io.BytesIO(b"mock audio bytes")
    with TestClient(server.app) as client:
        res = client.post(
            f'/api/dashboard/upload-custom-music/{sample_project}',
            files={'file': ('track.mp3', fake_audio, 'audio/mpeg')},
            headers=headers
        )
        assert res.status_code == 200
        assert res.json()['ok'] is True


# --- 11. /paste-and-render ---
def test_paste_and_render(monkeypatch, sample_project, headers):
    import app.rebrand as rebrand
    monkeypatch.setattr(rebrand, 'trigger_remotion_render', lambda job_id, format, composition: {'pid': 1234})

    with TestClient(server.app) as client:
        res = client.post(
            '/api/dashboard/paste-and-render',
            json={
                'job_id': sample_project,
                'jsx_code': 'export const Motion = () => <div/>;',
                'voiceover_script': 'Welcome to the future of AI video.'
            },
            headers=headers
        )
        assert res.status_code == 200
        assert res.json()['ok'] is True


# --- 12. Structured Error Handling (Zero Bare 500s) ---
def test_unhandled_route_error_returns_structured_500(monkeypatch, headers):
    def boom(id):
        raise RuntimeError("Unexpected internal database crash")

    monkeypatch.setattr(server, 'get_job', boom)

    with TestClient(server.app) as client:
        res = client.get('/api/dashboard/project/123456789012')
        assert res.status_code == 500
        data = res.json()
        assert data['code'] == 'INTERNAL_SERVER_ERROR'
        assert 'request_id' in data
        assert 'Unexpected internal database crash' in data['error']


# --- 13. /api/dashboard/project/{id}/status generation time and failure details ---
def test_project_status_returns_elapsed_seconds_on_success(sample_project, headers):
    folder = server.DATA / sample_project
    (folder / 'output.mp4').write_bytes(b'fake-video-bytes')
    report = {
        'status': 'ready',
        'elapsed_seconds': 42.5,
        'output_mp4': 'output.mp4'
    }
    (folder / 'report.json').write_text(json.dumps(report), encoding='utf-8')
    pipeline_status = {
        'state': 'ready',
        'stage': 'Complete',
        'progress': 100
    }
    (folder / 'pipeline_status.json').write_text(json.dumps(pipeline_status), encoding='utf-8')

    with TestClient(server.app) as client:
        res = client.get(f'/api/dashboard/project/{sample_project}/status', headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data['state'] == 'ready'
        assert data['elapsed_seconds'] == 42.5
        assert data['output_url'] == f'/media/{sample_project}/output.mp4'


def test_project_status_returns_error_details_on_failure(sample_project, headers):
    folder = server.DATA / sample_project
    pipeline_status = {
        'state': 'failed',
        'stage': 'Rendering Remotion video',
        'progress': 30,
        'error': 'Cloud TTS rate limit exceeded'
    }
    (folder / 'pipeline_status.json').write_text(json.dumps(pipeline_status), encoding='utf-8')
    (folder / 'issues.json').write_text(json.dumps([{'code': 'TTS_FAILED', 'message': 'Rate limit'}]), encoding='utf-8')

    with TestClient(server.app) as client:
        res = client.get(f'/api/dashboard/project/{sample_project}/status', headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data['state'] == 'failed'
        assert data['stage'] == 'Rendering Remotion video'
        assert data['error'] == 'Cloud TTS rate limit exceeded'
        assert len(data['issues']) == 1
        assert data['issues'][0]['code'] == 'TTS_FAILED'

