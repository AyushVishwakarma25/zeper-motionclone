"""Acceptance tests for Phase 6: Docker packaging, Cloud Run configuration, and Dashboard Pro UI verification."""
import re
from pathlib import Path
from fastapi.testclient import TestClient
import pytest
from app.server import app

client = TestClient(app)
ROOT_DIR = Path(__file__).resolve().parents[1]


def test_dockerfile_prebakes_browser_and_stages_assets():
    dockerfile_path = ROOT_DIR / "Dockerfile"
    assert dockerfile_path.is_file()
    content = dockerfile_path.read_text(encoding="utf-8")

    # Browser pre-baked
    assert "remotion browser ensure" in content, "Chrome Headless Shell must be pre-baked in Dockerfile"
    # Static assets copied
    assert "COPY static/ ./static/" in content
    # Hosted mode flag
    assert "ENV FRAMEFORGE_HOSTED=1" in content
    # Port 8080
    assert "EXPOSE 8080" in content


def test_deployment_configs_vertex_locations_and_tts():
    cb_path = ROOT_DIR / "cloudbuild.yaml"
    assert cb_path.is_file()
    cb_content = cb_path.read_text(encoding="utf-8")
    assert "VERTEXAI_LOCATION_TEXT=global" in cb_content
    assert "VERTEXAI_LOCATION_VIDEO=us-central1" in cb_content
    assert "4Gi" in cb_content
    assert "'2'" in cb_content or "2" in cb_content

    deploy_sh = ROOT_DIR / "deploy-gcp.sh"
    assert deploy_sh.is_file()
    sh_content = deploy_sh.read_text(encoding="utf-8")
    assert "texttospeech.googleapis.com" in sh_content
    assert "VERTEXAI_LOCATION_TEXT=global" in sh_content


def test_dashboard_ui_html_structure():
    response = client.get("/dashboard")
    assert response.status_code == 200
    html = response.text

    # Top Navbar & Brand
    assert "MotionClone" in html
    assert "Dashboard Pro" in html

    # Aspect Ratio Selector
    assert 'data-aspect="9:16"' in html
    assert 'data-aspect="16:9"' in html
    assert 'data-aspect="1:1"' in html

    # Language Selector
    assert 'data-lang="en"' in html
    assert 'data-lang="hi"' in html
    assert 'data-lang="en_hi"' in html

    # 30% / 70% Layout Structure
    assert 'class="stage-preview-column"' in html
    assert 'class="stage-workspace-column"' in html

    # AI Director & Quick Pills
    assert "Deconstruct Reference" in html
    assert "Generate Script" in html
    assert "Match Pacing" in html

    # Paste & Render Merger Tab
    assert "Paste & Render" in html


def test_dashboard_css_aspect_ratio_containment():
    css_path = ROOT_DIR / "web" / "dashboard.css"
    assert css_path.is_file()
    css_content = css_path.read_text(encoding="utf-8")

    assert ".stage-player-wrap.aspect-9-16" in css_content
    assert ".stage-player-wrap.aspect-16-9" in css_content
    assert ".stage-player-wrap.aspect-1-1" in css_content

    # Verify 16:9 height is constrained to prevent viewport overflow
    assert "max-height" in css_content
    assert "aspect-ratio: 16 / 9" in css_content
