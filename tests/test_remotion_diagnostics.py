"""Unit tests for Remotion video-generation lifecycle diagnostics and error isolation."""
import json
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from app import models, remotion, rebrand, server


def test_remotion_subprocess_failure_diagnostics(tmp_path: Path, caplog):
    """Test that non-zero exit code raises informative error with log tail and logs diagnostic error."""
    folder = tmp_path / "failed_job"
    folder.mkdir()
    (folder / "media.json").write_text(json.dumps({"duration": 3.0, "fps": 30}), encoding="utf-8")
    
    plan = models.Plan(title="Test", tracks=[], scenes=[], background="#000000")
    brief = models.Brief(brand="Test", instructions="")

    # Mock popen to simulate a failing Remotion subprocess
    mock_proc = MagicMock()
    # Return None on first poll, then 1 for all subsequent calls
    mock_proc.poll.side_effect = [None, 1, 1, 1, 1, 1]
    mock_proc.returncode = 1
    mock_proc.wait.return_value = None

    def fake_popen(args, cwd=None, stdout=None, stderr=None, env=None):
        if stdout:
            stdout.write('{"progress": 10}\nRemotion JS Error: Out of memory\n')
            stdout.flush()
        return mock_proc

    with caplog.at_level(logging.INFO, logger="motionclone.remotion"):
        with patch("app.remotion.popen", side_effect=fake_popen), \
             patch("app.remotion.write_project", return_value=folder / "remotion" / "public"):
            
            with pytest.raises(ValueError) as exc_info:
                remotion.render(folder, plan, brief, format="mp4")

            assert "exit code 1" in str(exc_info.value)
            assert "Remotion JS Error: Out of memory" in str(exc_info.value)
            
            # Verify structured logging
            assert any("Remotion render subprocess failed (exit code 1)" in record.message for record in caplog.records)


def test_remotion_missing_pending_output_raises_filenotfound(tmp_path: Path, caplog):
    """Test that if subprocess exits 0 but pending file is absent, FileNotFoundError is raised."""
    folder = tmp_path / "missing_job"
    folder.mkdir()
    (folder / "media.json").write_text(json.dumps({"duration": 3.0, "fps": 30}), encoding="utf-8")

    plan = models.Plan(title="Test", tracks=[], scenes=[], background="#000000")
    brief = models.Brief(brand="Test", instructions="")

    mock_proc = MagicMock()
    mock_proc.poll.side_effect = [None, 0, 0, 0, 0, 0]
    mock_proc.returncode = 0
    mock_proc.wait.return_value = None

    def fake_popen(args, cwd=None, stdout=None, stderr=None, env=None):
        if stdout:
            stdout.write('{"progress": 100}\n')
            stdout.flush()
        return mock_proc

    with caplog.at_level(logging.INFO, logger="motionclone.remotion"):
        with patch("app.remotion.popen", side_effect=fake_popen), \
             patch("app.remotion.write_project", return_value=folder / "remotion" / "public"):
            
            with pytest.raises(FileNotFoundError) as exc_info:
                remotion.render(folder, plan, brief, format="mp4")

            assert "output.pending.mp4" in str(exc_info.value)
            assert any("Expected pending render output not found" in record.message for record in caplog.records)


def test_rebrand_post_render_finalization_error_not_masked_as_render_failed(tmp_path: Path):
    """Test that a failure in finalize_job after successful Remotion render sets stage to Finalization failed."""
    job_id = "aabbccddeeff"
    job_dir = server.DATA / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Create valid plan and brief files
    (job_dir / "plan.json").write_text(json.dumps({
        "title": "Diag Test", "tracks": [], "scenes": [], "background": "#000000"
    }), encoding="utf-8")
    (job_dir / "brief.json").write_text(json.dumps({
        "brand": "Diag Test", "instructions": ""
    }), encoding="utf-8")
    
    mock_job = {
        "id": job_id,
        "name": "Diag Test",
        "status": "queued",
        "stage": "Queued",
        "progress": 0,
        "brief": {"brand": "Diag Test", "instructions": ""}
    }
    
    with server.LOCK:
        server.JOBS[job_id] = mock_job
        server.ACTIVE["id"] = None

    def fake_remotion_render(folder, plan_data, brief, cancel_event, progress, format="mp4", composition="Motion", fps=None):
        out_file = folder / "output.mp4"
        out_file.write_bytes(b"mock-mp4-data-content")
        return out_file

    def fake_finalize_job(folder):
        raise RuntimeError("GCS upload bucket connection timed out")

    try:
        with patch("app.remotion.render", side_effect=fake_remotion_render), \
             patch("app.pipeline.finalize_job", side_effect=fake_finalize_job):
            
            res = rebrand.trigger_remotion_render(job_id, format="mp4")
            assert res["ok"] is True
            
            # Wait for background thread to complete
            import time
            for _ in range(50):
                if server.JOBS[job_id]["status"] in ("ready", "error"):
                    break
                time.sleep(0.05)

            job = server.JOBS[job_id]
            assert job["status"] == "error"
            assert job["stage"] == "Finalization failed"
            assert "Post-render finalization" in job["error"]
            assert "GCS upload bucket connection timed out" in job["error"]
            
            # Verify output.mp4 was preserved and error.log was written
            assert (job_dir / "output.mp4").is_file()
            assert (job_dir / "error.log").is_file()
            assert "RuntimeError: GCS upload bucket connection timed out" in (job_dir / "error.log").read_text(encoding="utf-8")
    finally:
        with server.LOCK:
            server.JOBS.pop(job_id, None)
            server.ACTIVE["id"] = None
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)
