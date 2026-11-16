"""Tests for Phase 10 Item 7: Cloud Run state, GCS upload, and Firestore mirroring.
Rules:
- No mocking of internal business logic or ffmpeg; stub only at Google SDK boundary (storage.Client, firestore.Client).
- Write all test files to tmp_path; never overwrite fixtures.
"""
from datetime import timedelta
import json
import os
from pathlib import Path
from typing import Any
import pytest

from app import pipeline, storage


class FakeBlob:
    def __init__(self, name: str, bucket: Any = None):
        self.name = name
        self.bucket = bucket
        self.uploaded_content = None
        self.content_type = None

    def upload_from_filename(self, filename: str, content_type: str | None = None):
        self.content_type = content_type
        with open(filename, 'rb') as f:
            self.uploaded_content = f.read()

    def generate_signed_url(self, version: str = "v4", expiration: Any = None, method: str = "GET"):
        return f"https://storage.googleapis.com/signed/{self.name}?sig=mock123"


class FakeBucket:
    def __init__(self, name: str):
        self.name = name
        self.blobs: dict[str, FakeBlob] = {}

    def blob(self, blob_name: str) -> FakeBlob:
        if blob_name not in self.blobs:
            self.blobs[blob_name] = FakeBlob(blob_name, self)
        return self.blobs[blob_name]


class FakeStorageClient:
    def __init__(self, project: str = "zeperai"):
        self.project = project
        self.buckets: dict[str, FakeBucket] = {}

    def bucket(self, bucket_name: str) -> FakeBucket:
        if bucket_name not in self.buckets:
            self.buckets[bucket_name] = FakeBucket(bucket_name)
        return self.buckets[bucket_name]


class FakeDocSnap:
    def __init__(self, data: dict):
        self._data = data
        self.exists = bool(data)

    def to_dict(self):
        return self._data


class FakeDocRef:
    def __init__(self, doc_id: str, store: dict):
        self.id = doc_id
        self._store = store

    def set(self, data: dict, merge: bool = False):
        if merge and self.id in self._store:
            self._store[self.id].update(data)
        else:
            self._store[self.id] = dict(data)

    def get(self):
        return FakeDocSnap(self._store.get(self.id, {}))


class FakeFirestoreCollection:
    def __init__(self, name: str, store: dict):
        self.name = name
        self._store = store.setdefault(name, {})

    def document(self, doc_id: str) -> FakeDocRef:
        return FakeDocRef(doc_id, self._store)


class FakeFirestoreClient:
    def __init__(self, project: str = "zeperai"):
        self.project = project
        self._store: dict[str, dict] = {}

    def collection(self, name: str) -> FakeFirestoreCollection:
        return FakeFirestoreCollection(name, self._store)


def test_upload_job_artifacts_to_gcs(tmp_path: Path):
    job_id = "testjob001a1"
    job_dir = tmp_path / job_id
    job_dir.mkdir(parents=True)
    
    # Create sample artifacts
    (job_dir / "output.mp4").write_bytes(b"fake-mp4-data")
    (job_dir / "report.json").write_text(json.dumps({"status": "ready"}), encoding="utf-8")
    (job_dir / "verification.json").write_text(json.dumps({"audio_valid": True}), encoding="utf-8")
    
    review_dir = job_dir / "review"
    review_dir.mkdir()
    (review_dir / "pass_1.json").write_text(json.dumps({"pass": 1}), encoding="utf-8")

    fake_client = FakeStorageClient()
    result = storage.upload_job_artifacts(
        project_dir=job_dir,
        bucket_name="zeperai-renders",
        storage_client=fake_client
    )

    assert result["bucket"] == "zeperai-renders"
    assert f"jobs/{job_id}/output.mp4" in result["uploaded_files"]
    assert f"jobs/{job_id}/report.json" in result["uploaded_files"]
    assert f"jobs/{job_id}/verification.json" in result["uploaded_files"]
    assert f"jobs/{job_id}/review/pass_1.json" in result["uploaded_files"]

    assert result["signed_output_url"] == f"https://storage.googleapis.com/signed/jobs/{job_id}/output.mp4?sig=mock123"
    assert result["signed_report_url"] == f"https://storage.googleapis.com/signed/jobs/{job_id}/report.json?sig=mock123"


def test_firestore_mirroring_and_load(monkeypatch):
    fake_fs = FakeFirestoreClient()
    job_id = "testjob001b2"

    ok = storage.mirror_job_to_firestore(
        job_id=job_id,
        status="ready",
        stage="Ready",
        issues=[],
        progress=100,
        signed_output_url="https://storage.googleapis.com/signed/output.mp4",
        firestore_client=fake_fs
    )
    assert ok is True

    loaded = storage.load_job_from_firestore(job_id=job_id, firestore_client=fake_fs)
    assert loaded is not None
    assert loaded["job_id"] == job_id
    assert loaded["status"] == "ready"
    assert loaded["signed_output_url"] == "https://storage.googleapis.com/signed/output.mp4"


def test_finalize_job_with_gcs_and_firestore(tmp_path: Path, monkeypatch):
    job_id = "testjob001c3"
    job_dir = tmp_path / job_id
    job_dir.mkdir(parents=True)

    (job_dir / "output.mp4").write_bytes(b"fake-mp4")
    (job_dir / "verification.json").write_text(json.dumps({
        "audio_valid": True,
        "duration_matches_plan": True,
        "dimensions": [1080, 1920]
    }), encoding="utf-8")

    fake_gcs = FakeStorageClient()
    fake_fs = FakeFirestoreClient()

    monkeypatch.setenv("OUTPUT_BUCKET", "zeperai-test-bucket")
    monkeypatch.setattr(storage, "get_storage_client", lambda: fake_gcs)
    monkeypatch.setattr(storage, "get_firestore_client", lambda: fake_fs)

    report = pipeline.finalize_job(project_dir=job_dir)
    assert report["status"] == "ready"
    assert "signed_output_url" in report
    assert report["signed_output_url"].startswith("https://storage.googleapis.com/signed/")

    # Verify Firestore was updated
    fs_job = storage.load_job_from_firestore(job_id, firestore_client=fake_fs)
    assert fs_job is not None
    assert fs_job["status"] == "ready"
    assert fs_job["signed_output_url"] == report["signed_output_url"]


def test_deploy_configs_match_spec():
    # Verify cloudbuild.yaml
    cb = Path("cloudbuild.yaml").read_text(encoding="utf-8")
    assert "--timeout" in cb and "3600" in cb
    assert "--min-instances" in cb and "1" in cb
    assert "--max-instances" in cb and "1" in cb
    assert "--no-cpu-throttling" in cb
    assert "--cpu" in cb and "2" in cb
    assert "--memory" in cb and "4Gi" in cb

    # Verify deploy-gcp.sh
    sh = Path("deploy-gcp.sh").read_text(encoding="utf-8")
    assert "--timeout 3600" in sh
    assert "--min-instances 1" in sh
    assert "--max-instances 1" in sh
    assert "--no-cpu-throttling" in sh
    assert "--memory 4Gi" in sh
    assert "--cpu 2" in sh

    # Verify deploy-gcp.ps1
    ps1 = Path("deploy-gcp.ps1").read_text(encoding="utf-8")
    assert "--timeout 3600" in ps1
    assert "--min-instances 1" in ps1
    assert "--max-instances 1" in ps1
    assert "--no-cpu-throttling" in ps1
    assert "--memory 4Gi" in ps1
    assert "--cpu 2" in ps1
