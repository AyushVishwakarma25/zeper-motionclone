"""Cloud Storage and State Mirroring for MotionClone.

Handles:
- Upload of completed job artifacts (output.mp4, report.json, verification.json, review/) to Google Cloud Storage (GCS).
- Generation of short-lived signed URLs for GCS objects.
- Mirroring of job state (status, stage, issues, progress) to Google Cloud Firestore (collection: jobs).
- Probing of Vertex AI models at application startup.
"""
from datetime import timedelta
import json
import logging
import os
from pathlib import Path
import time
from typing import Any

logger = logging.getLogger('motionclone.storage')


def get_storage_client():
    from google.cloud import storage
    project = os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('GCP_PROJECT') or 'zeperai'
    return storage.Client(project=project)


def get_firestore_client():
    from google.cloud import firestore
    project = os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('GCP_PROJECT') or 'zeperai'
    return firestore.Client(project=project)


def upload_job_artifacts(
    project_dir: Path | str,
    bucket_name: str | None = None,
    storage_client: Any = None
) -> dict[str, Any]:
    """Uploads finished job artifacts to Google Cloud Storage and returns short-lived signed URLs.
    
    Target bucket determined by bucket_name or env OUTPUT_BUCKET.
    Uploads:
      - output.mp4
      - report.json
      - verification.json
      - review/ directory (review frames and pass evaluations)
    """
    project_dir = Path(project_dir).resolve()
    job_id = project_dir.name
    bucket_name = bucket_name or os.getenv('OUTPUT_BUCKET')

    if not bucket_name:
        return {}

    try:
        client = storage_client or get_storage_client()
        bucket = client.bucket(bucket_name)
    except Exception as e:
        logger.warning(f"Could not initialize GCS client for bucket {bucket_name}: {e}")
        return {}

    uploaded_files: list[str] = []
    signed_urls: dict[str, str] = {}

    files_to_upload = [
        ("output.mp4", f"jobs/{job_id}/output.mp4", "video/mp4"),
        ("report.json", f"jobs/{job_id}/report.json", "application/json"),
        ("verification.json", f"jobs/{job_id}/verification.json", "application/json"),
    ]

    # Include review directory files if present
    review_dir = project_dir / "review"
    if review_dir.is_dir():
        for p in review_dir.iterdir():
            if p.is_file():
                content_type = "image/png" if p.suffix == ".png" else "application/json"
                files_to_upload.append((f"review/{p.name}", f"jobs/{job_id}/review/{p.name}", content_type))

    for local_rel, gcs_path, content_type in files_to_upload:
        local_path = project_dir / local_rel
        if not local_path.is_file():
            continue

        try:
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(str(local_path), content_type=content_type)
            uploaded_files.append(gcs_path)

            # Generate short-lived signed URL (1 hour)
            try:
                signed_url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(seconds=3600),
                    method="GET"
                )
                signed_urls[local_rel] = signed_url
            except Exception as sign_err:
                # Cloud Run ADC may not expose a local signing key. Keep the object private
                # and omit its URL rather than returning an unsigned, potentially inaccessible URL.
                logger.warning(
                    "Signed URL generation failed for gs://%s/%s: %s",
                    bucket_name, gcs_path, sign_err,
                )
        except Exception as upload_err:
            logger.warning(f"Failed to upload {local_path} to gs://{bucket_name}/{gcs_path}: {upload_err}")

    result = {
        "bucket": bucket_name,
        "uploaded_files": uploaded_files,
        "signed_urls": signed_urls,
        "signed_output_url": signed_urls.get("output.mp4"),
        "signed_report_url": signed_urls.get("report.json")
    }

    return result


def mirror_job_to_firestore(
    job_id: str,
    status: str,
    stage: str,
    issues: list[dict[str, Any]] | None = None,
    progress: int = 100,
    error: str | None = None,
    signed_output_url: str | None = None,
    extra: dict[str, Any] | None = None,
    firestore_client: Any = None
) -> bool:
    """Mirrors job state to Firestore collection 'jobs' so container restarts do not lose status."""
    try:
        db = firestore_client or get_firestore_client()
        doc_ref = db.collection('jobs').document(job_id)
        
        payload: dict[str, Any] = {
            "job_id": job_id,
            "status": status,
            "stage": stage,
            "issues": issues or [],
            "progress": progress,
            "error": error,
            "updated_at": time.time(),
        }
        if signed_output_url:
            payload["signed_output_url"] = signed_output_url
        if extra:
            payload.update(extra)

        doc_ref.set(payload, merge=True)
        logger.info(f"Mirrored job {job_id} to Firestore (status={status}, stage={stage})")
        return True
    except Exception as e:
        logger.warning(f"Failed to mirror job {job_id} to Firestore: {e}")
        return False


def load_job_from_firestore(
    job_id: str,
    firestore_client: Any = None
) -> dict[str, Any] | None:
    """Retrieves mirrored job state from Firestore collection 'jobs'."""
    try:
        db = firestore_client or get_firestore_client()
        doc_ref = db.collection('jobs').document(job_id)
        snap = doc_ref.get()
        if snap.exists:
            return snap.to_dict()
    except Exception as e:
        logger.warning(f"Failed to load job {job_id} from Firestore: {e}")
    return None


def probe_vertex_models() -> dict[str, Any]:
    """Probes Vertex AI text and image models and returns statuses."""
    results: dict[str, Any] = {}
    from . import ai

    text_loc = os.getenv('VERTEXAI_LOCATION_TEXT', os.getenv('GOOGLE_CLOUD_LOCATION', 'global'))
    text_model = 'gemini-3.1-pro-preview'
    image_model = 'gemini-3.1-flash-image'

    try:
        client, _, auth_type = ai.get_gemini_client()
        if client:
            try:
                client.models.get(model=text_model)
                results[text_model] = {"status": "OK", "location": text_loc}
            except Exception as e:
                results[text_model] = {"status": f"FAILED: {e}", "location": text_loc}

            try:
                client.models.get(model=image_model)
                results[image_model] = {"status": "OK", "location": text_loc}
            except Exception as e:
                results[image_model] = f"FAILED: {e}"
        else:
            results[text_model] = {"status": "NO_CLIENT", "location": text_loc}
            results[image_model] = {"status": "NO_CLIENT", "location": text_loc}
    except Exception as e:
        results["error"] = str(e)

    log_line = (
        f"[STARTUP] Models in use: "
        f"text/vision='{text_model}' (location={text_loc}, probe={results.get(text_model, {}).get('status')}), "
        f"image='{image_model}' (location={text_loc}, probe={results.get(image_model, {}).get('status')})"
    )
    logger.info(log_line)
    print(log_line)
    return results
