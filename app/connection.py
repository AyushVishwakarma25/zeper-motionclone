"""Google Gemini & Vertex AI connection management. Replaces legacy Codex CLI."""
import os
import threading
from pathlib import Path

from . import ai


def safe_environment(home):
    """Allowlist for isolated worker environments (retained for backward compatibility)."""
    allowed = {
        'path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp',
        'lang', 'lc_all', 'ssl_cert_file', 'ssl_cert_dir',
        'programfiles', 'programfiles(x86)', 'programdata',
        'google_cloud_project', 'google_cloud_location', 'gemini_api_key',
        'google_genai_use_vertexai', 'vertexai_project', 'vertexai_location',
        'google_application_credentials'
    }
    env = {k: v for k, v in os.environ.items() if k.lower() in allowed}
    home = Path(home).resolve()
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    env.update(HOME=str(home), USERPROFILE=str(home))
    return env


class Connection:
    """Manages Gemini & Vertex AI connection state and configuration."""

    def __init__(self):
        self.lock = threading.RLock()
        self.last_state = 'disconnected'

    def client(self):
        client, model, auth_type = ai.get_gemini_client()
        return client

    def state(self, *, initialize=False):
        with self.lock:
            cfg = ai.get_gemini_config()
            is_authed = ai.auth_status()
            self.last_state = 'connected' if is_authed else 'disconnected'
            
            project = cfg.get('project', '')
            has_api_key = bool(cfg.get('api_key'))
            auth_type = 'vertexai' if cfg.get('vertexai') or project else ('api_key' if has_api_key else 'vertexai')
            model = cfg.get('model', 'gemini-3.1-pro-preview')
            
            identity = f"GCP: {project}" if project else ("Gemini API Key" if has_api_key else "Vertex AI (ADC)")
            
            return {
                'status': self.last_state,
                'provider': 'gemini',
                'auth_type': auth_type,
                'model': model,
                'project': project,
                'location': cfg.get('location', 'us-central1'),
                'has_api_key': has_api_key,
                'email': identity,
                'plan': f"Gemini ({model})",
            }

    def start(self):
        return self.state(initialize=True)

    def connect(self, payload: dict):
        with self.lock:
            updates = {}
            if 'api_key' in payload:
                updates['api_key'] = payload['api_key'].strip()
            if 'project' in payload:
                updates['project'] = payload['project'].strip()
            if 'location' in payload:
                updates['location'] = payload['location'].strip()
            if 'model' in payload:
                updates['model'] = payload['model'].strip()
            if 'vertexai' in payload:
                updates['vertexai'] = bool(payload['vertexai'])
            elif updates.get('project'):
                updates['vertexai'] = True

            ai.save_gemini_config(updates)
            
            # Verify connectivity
            try:
                client, model, auth_type = ai.get_gemini_client()
            except Exception as e:
                raise ValueError(f"Connection verification failed: {e}") from e
                
            return self.state(initialize=True)

    def disconnect(self):
        with self.lock:
            ROOT = Path(__file__).resolve().parents[1]
            DATA_DIR = Path(os.environ.get('FRAMEFORGE_DATA', str(ROOT / 'data'))).resolve()
            config_file = DATA_DIR / 'gemini_config.json'
            if config_file.is_file():
                try:
                    config_file.unlink()
                except Exception:
                    pass
            self.last_state = 'disconnected'
            return {'status': 'disconnected'}
