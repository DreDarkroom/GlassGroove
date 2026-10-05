/* Wipelight Takes: render a performance to a WAV file, faster than real time, with no sound played and nothing recorded.
   The performance is re-played into an OfflineAudioContext through the same engine the instrument uses (at its best quality: 4x oversampling, the full room).
   Every sound and every knob move is scheduled at its exact time; the one setting the browser cannot automate (the bass drive curve) is changed at pauses. */
import { createAudio } from '../engine/audio.js';
import { C } from '../perf/format.js';
import { wavFile } from '../rec/wav.js';
import { zip } from '../rec/zip.js';

const SR = 48000, LEAD = 0.1, TAIL = 3, QUANTUM = 128 / SR;

/** The sounds a stem can hold. Everything else (knob moves, filter sweeps, silences, picture changes) is kept in every stem, so each one sounds as it did in the mix. */
export const STEMS = { kick: [C.kick], snare: [C.snare], hats: [C.hat], bass: [C.noteOn, C.noteOff], fx: [C.impact, C.riser, C.squeak] };
const SOUNDS = new Set(Object.values(STEMS).flat());

export async function renderWav(doc, { onStatus, stem } = {}) {
  const A = createAudio({ oversample: '4x', roomSeconds: 2.8 }), secs = doc.duration + TAIL + LEAD;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  A.attach(ctx);
  const snap = doc.snapshot || {};
  if (snap.kit && A.kits[snap.kit]) A.setKit(snap.kit);
  for (const [k, v] of Object.entries(snap.params || {})) if (typeof v === 'number') A.setParam(k, v, 0);

  const drive = new Map();                                      // quantised time -> last value (a drag makes hundreds of these)
  const at = (t) => LEAD + t;
  for (const e of doc.events) {
    if (stem && SOUNDS.has(e.code) && !STEMS[stem].includes(e.code)) continue;      // this stem leaves that sound out
    const t = at(e.t), a = e.a;
    switch (e.code) {
      case C.noteOn: A.noteOn(t, a[0], a[1], !!a[2], a[3]); break;
      case C.noteOff: A.noteOff(t); break;
      case C.kick: A.kick(t, a[0]); break;
      case C.snare: A.snare(t, a[0]); break;
      case C.hat: A.hat(t, a[0], !!a[1]); break;
      case C.param: if (a[0] === 'drive') drive.set(Math.round(t / 0.05), a[1]); else A.setParam(a[0], a[1], t); break;
      case C.sweep: A.sweep(a[0] ? 'lp' : 'hp', a[1], t, a[2]); break;
      case C.gap: A.gap(t, a[0]); break;
      case C.impact: A.impact(t, a[0]); break;
      case C.riser: A.riser(!!a[0], a[1], t); break;
      case C.kit: if (A.kitNames[a[0]]) A.setKit(A.kitNames[a[0]]); break;
      case C.squeak: A.squeak(a[0], a[1], t); break;
      default:                                                  // the picture-only events (light, scene, wipe, press, kaleido) make no sound
    }
  }
  let n = 0;
  for (const [bucket, v] of [...drive.entries()].sort((x, y) => x[0] - y[0]).slice(0, 400)) {
    const when = Math.max(QUANTUM, Math.round((bucket * 0.05) / QUANTUM) * QUANTUM);
    ctx.suspend(when).then(() => { A.setParam('drive', v); ctx.resume(); }).catch(() => {});
    n++;
  }
  if (onStatus) onStatus(`rendering ${Math.round(doc.duration)} s${n ? ` (${n} drive changes)` : ''}…`);
  const buf = await ctx.startRendering();
  return { bytes: wavFile(SR, buf.getChannelData(0), buf.getChannelData(1)), seconds: buf.duration, nodes: A.stats.nodes };
}

/** Render each part on its own (kick, snare, hats, bass, fx) and return them as one zip file. The stems do not add up to the mix exactly: the compressors act on each alone. */
export async function renderStems(doc, { onStatus, name = 'take' } = {}) {
  const files = [];
  for (const stem of Object.keys(STEMS)) {
    if (!doc.events.some((e) => STEMS[stem].includes(e.code))) continue;           // nothing of that kind in this take
    if (onStatus) onStatus(`rendering ${stem}…`);
    const r = await renderWav(doc, { stem });
    files.push({ name: `${name}-${stem}.wav`, data: r.bytes });
  }
  if (!files.length) throw new Error('there are no notes or hits to render');
  return zip(files);
}
