"""Authentication and authorization middleware for MotionClone.
Provides Firebase ID token verification and user allowlist checks in hosted mode.
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
    """Returns set of normalized allowed emails from ALLOWED_EMAILS env var."""
    raw = os.environ.get('ALLOWED_EMAILS', '')
    return {e.strip().lower() for e in raw.split(',') if e.strip()}


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
    """Verifies a Firebase ID token and checks user against the allowed email list."""
    if not id_token:
        raise HTTPException(status_code=401, detail="Authentication token required.")

    app = get_firebase_app()
    try:
        decoded_token = firebase_auth.verify_id_token(id_token, app=app, check_revoked=False)
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid or expired authentication token: {exc}") from exc

    if is_hosted():
        allowed = get_allowed_emails()
        email = (decoded_token.get('email') or '').strip().lower()
        if not allowed:
            logger.warning("Hosted mode requires ALLOWED_EMAILS to be set. Rejecting user '%s' (fail-closed).", email)
            raise HTTPException(
                status_code=403,
                detail="Access denied: ALLOWED_EMAILS is not configured in hosted mode. Access is restricted (fail-closed)."
            )
        if email not in allowed:
            logger.warning("User email '%s' is not in ALLOWED_EMAILS", email)
            raise HTTPException(status_code=403, detail=f"Access denied: email '{email}' is not in the allowed users list.")

    return decoded_token


async def get_current_user(request: Request) -> dict[str, Any]:
    """FastAPI route dependency to retrieve verified user, or mock user in local development."""
    if not is_hosted():
        return {
            'uid': 'local-developer',
            'email': 'developer@localhost',
            'name': 'Local Developer',
            'auth_mode': 'local-no-auth'
        }

    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header. Expected 'Bearer <token>'.")

    token = auth_header[len('Bearer '):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token provided.")

    return verify_token(token)


class HostedAuthMiddleware(BaseHTTPMiddleware):
    """Enforces Firebase Bearer token authentication for all /api/* and /dashboard routes when in hosted mode."""

    # Public static and asset paths that never require auth
    PUBLIC_PREFIXES = (
        '/web/',
        '/static/',
        '/assets/',
        '/favicon',
        '/login',
        '/login.html',
    )
    
    # Exact public endpoints (login, health, root page, dashboard HTML shell, auth config)
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
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not is_hosted():
            # Local dev mode: allow all requests without authentication
            return await call_next(request)

        # Allow public static paths, HTML shells, and auth config endpoint
        if path in self.PUBLIC_EXACT or any(path.startswith(prefix) for prefix in self.PUBLIC_PREFIXES):
            return await call_next(request)

        # In hosted mode, protect all /api/* routes (page navigation routes are public shells)
        if path.startswith('/api/'):
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required. Provide a valid Firebase ID token in 'Authorization: Bearer <token>'."}
                )

            token = auth_header[len('Bearer '):].strip()
            if not token:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Empty bearer token provided."}
                )

            try:
                decoded = verify_token(token)
                request.state.user = decoded
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            except Exception as exc:
                return JSONResponse(status_code=401, content={"detail": f"Authentication failed: {exc}"})

        return await call_next(request)

