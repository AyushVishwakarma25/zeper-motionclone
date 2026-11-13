import json
import os
from pathlib import Path
import pytest

from app.connection import Connection, safe_environment
import app.ai as ai


def test_gemini_connection_state_disconnected_by_default(tmp_path, monkeypatch):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('GOOGLE_APPLICATION_CREDENTIALS', raising=False)
    monkeypatch.setattr(ai, 'auth_status', lambda: False)

    conn = Connection()
    st = conn.state()
    assert st['status'] == 'disconnected'
    assert st['provider'] == 'gemini'
    assert 'model' in st


def test_gemini_connection_connect_with_api_key(tmp_path, monkeypatch):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(ai, 'get_gemini_client', lambda: (object(), 'gemini-2.5-flash', 'api_key'))

    conn = Connection()
    result = conn.connect({'api_key': 'test-fake-gemini-key', 'model': 'gemini-2.5-flash'})
    assert result['status'] == 'connected'
    assert result['provider'] == 'gemini'
    assert result['has_api_key'] is True
    assert result['model'] == 'gemini-2.5-flash'


def test_gemini_connection_connect_with_vertex_ai(tmp_path, monkeypatch):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(ai, 'get_gemini_client', lambda: (object(), 'gemini-2.5-pro', 'vertexai'))

    conn = Connection()
    result = conn.connect({
        'project': 'my-gcp-project',
        'location': 'us-central1',
        'model': 'gemini-2.5-pro'
    })
    assert result['status'] == 'connected'
    assert result['project'] == 'my-gcp-project'
    assert result['location'] == 'us-central1'
    assert result['model'] == 'gemini-2.5-pro'
    assert result['auth_type'] == 'vertexai'


def test_gemini_connection_disconnect_clears_saved_config(tmp_path, monkeypatch):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    cfg_file = tmp_path / 'gemini_config.json'
    cfg_file.write_text(json.dumps({'api_key': 'abc'}))

    conn = Connection()
    res = conn.disconnect()
    assert res['status'] == 'disconnected'
    assert not cfg_file.exists()


def test_tenant_environment_does_not_inherit_sensitive_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'owner-openai-key')
    monkeypatch.setenv('CODEX_API_KEY', 'owner-codex-key')
    monkeypatch.setenv('MOTIONCLONE_GATEWAY_SECRET', 'gateway-secret')
    monkeypatch.setenv('GEMINI_API_KEY', 'owner-gemini-key')
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'my-test-proj')

    env = safe_environment(tmp_path)
    assert env['HOME'] == str(tmp_path.resolve())
    assert env['USERPROFILE'] == str(tmp_path.resolve())
    assert 'OPENAI_API_KEY' not in env
    assert 'CODEX_API_KEY' not in env
    assert 'MOTIONCLONE_GATEWAY_SECRET' not in env
    assert 'GOOGLE_CLOUD_PROJECT' in env
    assert 'PATH' in env or 'Path' in env
