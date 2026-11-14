"""Acceptance tests for Phase 1: Security.
Tests Firebase ID token enforcement, allowlist filtering, account protection,
upload size limits, and extension restrictions in hosted mode.
"""
import io
import pytest
from fastapi.testclient import TestClient

import app.auth as auth
import app.server as server
import app.security as security


@pytest.fixture(autouse=True)
def reset_server_state(monkeypatch, tmp_path):
    monkeypatch.setattr(server, 'ACTIVE', {'id': None})
    monkeypatch.setattr(server, 'DATA', tmp_path)
    yield


def test_hosted_requires_bearer_token_on_protected_routes(monkeypatch):
    """In hosted mode, /api/* and /dashboard routes return 401 without Bearer token."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)

    with TestClient(server.app) as client:
        # 1. create-project
        r_create = client.post('/api/dashboard/create-project', data={'name': 'Test'})
        assert r_create.status_code == 401
        assert "Authentication required" in r_create.json()['detail']

        # 2. account/connect
        r_connect = client.post('/api/account/connect', json={'api_key': 'fake'})
        assert r_connect.status_code == 401
        assert "Authentication required" in r_connect.json()['detail']

        # 3. account/disconnect
        r_disconnect = client.post('/api/account/disconnect')
        assert r_disconnect.status_code == 401
        assert "Authentication required" in r_disconnect.json()['detail']

        # 4. /dashboard page is a public HTML shell in Phase 8 (JS manages client auth)
        r_dash = client.get('/dashboard')
        assert r_dash.status_code == 200


def test_public_routes_remain_accessible_without_auth(monkeypatch):
    """Static assets and login page remain public in hosted mode."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)

    with TestClient(server.app) as client:
        # Public login page
        r_login = client.get('/login')
        assert r_login.status_code == 200
        assert "Login" in r_login.text


def test_invalid_token_returns_401(monkeypatch):
    """Invalid token returns 401."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setattr(server, 'HOSTED', True)

    def mock_verify_invalid(token):
        raise ValueError("Token is malformed or signature invalid")

    monkeypatch.setattr(auth, 'verify_token', mock_verify_invalid)

    with TestClient(server.app) as client:
        headers = {'Authorization': 'Bearer bad_token_123'}
        r = client.post('/api/dashboard/create-project', data={'name': 'Test'}, headers=headers)
        assert r.status_code == 401
        assert "Authentication failed" in r.json()['detail'] or "invalid" in r.json()['detail'].lower()


def test_allowed_emails_filter(monkeypatch):
    """Users with emails not in ALLOWED_EMAILS are rejected with 403."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setenv('ALLOWED_EMAILS', 'authorized@zeper.ai,admin@zeper.ai')
    monkeypatch.setattr(server, 'HOSTED', True)

    monkeypatch.setattr(
        auth.firebase_auth,
        'verify_id_token',
        lambda token, app, check_revoked: {'uid': '123', 'email': 'hacker@malicious.com'}
    )

    with pytest.raises(auth.HTTPException) as exc_info:
        auth.verify_token('some_token')
    assert exc_info.value.status_code == 403
    assert "access denied" in exc_info.value.detail.lower()

    # Also test via client in hosted mode
    with TestClient(server.app) as client:
        r = client.post('/api/dashboard/create-project', data={'name': 'Test'}, headers={'Authorization': 'Bearer bad_email_token'})
        assert r.status_code == 403
        assert "access denied" in r.json()['detail'].lower()


def test_valid_token_allows_create_project_and_account_endpoints(monkeypatch):
    """With a valid verified token, create-project, account/connect, account/disconnect return 200."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setenv('ALLOWED_EMAILS', 'editor@zeper.ai')
    monkeypatch.setattr(server, 'HOSTED', True)

    valid_user = {'uid': 'user_456', 'email': 'editor@zeper.ai'}
    monkeypatch.setattr(auth, 'verify_token', lambda token: valid_user)

    headers = {'Authorization': 'Bearer valid_mock_token_abc'}

    with TestClient(server.app) as client:
        # 1. create-project returns 200 with dashboard state
        r_create = client.post('/api/dashboard/create-project', data={'name': 'Authorized Project'}, headers=headers)
        assert r_create.status_code == 200
        data = r_create.json()
        assert data['name'] == 'Authorized Project'
        job_id = data['job_id']

        # 2. account/connect returns 200 without overwriting server config
        r_connect = client.post('/api/account/connect', json={'api_key': 'attempted_override'}, headers=headers)
        assert r_connect.status_code == 200
        # In hosted mode, it returns the server ADC status and does not allow overwrite
        assert r_connect.json().get('status') in ('connected', 'disconnected')

        # 3. account/disconnect returns 200 with notice
        r_disconnect = client.post('/api/account/disconnect', headers=headers)
        assert r_disconnect.status_code == 200
        assert "server service account" in r_disconnect.json().get('message', '')


def test_upload_extension_and_size_enforcement(monkeypatch, tmp_path):
    """Disallowed file extensions return 400; files exceeding MAX_UPLOAD_MB return 413."""
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')  # Local mode so auth doesn't interfere
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('MAX_UPLOAD_MB', '2')  # 2 MB limit for test
    monkeypatch.setattr(security, 'MAX_UPLOAD_MB', 2)
    monkeypatch.setattr(security, 'MAX_UPLOAD_BYTES', 2 * 1024 * 1024)

    local_headers = {'X-Frameforge-Token': server.TOKEN}

    with TestClient(server.app) as client:
        # Create a test project first
        res = client.post('/api/dashboard/create-project', data={'name': 'Upload Test'}, headers=local_headers)
        assert res.status_code == 200
        job_id = res.json()['job_id']

        # 1. Upload custom music with invalid extension (.exe) -> 400
        bad_music = io.BytesIO(b"fake dangerous executable content")
        r_bad_ext = client.post(
            f'/api/dashboard/upload-custom-music/{job_id}',
            files={'file': ('payload.exe', bad_music, 'application/octet-stream')},
            headers=local_headers
        )
        assert r_bad_ext.status_code == 400
        assert "not permitted" in r_bad_ext.json()['detail']

        # 2. Upload valid music (.mp3) within 2MB -> 200
        good_music = io.BytesIO(b"valid audio bytes")
        r_good = client.post(
            f'/api/dashboard/upload-custom-music/{job_id}',
            files={'file': ('theme.mp3', good_music, 'audio/mpeg')},
            headers=local_headers
        )
        assert r_good.status_code == 200
        assert r_good.json()['ok'] is True

        # 3. Upload file exceeding 2MB limit -> 413
        oversized = io.BytesIO(b"X" * (3 * 1024 * 1024))  # 3 MB
        r_over = client.post(
            f'/api/dashboard/upload-custom-music/{job_id}',
            files={'file': ('giant.mp3', oversized, 'audio/mpeg')},
            headers=local_headers
        )
        assert r_over.status_code == 413
        assert "exceeds maximum upload size" in r_over.json()['detail']
