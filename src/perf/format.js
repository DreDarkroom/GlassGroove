/* Glass Groove: the compact "performance" format (.sqz).
   Not audio: a recording of WHAT THE INSTRUMENT DID (every note, drum hit, knob move, light change, squeegee stroke and screen press, each with its exact time).
   The Studio and the player re-play it through the same synth and visuals, so an hour-long set is a few hundred KB, and it can be edited like data.

   File = JSON, gzip-compressed when the browser supports it (auto-detected on load, so both work).
   { app, kind:"performance", version:2, created, duration (s), unit:"0.1ms", snapshot:{...the loop at the start...}, events:[[dt, code, ...args], ...] }
   dt = time since the previous event in 0.1 ms units.
   Codes: 0 noteOn(midi,vel,accent,baseHz)  1 noteOff  2 kick(vel)  3 snare(vel)  4 hat(vel,open)  5 param(key,value)
          6 (retired: the old "exposure" riser; version-1 files are converted on load)  7 light(i)  8 wipe(x,y,px,py[,size])  9 kaleido(n)
          10 squeak(speed,x)  11 sweep(0=hp|1=lp, toHz, seconds)  12 gap(seconds)  13 impact(size)  14 riser(on, variant)  15 kit(index)  16 scene(index)
          17 press(x, y, id, force)   <- new: a screen or button press, which feeds the picture
   Pure logic: no browser-only APIs except CompressionStream (present in browsers and Node 18+). */
import { CONFIG, isOurs } from '../config.js';

export const C = { noteOn: 0, noteOff: 1, kick: 2, snare: 3, hat: 4, param: 5, expose: 6, light: 7, wipe: 8, kaleido: 9, squeak: 10, sweep: 11, gap: 12, impact: 13, riser: 14, kit: 15, scene: 16, press: 17 };
export const MAX_CODE = 17;
export const VERSION = 2;
export const UNIT = 10000;                                               // ticks per second (0.1 ms)
const MAX_EVENTS = 3000000;
// codes that carry a future audio time (the rest happen "now")
const SCHEDULED = new Set([C.noteOn, C.noteOff, C.kick, C.snare, C.hat, C.sweep, C.gap, C.impact, C.riser]);
// A Map, not a plain object: a hostile file naming a parameter "__proto__" or "constructor" must not match anything.
export const PARAM_RANGE = new Map(Object.entries({ cutoff: [0, 1], reso: [0, 1], decay: [0, 1], drive: [0, 1], glide: [0, 1], space: [0, 1], tempo: [60, 200], mod: [0, 1], level: [0, 1], duck: [0, 1], root: [24, 72], kickDb: [-24, 12], snareDb: [-24, 12], hatDb: [-24, 12], bassDb: [-24, 12] }));
const r2 = (v) => Math.round(v * 100) / 100;

/* ---------------- recording ---------------- */
export function createRecorder() {
  let rec = null;
  return {
    get active() { return !!rec; },
    start(nowAbs, snapshot) { rec = { t0: nowAbs, snapshot, ev: [] }; },
    /** tAbs = the audio-clock time the event happens at; for scheduled sounds that is in the future. */
    log(tAbs, code, ...args) {
      if (rec && rec.ev.length < MAX_EVENTS) rec.ev.push([Math.max(0, tAbs - rec.t0), code, ...args]);
    },
    stop(nowAbs) {
      if (!rec) return null;
      const ev = rec.ev.map((e, i) => [e, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map((x) => x[0]);
      const doc = toDoc({ snapshot: rec.snapshot, events: ev.map(([t, code, ...a]) => ({ t, code, a })), duration: Math.max(0, nowAbs - rec.t0) });
      rec = null;
      return doc;
    },
  };
}

/** Events [{t (s), code, a:[...]}, ...] (sorted) -> a file document. Also used by the Studio after an edit. */
export function toDoc({ snapshot, events, duration, created }) {
  let prev = 0;
  const packed = events.map((e) => {
    const ticks = Math.round(e.t * UNIT), out = [ticks - prev, e.code, ...e.a];
    prev = ticks;
    return out;
  });
  const last = events.length ? events[events.length - 1].t : 0;
  return { app: CONFIG.app, kind: 'performance', version: VERSION, created: created || new Date().toISOString(), duration: r2(Math.max(duration || 0, last)), unit: '0.1ms', snapshot: snapshot || {}, events: packed };
}

/* ---------------- file encoding ---------------- */
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function encode(doc) {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  try { return { bytes: await pipe(bytes, new CompressionStream('gzip')), gzip: true }; } catch (err) { return { bytes, gzip: false }; }   // plain JSON still loads everywhere
}

/** bytes (gzip or plain JSON) -> validated, expanded performance {duration, snapshot, events:[{t, code, a:[...]}]} */
export async function decode(bytes) {
  let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) u8 = await pipe(u8, new DecompressionStream('gzip'));
  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(u8)); } catch (err) { throw new Error('not a performance file'); }
  return validate(doc);
}

const inSet = (v, set) => set.includes(v);
const between = (v, lo, hi) => v >= lo && v <= hi;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Per-code argument checks. Return the cleaned args, or null to drop the event. Hostile or junk values never get through. */
const CHECK = {
  [C.param]: (a) => { const r = PARAM_RANGE.get(a[0]); return r && typeof a[1] === 'number' ? [a[0], Math.min(r[1], Math.max(r[0], a[1]))] : null; },
  [C.light]: (a) => (inSet(a[0], [0, 1, 2]) ? a : null),
  [C.kaleido]: (a) => (inSet(a[0], [6, 8, 10, 12]) ? a : null),
  [C.sweep]: (a) => (inSet(a[0], [0, 1]) && between(a[1], 10, 20000) && between(a[2], 0, 60) ? a : null),
  [C.gap]: (a) => (between(a[0], 0, 2) ? a : null),
  [C.impact]: (a) => (between(a[0], 0, 3) ? a : null),
  [C.riser]: (a) => (inSet(a[0], [0, 1]) && inSet(a[1], [0, 1]) ? a : null),
  [C.kit]: (a) => (isInt(a[0], 0, 4) ? a : null),
  [C.scene]: (a) => (isInt(a[0], 0, 4) ? a : null),
  [C.press]: (a) => (between(a[0], 0, 1) && between(a[1], 0, 1) && isInt(a[2], 0, 4294967295) && between(a[3] ?? 1, 0, 2) ? [a[0], a[1], a[2], a[3] ?? 1] : null),
};

export function validate(doc) {
  if (!doc || !isOurs(doc) || doc.kind !== 'performance' || !Array.isArray(doc.events)) throw new Error('not a performance file');
  if (doc.version !== 1 && doc.version !== 2) throw new Error('this performance was made by a newer version');
  if (doc.events.length > MAX_EVENTS) throw new Error('performance is too large');
  const out = [];
  let ticks = 0;
  for (const e of doc.events) {
    if (!Array.isArray(e) || e.length < 2 || !Number.isFinite(e[0]) || e[0] < 0 || !Number.isInteger(e[1])) continue;
    ticks += e[0];
    let a = e.slice(2), code = e[1];
    if (!a.every((x) => (typeof x === 'number' ? Number.isFinite(x) : typeof x === 'string'))) continue;
    if (code < 0 || code > MAX_CODE) continue;
    const t = ticks / UNIT;
    if (code === C.expose) {                                    // version 1's "exposure" riser: now a plain lift riser, with the hit on release
      if (a[0]) out.push({ t, code: C.riser, a: [1, 0] });
      else out.push({ t, code: C.riser, a: [0, 0] }, { t, code: C.impact, a: [1] });
      continue;
    }
    if (CHECK[code]) { a = CHECK[code](a); if (!a) continue; }
    out.push({ t, code, a });
  }
  const last = out.length ? out[out.length - 1].t : 0;
  return { duration: Math.max(Number(doc.duration) || 0, last), snapshot: doc.snapshot || {}, events: out, created: doc.created };
}

/* ---------------- playback scheduling (pure, so it is unit-tested) ---------------- */

/** state at time t: the last value of every parameter, the light, kaleidoscope, kit and scene. */
export function stateAt(events, t) {
  const st = { params: {}, light: null, kaleido: null, kit: null, scene: null };
  for (const e of events) {
    if (e.t > t) break;
    if (e.code === C.param) st.params[e.a[0]] = e.a[1];
    else if (e.code === C.light) st.light = e.a[0];
    else if (e.code === C.kaleido) st.kaleido = e.a[0];
    else if (e.code === C.kit) st.kit = e.a[0];
    else if (e.code === C.scene) st.scene = e.a[0];
  }
  return st;
}

export function indexAt(events, t) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Hand out every event that is due; returns the new index. `T0` maps performance time to audio-clock time (audio time = T0 + e.t).
 * Sounds are dispatched up to `lookahead` seconds early with their exact time; everything else when it is due.
 */
export function pump(events, idx, now, T0, handlers, lookahead = 0.18, lead = 0.03) {
  while (idx < events.length) {
    const e = events[idx], at = T0 + e.t;
    if (SCHEDULED.has(e.code) ? at >= now + lookahead : at > now + lead) break;
    const h = handlers[e.code];
    if (h) h(at, ...e.a);
    idx++;
  }
  return idx;
}
