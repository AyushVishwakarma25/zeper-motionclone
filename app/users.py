"""User Management, Authentication, and Session Security for MotionClone Studio.

Provides:
- PBKDF2-SHA256 password hashing with random salt.
- Cryptographically signed HMAC-SHA256 bearer session tokens.
- Native email/password authentication, account registration, and password reset.
- Google OAuth token verification and account linkage.
- Pre-seeded owner account: reachtoayush25@gmail.com with password '9807828368'.
- Thread-safe, atomic persistence in DATA / 'users.json'.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger('motionclone.users')

ROOT = Path(__file__).resolve().parents[1]
_USER_LOCK = threading.RLock()
_USERS_CACHE: Optional[dict[str, dict[str, Any]]] = None

DEFAULT_OWNER_EMAIL = "reachtoayush25@gmail.com"
DEFAULT_OWNER_PASS = "9807828368"
ALT_OWNER_PASS = "pass word - 9807828368"


def get_data_dir() -> Path:
    data_dir = Path(os.environ.get('FRAMEFORGE_DATA', str(ROOT / 'data'))).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _get_secret_key() -> str:
    env_secret = os.environ.get('AUTH_SECRET_KEY') or os.environ.get('FRAMEFORGE_TOKEN')
    if env_secret:
        return env_secret.strip()
    secret_file = get_data_dir() / '.auth_secret'
    if secret_file.is_file():
        try:
            return secret_file.read_text(encoding='utf-8').strip()
        except Exception:
            pass
    secret = secrets.token_urlsafe(48)
    try:
        secret_file.write_text(secret, encoding='utf-8')
    except Exception:
        pass
    return secret


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def _b64url_decode(s: str) -> bytes:
    padding = '=' * (4 - (len(s) % 4)) if (len(s) % 4) != 0 else ''
    return base64.urlsafe_b64decode((s + padding).encode('utf-8'))


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 100_000
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    ).hex()
    return f"pbkdf2:sha256:{iterations}${salt}${pwd_hash}"


def verify_password(password: str, hashed: str) -> bool:
    if not password or not hashed:
        return False
    try:
        parts = hashed.split('$')
        if len(parts) != 3:
            return False
        meta, salt, stored_hash = parts
        iterations_str = meta.split(':')[-1]
        iterations = int(iterations_str)
        computed_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        ).hex()
        return hmac.compare_digest(stored_hash, computed_hash)
    except Exception as exc:
        logger.debug("Password verification error: %s", exc)
        return False


def create_access_token(user: dict[str, Any], expires_in_days: int = 7) -> str:
    secret = _get_secret_key()
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "uid": str(user.get("uid") or secrets.token_hex(8)),
        "email": (user.get("email") or "").strip().lower(),
        "name": user.get("name") or "",
        "role": user.get("role") or "user",
        "iat": now,
        "exp": now + (expires_in_days * 86400),
        "iss": "motionclone"
    }
    header_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    h_b64 = _b64url_encode(header_bytes)
    p_b64 = _b64url_encode(payload_bytes)
    message = f"{h_b64}.{p_b64}".encode('utf-8')
    sig = hmac.new(secret.encode('utf-8'), message, hashlib.sha256).digest()
    s_b64 = _b64url_encode(sig)
    return f"{h_b64}.{p_b64}.{s_b64}"


def verify_access_token(token: str) -> Optional[dict[str, Any]]:
    if not token or not isinstance(token, str):
        return None
    parts = token.strip().split('.')
    if len(parts) != 3:
        return None
    h_b64, p_b64, s_b64 = parts
    secret = _get_secret_key()
    message = f"{h_b64}.{p_b64}".encode('utf-8')
    expected_sig = hmac.new(secret.encode('utf-8'), message, hashlib.sha256).digest()
    try:
        actual_sig = _b64url_decode(s_b64)
    except Exception:
        return None
    if not hmac.compare_digest(expected_sig, actual_sig):
        return None
    try:
        payload_bytes = _b64url_decode(p_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
        exp = payload.get("exp")
        if exp and int(exp) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def _get_users_file() -> Path:
    return get_data_dir() / 'users.json'


def _load_users_unlocked() -> dict[str, dict[str, Any]]:
    users_file = _get_users_file()
    if users_file.is_file():
        try:
            return json.loads(users_file.read_text(encoding='utf-8'))
        except Exception as exc:
            logger.warning("Failed to parse users.json, reinitializing: %s", exc)
    return {}


def _save_users_unlocked(users: dict[str, dict[str, Any]]) -> None:
    users_file = _get_users_file()
    tmp_file = users_file.with_suffix('.tmp')
    tmp_file.write_text(json.dumps(users, indent=2), encoding='utf-8')
    tmp_file.replace(users_file)


def _sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    safe = {k: v for k, v in user.items() if k not in ('password_hash', 'reset_code', 'reset_expires')}
    return safe


def init_users() -> None:
    """Ensures owner account reachtoayush25@gmail.com is present with configured password."""
    global _USERS_CACHE
    with _USER_LOCK:
        users = _load_users_unlocked()
        owner_email = DEFAULT_OWNER_EMAIL.lower()
        now = int(time.time())

        owner_user = users.get(owner_email)
        needs_update = False
        if not owner_user:
            owner_user = {
                "uid": "usr_ayush25",
                "email": owner_email,
                "name": "Ayush Vishwakarma",
                "password_hash": hash_password(DEFAULT_OWNER_PASS),
                "role": "admin",
                "created_at": now,
                "updated_at": now
            }
            users[owner_email] = owner_user
            needs_update = True
        else:
            # Check if default password verifies; if not, re-hash so password works
            if not verify_password(DEFAULT_OWNER_PASS, owner_user.get("password_hash", "")):
                owner_user["password_hash"] = hash_password(DEFAULT_OWNER_PASS)
                owner_user["updated_at"] = now
                users[owner_email] = owner_user
                needs_update = True

        if needs_update:
            _save_users_unlocked(users)
        _USERS_CACHE = users


def list_users() -> list[dict[str, Any]]:
    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        return [_sanitize_user(u) for u in users.values()]


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    if not email:
        return None
    normalized = email.strip().lower()
    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        user = users.get(normalized)
        if user:
            return _sanitize_user(user)
    return None


def authenticate_user(email: str, password: str) -> Optional[dict[str, Any]]:
    if not email or not password:
        return None
    normalized = email.strip().lower()
    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        user = users.get(normalized)
        if not user:
            return None

        # Verify against stored hash or alternate owner pass format
        stored_hash = user.get("password_hash", "")
        is_valid = verify_password(password, stored_hash)
        if not is_valid and normalized == DEFAULT_OWNER_EMAIL:
            if password in (DEFAULT_OWNER_PASS, ALT_OWNER_PASS):
                is_valid = True

        if not is_valid:
            return None

        token = create_access_token(user)
        return {
            "token": token,
            "user": _sanitize_user(user)
        }


def create_user(email: str, password: str, name: Optional[str] = None) -> dict[str, Any]:
    if not email:
        raise ValueError("Email address is required.")
    normalized = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", normalized):
        raise ValueError("Invalid email format.")
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")

    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        if normalized in users:
            raise ValueError("An account with this email already exists.")

        now = int(time.time())
        clean_name = (name or normalized.split('@')[0]).strip()
        uid = f"usr_{secrets.token_hex(6)}"
        new_user = {
            "uid": uid,
            "email": normalized,
            "name": clean_name,
            "password_hash": hash_password(password),
            "role": "user",
            "created_at": now,
            "updated_at": now
        }
        users[normalized] = new_user
        _save_users_unlocked(users)

        token = create_access_token(new_user)
        return {
            "token": token,
            "user": _sanitize_user(new_user)
        }


def request_password_reset(email: str) -> dict[str, Any]:
    if not email:
        raise ValueError("Email is required.")
    normalized = email.strip().lower()
    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        user = users.get(normalized)
        if not user:
            raise ValueError("No account found with this email.")

        # Generate 6-digit reset code, valid for 15 minutes
        reset_code = f"{secrets.randbelow(900000) + 100000}"
        now = int(time.time())
        user["reset_code"] = reset_code
        user["reset_expires"] = now + 900
        user["updated_at"] = now
        users[normalized] = user
        _save_users_unlocked(users)

        logger.info("Password reset requested for %s. Reset code: %s", normalized, reset_code)
        return {
            "ok": True,
            "message": "Password reset code generated successfully.",
            "reset_code": reset_code
        }


def reset_password(email: str, reset_code: str, new_password: str) -> dict[str, Any]:
    if not email or not reset_code or not new_password:
        raise ValueError("Email, reset code, and new password are required.")
    normalized = email.strip().lower()
    if len(new_password) < 6:
        raise ValueError("New password must be at least 6 characters.")

    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        user = users.get(normalized)
        if not user:
            raise ValueError("No account found with this email.")

        stored_code = str(user.get("reset_code") or "").strip()
        expires = int(user.get("reset_expires") or 0)
        now = int(time.time())

        if not stored_code or stored_code != reset_code.strip():
            raise ValueError("Invalid reset code.")
        if now > expires:
            raise ValueError("Reset code has expired. Please request a new code.")

        user["password_hash"] = hash_password(new_password)
        user["reset_code"] = None
        user["reset_expires"] = 0
        user["updated_at"] = now
        users[normalized] = user
        _save_users_unlocked(users)

        token = create_access_token(user)
        return {
            "ok": True,
            "message": "Password updated successfully.",
            "token": token,
            "user": _sanitize_user(user)
        }


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verifies a Google OAuth or Firebase ID token and provisions/authenticates user."""
    if not credential:
        raise ValueError("Google credential is required.")

    decoded: Optional[dict[str, Any]] = None

    # Try google.oauth2.id_token
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        decoded = google_id_token.verify_oauth2_token(credential, google_requests.Request())
    except Exception as exc:
        logger.debug("google.oauth2 verification failed: %s", exc)

    # Fallback to firebase_admin.auth
    if not decoded:
        try:
            from .auth import get_firebase_app
            from firebase_admin import auth as firebase_auth
            app = get_firebase_app()
            decoded = firebase_auth.verify_id_token(credential, app=app, check_revoked=False)
        except Exception as exc:
            logger.debug("firebase_admin verification failed: %s", exc)

    if not decoded:
        raise ValueError("Failed to verify Google token.")

    email = (decoded.get('email') or '').strip().lower()
    if not email:
        raise ValueError("Google token did not contain an email address.")

    name = decoded.get('name') or email.split('@')[0]
    sub = decoded.get('sub') or decoded.get('uid') or secrets.token_hex(6)

    with _USER_LOCK:
        init_users()
        users = _load_users_unlocked()
        user = users.get(email)
        now = int(time.time())

        if not user:
            user = {
                "uid": f"usr_{sub[:12]}",
                "email": email,
                "name": name,
                "role": "admin" if email == DEFAULT_OWNER_EMAIL else "user",
                "auth_provider": "google",
                "created_at": now,
                "updated_at": now
            }
            users[email] = user
            _save_users_unlocked(users)

        token = create_access_token(user)
        return {
            "token": token,
            "user": _sanitize_user(user)
        }


# Automatically initialize users on import
init_users()
