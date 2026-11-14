from fastapi.testclient import TestClient
import app.server as server
import app.ai as ai
from app.connection import Connection


def test_hosted_rebuild_rejected_before_any_job_or_model_work(monkeypatch):
    monkeypatch.setattr(server, 'HOSTED', True)
    monkeypatch.setattr(server, 'auth_status', lambda: False)
    before = set(server.JOBS)
    with TestClient(server.app) as client:
        response = client.post('/api/jobs', data={'url': 'https://x.com/example/status/123'},
                               headers={'X-Frameforge-Token': server.TOKEN})
    assert response.status_code == 401
    assert set(server.JOBS) == before


def test_account_endpoints_support_local_gemini_config_and_require_csrf(monkeypatch, tmp_path):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(ai, 'get_gemini_client', lambda: (object(), 'gemini-2.5-flash', 'api_key'))
    
    test_conn = Connection()
    monkeypatch.setattr(server, 'CONNECTION', test_conn)

    with TestClient(server.app) as client:
        response = client.get('/api/account')
        assert response.status_code == 200
        assert response.json()['status'] == 'connected'
        assert response.json()['provider'] == 'gemini'

        # CSRF check
        assert client.post('/api/account/connect', json={'api_key': 'abc'}).status_code == 403
        assert client.post('/api/account/disconnect').status_code == 403

        # Authorized disconnect
        response = client.post('/api/account/disconnect', headers={'X-Frameforge-Token': server.TOKEN})
        assert response.status_code == 200
        assert response.json()['status'] == 'disconnected'


def test_local_connect_updates_gemini_configuration(monkeypatch, tmp_path):
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(server, 'ACTIVE', {'id': None})
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(ai, 'get_gemini_client', lambda: (object(), 'gemini-2.5-flash', 'api_key'))

    test_conn = Connection()
    monkeypatch.setattr(server, 'CONNECTION', test_conn)

    with TestClient(server.app) as client:
        payload = {'api_key': 'test-gemini-key', 'model': 'gemini-2.5-flash'}
        response = client.post('/api/account/connect', json=payload, headers={'X-Frameforge-Token': server.TOKEN})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'connected'
        assert data['provider'] == 'gemini'
        assert data['has_api_key'] is True


def test_connection_change_blocked_during_active_job(monkeypatch):
    monkeypatch.setattr(server, 'HOSTED', True)
    monkeypatch.setattr(server, 'ACTIVE', {'id': 'active-project'})
    with TestClient(server.app) as client:
        for action in ['connect', 'disconnect']:
            response = client.post('/api/account/' + action, json={}, headers={'X-Frameforge-Token': server.TOKEN})
            assert response.status_code == 200


def test_local_connection_change_blocked_during_active_job(monkeypatch):
    monkeypatch.setattr(server, 'HOSTED', False)
    monkeypatch.setattr(server, 'ACTIVE', {'id': 'active-project'})
    with TestClient(server.app) as client:
        for action in ['connect', 'disconnect']:
            assert client.post('/api/account/' + action, json={}, headers={'X-Frameforge-Token': server.TOKEN}).status_code == 409
