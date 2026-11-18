"""Tests for the Login Gateway, Email/Password Authentication, Password Reset, and Session Management."""
import pytest
from fastapi.testclient import TestClient

from app import server, users, auth


@pytest.fixture
def test_client(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    users.init_users()
    with TestClient(server.app) as client:
        yield client


def test_owner_login_success(test_client):
    """Test that owner reachtoayush25@gmail.com can log in with password '9807828368'."""
    res = test_client.post('/api/auth/login', json={
        'email': 'reachtoayush25@gmail.com',
        'password': '9807828368'
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['ok'] is True
    assert 'token' in data
    assert data['user']['email'] == 'reachtoayush25@gmail.com'
    assert data['user']['role'] == 'admin'

    # Test alt format 'pass word - 9807828368'
    res_alt = test_client.post('/api/auth/login', json={
        'email': 'reachtoayush25@gmail.com',
        'password': 'pass word - 9807828368'
    })
    assert res_alt.status_code == 200
    assert res_alt.json()['ok'] is True


def test_login_invalid_credentials(test_client):
    """Test that incorrect password or non-existent email is rejected with 401."""
    res_bad_pw = test_client.post('/api/auth/login', json={
        'email': 'reachtoayush25@gmail.com',
        'password': 'wrongpassword'
    })
    assert res_bad_pw.status_code == 401
    assert "Invalid email or password" in res_bad_pw.json()['detail']

    res_no_user = test_client.post('/api/auth/login', json={
        'email': 'nobody@example.com',
        'password': 'somepassword'
    })
    assert res_no_user.status_code == 401


def test_api_me_with_session_token(test_client):
    """Test that Bearer token returned from login authenticates /api/me."""
    login_res = test_client.post('/api/auth/login', json={
        'email': 'reachtoayush25@gmail.com',
        'password': '9807828368'
    })
    token = login_res.json()['token']

    me_res = test_client.get('/api/me', headers={'Authorization': f'Bearer {token}'})
    assert me_res.status_code == 200
    user_info = me_res.json()
    assert user_info['email'] == 'reachtoayush25@gmail.com'
    assert user_info['uid'] == 'usr_ayush25'


def test_user_signup_and_duplicate_check(test_client):
    """Test creating a new account and rejecting duplicate registrations."""
    # 1. Sign up valid user
    res = test_client.post('/api/auth/signup', json={
        'email': 'creator@studio.com',
        'password': 'creatorPass123',
        'name': 'Studio Creator'
    })
    assert res.status_code == 200
    data = res.json()
    assert data['ok'] is True
    assert data['user']['email'] == 'creator@studio.com'
    assert data['user']['name'] == 'Studio Creator'
    token = data['token']

    # Check /api/me with newly created user
    me_res = test_client.get('/api/me', headers={'Authorization': f'Bearer {token}'})
    assert me_res.status_code == 200
    assert me_res.json()['email'] == 'creator@studio.com'

    # 2. Duplicate signup fails with 400
    res_dup = test_client.post('/api/auth/signup', json={
        'email': 'creator@studio.com',
        'password': 'anotherPassword123'
    })
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()['detail']

    # 3. Short password fails with 400
    res_short = test_client.post('/api/auth/signup', json={
        'email': 'short@studio.com',
        'password': '123'
    })
    assert res_short.status_code == 400
    assert "at least 6 characters" in res_short.json()['detail']


def test_forgot_and_reset_password_flow(test_client):
    """Test forgot password code generation and password update flow."""
    # Create test account
    test_client.post('/api/auth/signup', json={
        'email': 'resetme@example.com',
        'password': 'initialPassword123'
    })

    # Request reset code
    forgot_res = test_client.post('/api/auth/forgot-password', json={
        'email': 'resetme@example.com'
    })
    assert forgot_res.status_code == 200
    reset_data = forgot_res.json()
    assert reset_data['ok'] is True
    code = reset_data['reset_code']
    assert len(code) == 6

    # Attempt reset with bad code
    bad_code_res = test_client.post('/api/auth/reset-password', json={
        'email': 'resetme@example.com',
        'reset_code': '000000',
        'new_password': 'updatedPassword456'
    })
    assert bad_code_res.status_code == 400

    # Reset with valid code
    good_reset_res = test_client.post('/api/auth/reset-password', json={
        'email': 'resetme@example.com',
        'reset_code': code,
        'new_password': 'updatedPassword456'
    })
    assert good_reset_res.status_code == 200
    assert good_reset_res.json()['ok'] is True

    # Authenticate with new password
    new_login = test_client.post('/api/auth/login', json={
        'email': 'resetme@example.com',
        'password': 'updatedPassword456'
    })
    assert new_login.status_code == 200
    assert new_login.json()['ok'] is True


def test_logout(test_client):
    """Test logout endpoint clears session."""
    res = test_client.post('/api/auth/logout')
    assert res.status_code == 200
    assert res.json()['ok'] is True


def test_hosted_mode_allows_public_auth_and_blocks_unauthorized_api(monkeypatch, tmp_path):
    """In hosted mode, /api/auth/* are accessible publicly, while protected /api/* routes require a valid token."""
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_DATA', str(tmp_path))
    monkeypatch.setattr(server, 'HOSTED', True)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    users.init_users()

    with TestClient(server.app) as client:
        # Public auth routes accessible without token
        login_res = client.post('/api/auth/login', json={
            'email': 'reachtoayush25@gmail.com',
            'password': '9807828368'
        })
        assert login_res.status_code == 200
        token = login_res.json()['token']

        # Protected route without token is blocked with 401
        blocked_res = client.get('/api/me')
        assert blocked_res.status_code == 401

        # Protected route with token succeeds
        authed_res = client.get('/api/me', headers={'Authorization': f'Bearer {token}'})
        assert authed_res.status_code == 200
        assert authed_res.json()['email'] == 'reachtoayush25@gmail.com'
