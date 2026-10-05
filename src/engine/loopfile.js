/* Wipelight: loops and clips as small files. A loop is a JSON snapshot: kept in the browser, or exported / imported.
   Everything is checked BEFORE anything changes, so a bad file can never half-load. */
import { CONFIG, isOurs } from '../config.js';
import { clamp, store } from '../util.js';
import { timed } from '../events.js';

const PARAMS = { cutoff: [0, 1], reso: [0, 1], decay: [0, 1], drive: [0, 1], glide: [0, 1], space: [0, 1], tempo: [60, 200], level: [0, 1], duck: [0, 1], root: [24, 72], kickDb: [-24, 12], snareDb: [-24, 12], hatDb: [-24, 12], bassDb: [-24, 12] };
/** 'loop' (everything), 'pattern' (bass line), 'drums' (the three rings), 'sound' (knobs, kit, light, swing, drift, tempo) */
export const KINDS = ['loop', 'pattern', 'drums', 'sound'];
const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : null);

export function snapshot(S, A, kind = 'loop') {
  const o = { app: CONFIG.app, version: 1, kind };
  if (kind === 'loop' || kind === 'pattern') o.pattern = S.synth.pattern.slice();
  if (kind === 'loop' || kind === 'drums') o.drummers = S.drummers.map((d) => ({ len: d.len, hits: d.hits, rot: d.rot, steps: d.steps.slice() }));
  if (kind === 'loop' || kind === 'sound') {
    Object.assign(o, { light: S.light, swing: S.swing, drift: S.drift, kit: A.kitName, scene: S.scene, dnb: S.dnb });
    o.params = Object.keys(PARAMS).reduce((acc, k) => ((acc[k] = A.params[k]), acc), {});
  }
  return o;
}

/** Applies a snapshot. Returns false if it isn't a usable loop of the kind it claims to be (older files with no kind are full loops). */
export function applySnapshot(S, A, j) {
  if (!j || typeof j !== 'object') return false;
  const kind = j.kind || 'loop';
  if (!KINDS.includes(kind)) return false;
  const wantPattern = kind === 'loop' || kind === 'pattern', wantDrums = kind === 'loop' || kind === 'drums', wantSound = kind === 'loop' || kind === 'sound';
  let p = null;
  if (wantPattern) {
    if (!(Array.isArray(j.pattern) && j.pattern.length === 16 && j.pattern.every((n) => Number.isInteger(n) && n >= -1 && n <= 7))) return false;
    p = j.pattern.slice();
  }
  if (wantDrums && (!Array.isArray(j.drummers) || j.drummers.length !== 3)) return false;
  if (wantSound && !j.params && !('swing' in j) && !('drift' in j) && !('light' in j)) return false;

  if (wantPattern) { S.synth.pattern = p; S.home = p.slice(); }
  if (wantDrums) {
    j.drummers.forEach((s, i) => {
      const d = S.drummers[i];
      if (s && Number.isInteger(s.len) && s.len >= 4 && s.len <= 32 && Array.isArray(s.steps) && s.steps.length === s.len) {
        d.len = s.len; d.hits = clamp(s.hits | 0, 0, s.len); d.rot = clamp(s.rot | 0, 0, s.len - 1); d.steps = s.steps.map(Boolean);
      }
    });
  }
  if (wantPattern || wantDrums) S.ghosts = [];
  if (wantSound) {
    if (S.lights[j.light]) S.light = j.light;
    const sw = num(j.swing, 0, 0.5), dr = num(j.drift, 0, 1);
    if (sw != null) S.swing = sw;
    if (dr != null) S.drift = dr;
    if (typeof j.kit === 'string' && Object.prototype.hasOwnProperty.call(A.kits, j.kit)) A.setKit(j.kit);
    if (Number.isInteger(j.scene) && j.scene >= 0 && j.scene <= 4) S.scene = j.scene;
    if (typeof j.dnb === 'boolean') S.dnb = j.dnb;
    for (const k in PARAMS) { const v = num(j.params && j.params[k], PARAMS[k][0], PARAMS[k][1]); if (v != null) A.setParam(k, v); }
  }
  return true;
}

export const saveLoop = (S, A) => { const ok = store.set('loop', snapshot(S, A)); if (ok) S.home = S.synth.pattern.slice(); return ok; };
export const loadLoop = (S, A) => { const j = store.get('loop'); return j ? applySnapshot(S, A, j) : false; };

/* ---- clips ---- */
export function clipToJSON(S, A, part) {
  const c = S.clips[part];
  if (!c) return null;
  return { app: CONFIG.app, kind: 'clip', version: 1, part, bars: c.bars, bpm: Math.round(c.bpm * 10) / 10, swing: S.swing, kit: A.kitName, events: c.events.map((e) => e.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x))) };
}

/** Validate and load a clip (from a dropped file). Returns the part, or null if it isn't a usable clip. */
export function loadClip(S, A, j, opts = {}) {
  if (!j || !isOurs(j) || j.kind !== 'clip' || j.version !== 1) return null;
  if (!['drums', 'bass'].includes(j.part) || ![1, 2, 4, 8, 16].includes(j.bars) || !Array.isArray(j.events) || j.events.length > 8192) return null;
  const len = j.bars * 16, ok = [];
  for (const e of j.events) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] >= len || !e.every((x) => typeof x === 'number' && isFinite(x))) continue;
    const code = e[1], drum = code === 0 || code === 1 || code === 2;
    if (j.part === 'drums' ? !drum : code !== 3) continue;
    if (code === 3 ? e.length < 6 || e[2] < 0 || e[2] > 127 : e.length < 3) continue;
    ok.push(e.slice());
  }
  if (!ok.length) return null;
  const c = S.makeClip(j.part, j.bars, ok);
  c.bpm = typeof j.bpm === 'number' ? j.bpm : A.params.tempo;
  S.clips[j.part] = c;
  if (opts.play !== false) { c.active = true; c.startTick = S.playing ? S.nextBoundary('bar') : 0; }
  timed.push(A.now(), 'clipDone', j.part, j.bars);
  return j.part;
}
