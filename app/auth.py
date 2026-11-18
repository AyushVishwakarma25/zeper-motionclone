"""Authentication and authorization middleware for MotionClone.
Provides MotionClone session token verification, Google OAuth verification,
Firebase ID token verification, and user allowlist checks in hosted mode.
"""
import logging
import os
from typing import Any, Optional

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger('motionclone.auth')

FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', os.environ.get('GOOGLE_CLOUD_PROJECT', 'zeperai'))
_firebase_app: Optional[firebase_admin.App] = None


def is_hosted() -> bool:
    """True when running in hosted cloud mode."""
    return os.environ.get('FRAMEFORGE_HOSTED') == '1'


def get_allowed_emails() -> set[str]:
    """Returns set of normalized allowed emails from ALLOWED_EMAILS env var and user store."""
    raw = os.environ.get('ALLOWED_EMAILS', '')
    emails = {e.strip().lower() for e in raw.split(',') if e.strip()}
    # Always allow primary owner email
    emails.add('reachtoayush25@gmail.com')

    # Allow registered users in the user store
    try:
        from . import users
        for u in users.list_users():
            em = (u.get('email') or '').strip().lower()
            if em:
                emails.add(em)
    except Exception:
        pass

    return emails


def get_firebase_app() -> firebase_admin.App:
    """Initializes and returns the singleton Firebase Admin App."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    try:
        _firebase_app = firebase_admin.get_app()
    except ValueError:
        try:
            # Use Application Default Credentials (Cloud Run service account)
            cred = credentials.ApplicationDefault()
            _firebase_app = firebase_admin.initialize_app(cred, {'projectId': FIREBASE_PROJECT_ID})
        except Exception as e:
            logger.info("Initializing Firebase Admin with project ID %s (fallback without explicit ADC: %s)", FIREBASE_PROJECT_ID, e)
            _firebase_app = firebase_admin.initialize_app(options={'projectId': FIREBASE_PROJECT_ID})

    return _firebase_app


def verify_token(id_token: str) -> dict[str, Any]:
    """Verifies a MotionClone signed session token, Firebase ID token, or Google ID token."""
    if not id_token:
        raise HTTPException(status_code=401, detail="Authentication token required.")

    # 1. First, check if it's a native MotionClone signed session token
    try:
        from . import users
        native_payload = users.verify_access_token(id_token)
        if native_payload is not None:
            email = (native_payload.get('email') or '').strip().lower()
            if is_hosted():
                allowed = get_allowed_emails()
                if allowed and email not in allowed:
                    logger.warning("User email '%s' is not in ALLOWED_EMAILS", email)
                    raise HTTPException(
                        status_code=403,
                        detail=f"Access denied: email '{email}' is not in the allowed users list."
                    )
            return native_payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug("Native token verification error: %s", exc)

    # 2. Check if it's a Firebase ID token
    try:
        app = get_firebase_app()
        decoded_token = firebase_auth.verify_id_token(id_token, app=app, check_revoked=False)
        email = (decoded_token.get('email') or '').strip().lower()
        if is_hosted():
            allowed = get_allowed_emails()
            if allowed and email not in allowed:
                logger.warning("Firebase user email '%s' is not in ALLOWED_EMAILS", email)
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: email '{email}' is not in the allowed users list."
                )
        return decoded_token
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug("Firebase token verification not matched: %s", exc)

    # 3. Check if it's a Google OAuth ID token
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        decoded_google = google_id_token.verify_oauth2_token(id_token, google_requests.Request())
        email = (decoded_google.get('email') or '').strip().lower()
        if is_hosted():
            allowed = get_allowed_emails()
            if allowed and email not in allowed:
                logger.warning("Google user email '%s' is not in ALLOWED_EMAILS", email)
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: email '{email}' is not in the allowed users list."
                )
        return {
            'uid': decoded_google.get('sub', ''),
            'email': email,
            'name': decoded_google.get('name', ''),
            'auth_mode': 'google'
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug("Google OAuth token verification not matched: %s", exc)

    raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")


async def get_current_user(request: Request) -> dict[str, Any]:
    """FastAPI route dependency to retrieve verified user, or fallback in local development."""
    auth_header = request.headers.get('Authorization', '')
    token = ''
    if auth_header.startswith('Bearer '):
        token = auth_header[len('Bearer '):].strip()
    if not token:
        token = request.cookies.get('motionclone_session', '').strip()

    if not is_hosted():
        if token:
            try:
                return verify_token(token)
            except Exception:
                pass
        return {
            'uid': 'usr_ayush25',
            'email': 'reachtoayush25@gmail.com',
            'name': 'Ayush Vishwakarma',
            'role': 'admin',
            'auth_mode': 'local-dev'
        }

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    return verify_token(token)


class HostedAuthMiddleware(BaseHTTPMiddleware):
    """Enforces authentication for all protected /api/* routes when in hosted mode."""

    # Public static and asset paths that never require auth
    PUBLIC_PREFIXES = (
        '/web/',
        '/static/',
        '/assets/',
        '/favicon',
        '/login',
        '/login.html',
        '/api/auth/',
    )
    
    # Exact public endpoints (login, root page, dashboard HTML shell, auth endpoints)
    PUBLIC_EXACT = {
        '/',
        '/index.html',
        '/login',
        '/login.html',
        '/dashboard',
        '/dashboard.html',
        '/terms',
        '/privacy',
        '/favicon.ico',
        '/favicon.svg',
        '/api/auth/config',
        '/api/auth/login',
        '/api/auth/signup',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/google',
        '/api/auth/logout',
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not is_hosted():
            # Local dev mode: allow all requests without authentication
            return await call_next(request)

        # Allow public static paths, HTML shells, and auth endpoints
        if path in self.PUBLIC_EXACT or any(path.startswith(prefix) for prefix in self.PUBLIC_PREFIXES):
            return await call_next(request)

        # In hosted mode, protect all /api/* routes (page navigation routes are public shells)
        if path.startswith('/api/'):
            auth_header = request.headers.get('Authorization', '')
            token = ''
            if auth_header.startswith('Bearer '):
                token = auth_header[len('Bearer '):].strip()
            if not token:
                token = request.cookies.get('motionclone_session', '').strip()

            if not token:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required. Provide a valid Bearer token in 'Authorization' header or session cookie."}
                )

            try:
                decoded = verify_token(token)
                request.state.user = decoded
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            except Exception as exc:
                return JSONResponse(status_code=401, content={"detail": f"Authentication failed: {exc}"})

        return await call_next(request)
