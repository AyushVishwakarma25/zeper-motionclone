// node state-dump.mjs layered.json <frames> <out.json>
// Writes the per-frame world state of a layered scene so app/scene_check.py can validate it. Same code as the renderer.
import fs from 'node:fs';
import {dumpState} from './src/layered.mjs';

const [file, frames, out] = process.argv.slice(2);
if (!file || !frames || !out) { console.error('usage: node state-dump.mjs layered.json frames out.json'); process.exit(2); }
const layered = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.writeFileSync(out, JSON.stringify(dumpState(layered, Number(frames), null, layered.world?.h || 1920)));
