import React, {useState} from 'react';
import {Img, OffthreadVideo, staticFile} from 'remotion';

/**
 * Normalizes any asset string (relative path, dashboard URL, staticFile reference)
 * into a safe, valid URI for Remotion's staticFile server or external http URL.
 */
export function resolveAssetSrc(asset) {
  if (!asset || typeof asset !== 'string' || asset.trim() === '') return null;
  const trimmed = asset.trim();

  // Already fully-qualified http/https or data URI
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Handle dashboard media paths like /media/6da8384aa1d6/assets/foo.png
  let clean = trimmed.replace(/^\/+/, '');
  if (clean.includes('/assets/')) {
    clean = 'assets/' + clean.split('/assets/').pop();
  } else if (clean.startsWith('public/')) {
    clean = clean.replace(/^public\//, '');
  }

  try {
    return staticFile(clean);
  } catch (err) {
    console.warn('Failed to resolve staticFile for asset:', asset, err);
    return null;
  }
}

/**
 * Checks whether an asset is a video format.
 */
export function isVideoAsset(src) {
  if (!src || typeof src !== 'string') return false;
  return /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(src);
}

/**
 * SafeAsset Component:
 * Wraps Remotion's <Img> and <OffthreadVideo> with fail-safe error handling.
 * NEVER allows Remotion's cancelRender() to crash the render on missing, 404, or corrupt media.
 */
export function SafeAsset({
  src,
  style,
  fallback = null,
  accent = '#00f2fe'
}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveAssetSrc(src);

  if (!resolved || failed) {
    return fallback || (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        background: 'linear-gradient(135deg, #12141e 0%, #1a1e2e 100%)',
        color: accent,
        fontSize: '14px',
        fontWeight: 600,
        gap: '8px',
        padding: '20px',
        boxSizing: 'border-box',
        textAlign: 'center'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: `${accent}18`,
          border: `1.5px solid ${accent}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px'
        }}>
          📱
        </div>
        <span>Interactive Preview Workspace</span>
      </div>
    );
  }

  if (isVideoAsset(resolved)) {
    return (
      <OffthreadVideo
        src={resolved}
        style={style}
        onError={(e) => {
          console.warn('SafeAsset OffthreadVideo load error for:', resolved, e);
          setFailed(true);
        }}
      />
    );
  }

  return (
    <Img
      src={resolved}
      style={style}
      onError={(e) => {
        // Intercept error so Remotion DOES NOT trigger cancelRender()
        console.warn('SafeAsset Img load error (handled safely) for:', resolved);
        setFailed(true);
      }}
    />
  );
}

export default SafeAsset;
