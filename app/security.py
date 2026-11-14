"""File upload security, size enforcement, and filetype validation."""
import os
from pathlib import Path
from fastapi import HTTPException, UploadFile

# Upload limit in MB (default 50)
MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', '50'))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

ALLOWED_AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.aac', '.ogg'}
ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm'}
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'}
ALLOWED_ASSET_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS


async def validate_and_save_upload(
    upload: UploadFile,
    dest_path: Path,
    allowed_extensions: set[str],
    max_mb: int | None = None
) -> int:
    """Validates file extension and stream-writes the file while enforcing MAX_UPLOAD_MB.
    
    Returns the total number of bytes written.
    Raises HTTPException(400) if extension invalid or file empty.
    Raises HTTPException(413) if file size exceeds limit.
    """
    if max_mb is None:
        max_mb = int(os.environ.get('MAX_UPLOAD_MB', str(MAX_UPLOAD_MB)))
    if not upload or not upload.filename:
        raise HTTPException(status_code=400, detail="No file provided or missing filename.")

    ext = Path(upload.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' is not permitted. Allowed extensions: {sorted(list(allowed_extensions))}"
        )

    max_bytes = max_mb * 1024 * 1024
    dest_path = Path(dest_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    total_bytes = 0
    chunk_size = 512 * 1024  # 512 KB chunks
    exceeded = False

    with dest_path.open('wb') as f:
        while True:
            chunk = await upload.read(chunk_size)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                exceeded = True
                break
            f.write(chunk)

    if exceeded:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum upload size of {max_mb} MB ({total_bytes} bytes received)."
        )

    if total_bytes == 0:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    return total_bytes
