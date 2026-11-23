import React, {useState} from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {cameraAt, mouthAt, plateTransform, toScreen, worldState} from '../layered.mjs';
import {resolveAssetSrc} from './SafeAsset';

/**
 * LAYERED_ASSET_SCENE: composites generated transparent assets (app/asset_studio.py) over a three-plate set.
 * Nothing here draws a prop. Positions come from layered.mjs, so what is rendered is exactly what
 * app/scene_check.py validated. A missing asset renders a loud red marker, never a pretty placeholder.
 *
 * `extras` lets other layers hook an object, e.g. { hero: ({box, state, frame}) => <MouthLayer .../> } (lip sync).
 */
function Asset({src, style, id}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveAssetSrc(src);
  if (!resolved || failed) {
    return (
      <div style={{...style, background: 'rgba(255,0,0,.35)', border: '3px solid #f00', color: '#fff', fontSize: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>MISSING ASSET {id}</div>
    );
  }
  return <Img src={resolved} style={style} onError={() => setFailed(true)} />;
}

function Plate({src, tf, world, id}) {
  if (!src) return null;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: world.w, height: world.h,
      transformOrigin: '0 0', transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`}}>
      <Asset src={src} id={id} style={{width: world.w, height: world.h, display: 'block'}} />
    </div>
  );
}

export function LayeredScene({layered, extras = {}, accent = '#00f2fe', bg = '#10121a'}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const view = {w: width, h: height};
  const world = layered.world || {w: width, h: height};
  const cam = cameraAt(layered.camera, frame, world);
  const par = {far: .85, mid: 1, near: 1.15, ...(layered.parallax || {})};
  const plates = layered.plates || {};
  const items = worldState(layered, frame).filter(o => o.class !== 'surface' && o.asset)
    .sort((a, b) => a.z - b.z);
  const shadow = layered.shadow || {opacity: .28, color: '#1a1008', squash: .16};

  return (
    <AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
      <Plate src={plates.far} id="far" world={world} tf={plateTransform(cam, view, world, par.far)} />
      <Plate src={plates.mid} id="mid" world={world} tf={plateTransform(cam, view, world, par.mid)} />
      {items.map(o => {
        const b = toScreen(o, cam, view, 1);
        const grounded = !!o.support && !o.held_by;
        return (
          <React.Fragment key={o.id}>
            {grounded && (
              <div style={{position: 'absolute', left: b.x - b.w * .55, top: b.y - b.w * shadow.squash * .5,
                width: b.w * 1.1, height: b.w * shadow.squash, borderRadius: '50%',
                background: shadow.color, opacity: shadow.opacity, zIndex: o.z - 0.5}} />
            )}
            <div style={{position: 'absolute', left: b.x - b.w / 2, top: b.y - b.h, width: b.w, height: b.h, zIndex: o.z,
              transformOrigin: '50% 100%', transform: o.rot ? `rotate(${o.rot}deg)` : undefined}}>
              <Asset src={o.asset} id={o.id} style={{width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
              {o.mouth && layered.mouth_tracks && layered.mouth_tracks[o.id] ? (() => {
                // MOUTH PER FRAME: one of nine drawings on every frame, swapped (never scaled by volume)
                const m = o.mouth, z = b.w / o.w;
                const shape = mouthAt(layered.mouth_tracks[o.id], frame);
                return <Asset src={`${m.dir}/mouth_${shape}.png`} id={`${o.id}.mouth_${shape}`}
                  style={{position: 'absolute', left: b.w / 2 + m.anchor[0] * z - m.w * z / 2, top: b.h + m.anchor[1] * z - m.h * z / 2,
                    width: m.w * z, height: m.h * z, objectFit: 'contain'}} />;
              })() : null}
              {extras[o.id] ? extras[o.id]({box: b, state: o, frame}) : null}
            </div>
          </React.Fragment>
        );
      })}
      <Plate src={plates.near} id="near" world={world} tf={plateTransform(cam, view, world, par.near)} />
    </AbsoluteFill>
  );
}

export default LayeredScene;
