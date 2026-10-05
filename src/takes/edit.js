/* Glass Groove Takes: editing a performance. Pure functions on a list of events [{id, t, code, a}] (sorted by t), so they can be tested without a browser.
   Every function returns a NEW list (the old one stays valid: that is the undo history). Selections are Sets of event ids. */
import { C } from '../perf/format.js';

export const AUDIO_CODES = new Set([C.noteOn, C.noteOff, C.kick, C.snare, C.hat, C.param, C.sweep, C.gap, C.impact, C.riser, C.kit, C.squeak]);
export const STATE_CODES = new Set([C.param, C.light, C.kaleido, C.kit, C.scene]);

/** Give every event a stable id (so a selection survives edits that re-sort). */
export function withIds(events) { return events.map((e, i) => ({ ...e, id: e.id ?? i + 1 })); }
let nextId = 1e9;
const fresh = (e) => ({ ...e, id: nextId++ });
const byTime = (a, b) => a.t - b.t || a.id - b.id;
export const sorted = (events) => events.slice().sort(byTime);

export const remove = (events, sel) => events.filter((e) => !sel.has(e.id));

/** Move the selected events by dt seconds (never before 0). Returns the new list. */
export function move(events, sel, dt) {
  const first = events.reduce((m, e) => (sel.has(e.id) && e.t < m ? e.t : m), Infinity);
  const d = Math.max(dt, -first);                                            // do not push anything before the start
  return sorted(events.map((e) => (sel.has(e.id) ? { ...e, t: e.t + d } : e)));
}

/** Snap the selected events (or all, if none are selected) to a grid of `step` seconds. `amount` 0..1 = how far to pull each one toward the grid. */
export function quantise(events, sel, step, amount = 1) {
  if (!(step > 0)) return events;
  const all = !sel || !sel.size;
  return sorted(events.map((e) => {
    if ((!all && !sel.has(e.id)) || !(e.code === C.noteOn || e.code === C.noteOff || e.code === C.kick || e.code === C.snare || e.code === C.hat)) return e;
    const target = Math.round(e.t / step) * step;
    return { ...e, t: Math.max(0, e.t + (target - e.t) * amount) };
  }));
}

/** Transpose the selected notes by semitones (notes only; clamped to the MIDI range). */
export function transpose(events, sel, semis) {
  return events.map((e) => (sel.has(e.id) && e.code === C.noteOn ? { ...e, a: [Math.min(127, Math.max(0, e.a[0] + semis)), ...e.a.slice(1)] } : e));
}

/** Scale the velocity of the selected notes and drum hits (a = [..., vel, ...]: the first argument for drums, the second for notes). */
export function velocity(events, sel, factor) {
  const cl = (v) => Math.min(1, Math.max(0.05, v * factor));
  return events.map((e) => {
    if (!sel.has(e.id)) return e;
    if (e.code === C.noteOn) return { ...e, a: [e.a[0], Math.round(cl(e.a[1]) * 100) / 100, ...e.a.slice(2)] };
    if (e.code === C.kick || e.code === C.snare || e.code === C.hat) return { ...e, a: [Math.round(cl(e.a[0]) * 100) / 100, ...e.a.slice(1)] };
    return e;
  });
}

export function insert(events, ev) { return sorted([...events, fresh(ev)]); }

/** Duplicate the selection, `offset` seconds later. Returns { events, ids } with the ids of the copies. */
export function duplicate(events, sel, offset) {
  const copies = events.filter((e) => sel.has(e.id)).map((e) => fresh({ ...e, t: e.t + offset }));
  return { events: sorted([...events, ...copies]), ids: new Set(copies.map((c) => c.id)) };
}

/** The settings in force at time t, as events at time 0 (so a trimmed take starts with the right sound, light and picture). */
function carry(events, t) {
  const last = new Map();
  for (const e of events) {
    if (e.t > t) break;
    if (STATE_CODES.has(e.code)) last.set(e.code === C.param ? `p:${e.a[0]}` : String(e.code), e);
  }
  return [...last.values()].map((e) => fresh({ ...e, t: 0 }));
}

/** Keep only [t0, t1]: everything shifted so t0 becomes 0, with the earlier state carried over. A note still sounding at t0 is dropped; so is a build under way. */
export function trim(events, t0, t1) {
  const inside = events.filter((e) => e.t >= t0 && e.t <= t1).map((e) => ({ ...e, t: e.t - t0 }));
  const firstOn = inside.findIndex((e) => e.code === C.noteOn), firstOff = inside.findIndex((e) => e.code === C.noteOff);
  const dropOrphanOff = firstOff >= 0 && (firstOn < 0 || firstOff < firstOn) ? [inside[firstOff].id] : [];     // a note-off whose note began before t0
  const prior = t0 > 0 ? carry(events, t0) : [];
  const body = inside.filter((e) => !dropOrphanOff.includes(e.id));
  return { events: sorted([...prior, ...body]), duration: Math.max(0, t1 - t0) };
}

/** Remove [t0, t1] and close the gap (a ripple delete). */
export function cut(events, t0, t1) {
  const gap = t1 - t0;
  return sorted(events.filter((e) => e.t < t0 || e.t >= t1).map((e) => (e.t >= t1 ? { ...e, t: e.t - gap } : e)));
}

/** Notes as bars for drawing: [{ id, t, end, midi, vel }]. A note ends at the next note-off, or when the next note begins. */
export function noteBars(events) {
  const bars = [];
  let open = null;
  for (const e of events) {
    if (e.code === C.noteOn) { if (open) open.end = Math.min(open.end, e.t); open = { id: e.id, t: e.t, end: Infinity, midi: e.a[0], vel: e.a[1] }; bars.push(open); }
    else if (e.code === C.noteOff && open) { open.end = Math.min(open.end, e.t); open = null; }
  }
  const last = events.length ? events[events.length - 1].t : 0;
  for (const b of bars) if (!isFinite(b.end)) b.end = Math.min(last, b.t + 0.5);
  return bars;
}

/** The tempo to draw a beat grid from: the last tempo event before t, else the snapshot's, else 119. */
export function tempoAt(events, snapshot, t = Infinity) {
  let tempo = snapshot && snapshot.params && snapshot.params.tempo ? snapshot.params.tempo : 119;
  for (const e of events) { if (e.t > t) break; if (e.code === C.param && e.a[0] === 'tempo') tempo = e.a[1]; }
  return tempo;
}

/** How long the take is: the last event, or the stated duration, whichever is later. */
export const lengthOf = (events, duration = 0) => Math.max(duration, events.length ? events[events.length - 1].t : 0);

export const COUNT_BY_CODE = (events) => {
  const n = {};
  for (const e of events) n[e.code] = (n[e.code] || 0) + 1;
  return n;
};
