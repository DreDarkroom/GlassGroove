import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './compat.js';

/* ============================== WAV ============================== */
test('wav header is a valid 24-bit stereo PCM header', () => {
  const { wav } = load('wav.js');
  const h = wav.header(48000, 2, 24, 480000);
  const dv = new DataView(h.buffer);
  const tag = (o) => String.fromCharCode(...h.slice(o, o + 4));
  assert.equal(h.length, 44);
  assert.deepEqual([tag(0), tag(8), tag(12), tag(36)], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.equal(dv.getUint32(4, true), 36 + 480000);
  assert.equal(dv.getUint16(20, true), 1);          // PCM
  assert.equal(dv.getUint16(22, true), 2);          // channels
  assert.equal(dv.getUint32(24, true), 48000);      // sample rate
  assert.equal(dv.getUint32(28, true), 48000 * 6);  // byte rate
  assert.equal(dv.getUint16(32, true), 6);          // block align
  assert.equal(dv.getUint16(34, true), 24);         // bits
  assert.equal(dv.getUint32(40, true), 480000);
});

test('pcm24 round-trips a sine within one 24-bit step and never wraps when clipping', () => {
  const { wav } = load('wav.js');
  const n = 1000, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = Math.sin(i / 7) * 0.9; r[i] = -l[i]; }
  const pcm = wav.pcm24(l, r);
  assert.equal(pcm.length, n * 6);
  const read = (o) => { let v = pcm[o] | (pcm[o + 1] << 8) | (pcm[o + 2] << 16); if (v & 0x800000) v -= 0x1000000; return v / 8388608; };
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(read(i * 6) - l[i]) < 2 / 8388608, 'left');
    assert.ok(Math.abs(read(i * 6 + 3) - r[i]) < 2 / 8388608, 'right');
  }
  const hot = wav.pcm24(new Float32Array([5, -5, 1, -1]), new Float32Array([0, 0, 0, 0]));
  const s = (o) => { let v = hot[o] | (hot[o + 1] << 8) | (hot[o + 2] << 16); return v & 0x800000 ? v - 0x1000000 : v; };
  assert.equal(s(0), 8388607);        // +5 clipped to full scale, not wrapped negative
  assert.equal(s(6), -8388608);       // -5 clipped
});

test('a rendered buffer becomes a finished WAV file', () => {
  const { wav } = load();
  const f = wav.wavFile(48000, new Float32Array([0, 1, -1, 0.5]), new Float32Array([0.5, -0.5, 0, 2]));
  assert.equal(f.length, 44 + 4 * 6);
  assert.equal(new DataView(f.buffer).getUint32(40, true), 24, 'the data chunk says how long it is');
  assert.equal(String.fromCharCode(...f.slice(0, 4)) + String.fromCharCode(...f.slice(8, 12)), 'RIFFWAVE');
});

/* ============================== Performance format ============================== */
const C = () => load('perfrec.js').perf.CODES;

function sample() {
  const SS = load('perfrec.js');
  const perf = SS.perf;
  perf.start(100, { app: 'SquidgySqueegee', kind: 'loop', light: 1 });
  perf.log(100.5, 2, 0.95);                 // kick
  perf.log(100.0, 5, 'tempo', 119);         // out of order on purpose
  perf.log(100.25, 0, 45, 0.9, 1, 812.5);   // note
  perf.log(101.0, 8, 0.1, 0.2, 0.15, 0.25); // wipe
  perf.log(102.0, 7, 2);                    // light
  const doc = perf.stop(105.5);
  return { perf, doc };
}

test('recording sorts events, delta-encodes them and reports the duration', () => {
  const { perf, doc } = sample();
  assert.equal(perf.active, false);
  assert.equal(doc.kind, 'performance');
  assert.equal(doc.duration, 5.5);
  assert.deepEqual(doc.events.map((e) => e[1]), [5, 0, 2, 8, 7]);          // time order
  assert.deepEqual(doc.events.map((e) => e[0]), [0, 2500, 2500, 5000, 10000]); // 0.1 ms deltas
});

test('encode -> decode round-trips exactly (gzip)', async () => {
  const { perf, doc } = sample();
  const enc = await perf.encode(doc);
  assert.equal(enc.gzip, true);
  assert.equal(enc.bytes[0], 0x1f);
  assert.equal(enc.bytes[1], 0x8b);
  const back = await perf.decode(enc.bytes);
  assert.equal(back.duration, 5.5);
  assert.deepEqual(back.events.map((e) => [e.t, e.code, ...e.a]), [
    [0, 5, 'tempo', 119], [0.25, 0, 45, 0.9, 1, 812.5], [0.5, 2, 0.95], [1, 8, 0.1, 0.2, 0.15, 0.25], [2, 7, 2],
  ]);
});

test('plain (uncompressed) JSON also loads', async () => {
  const { perf, doc } = sample();
  const back = await perf.decode(new TextEncoder().encode(JSON.stringify(doc)));
  assert.equal(back.events.length, 5);
});

test('an hour of typical output stays compact', async () => {
  const { perf } = load('perfrec.js');
  perf.start(0, {});
  const step = 60 / 119 / 4;
  for (let i = 0; i < 8 * 3600 * 0.99; i++) {
    const t = i * step;
    if (i % 4 === 0) perf.log(t, 2, 0.95);
    if (i % 3 === 0) perf.log(t, 3, 0.8);
    if (i % 2 === 1) perf.log(t, 4, 0.35, 0);
    if (i % 16 !== 5) { perf.log(t, 0, 45 + (i % 8), 0.62, 0, 300 + (i % 50)); perf.log(t + step * 0.8, 1); }
  }
  const doc = perf.stop(3600);
  const enc = await perf.encode(doc);
  console.log(`      one hour: ${doc.events.length} events -> ${(enc.bytes.length / 1024).toFixed(0)} KB gzipped`);
  assert.ok(enc.bytes.length < 1.5 * 1024 * 1024, `gzip size ${enc.bytes.length}`);
  assert.ok(doc.events.length > 50000);
});

test('hostile or damaged files are rejected or cleaned, never trusted', async () => {
  const { perf } = load('perfrec.js');
  const bad = (o) => perf.decode(new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o)));
  await assert.rejects(bad('not json'), /not a performance/);
  await assert.rejects(bad({ app: 'other', kind: 'performance', events: [] }), /not a performance/);
  await assert.rejects(bad({ app: 'SquidgySqueegee', kind: 'loop', events: [] }), /not a performance/);
  await assert.rejects(bad({ app: 'SquidgySqueegee', kind: 'performance', version: 99, events: [] }), /newer/);
  const cleaned = await bad({
    app: 'SquidgySqueegee', kind: 'performance', version: 1, duration: 'x', events: [
      [0, 5, '__proto__', 1],          // unknown parameter names are dropped, including ones that exist on every object
      [0, 5, 'constructor', 1],
      [0, 5, 'toString', 1],
      [0, 5, 'cutoff', 99],            // out of range: clamped to 1
      [-5, 2, 1],                      // negative time: dropped
      [1, 99],                         // unknown code: dropped
      [1, 7, 7],                       // light that does not exist: dropped
      [1, 9, 7],                       // kaleidoscope count that does not exist: dropped
      'garbage', null, [1],
      [1, 2, 0.5],                     // a valid kick
    ],
  });
  assert.deepEqual(cleaned.events.map((e) => [e.code, ...e.a]), [[5, 'cutoff', 1], [2, 0.5]]);
});

test('pump hands out sounds early with exact times and everything else when due', () => {
  const { perf } = load('perfrec.js');
  const K = perf.CODES;
  const events = [
    { t: 0.0, code: K.kick, a: [1] },
    { t: 0.1, code: K.light, a: [1] },
    { t: 0.15, code: K.noteOn, a: [45, 0.9, 1, 500] },
    { t: 0.5, code: K.snare, a: [0.8] },
  ];
  const got = [];
  const h = { [K.kick]: (at) => got.push(['kick', at]), [K.light]: (at) => got.push(['light', at]), [K.noteOn]: (at) => got.push(['note', at]), [K.snare]: (at) => got.push(['snare', at]) };
  let idx = perf.pump(events, 0, 10.0, 10.0, h);         // now = T0: kick due, others wait? lookahead 0.18 lets nothing but kick
  assert.deepEqual(got, [['kick', 10.0]]);
  assert.equal(idx, 1);
  idx = perf.pump(events, idx, 10.05, 10.0, h);          // light not due yet (10.1 > 10.05 + 0.03)
  assert.equal(idx, 1);
  idx = perf.pump(events, idx, 10.08, 10.0, h);          // light now within the 0.03 lead; note (10.15) < 10.08 + 0.18
  assert.deepEqual(got.map((g) => g[0]), ['kick', 'light', 'note']);
  assert.equal(got[2][1], 10.15);
  idx = perf.pump(events, idx, 10.4, 10.0, h);
  assert.deepEqual(got.map((g) => g[0]), ['kick', 'light', 'note', 'snare']);
  assert.equal(idx, 4);
});

test('stateAt and indexAt support seeking', () => {
  const { perf } = load('perfrec.js');
  const K = perf.CODES;
  const events = [
    { t: 1, code: K.param, a: ['cutoff', 0.2] }, { t: 2, code: K.param, a: ['cutoff', 0.7] },
    { t: 3, code: K.light, a: [2] }, { t: 4, code: K.scene, a: [4] }, { t: 5, code: K.kaleido, a: [12] },
  ];
  const st = perf.stateAt(events, 4.5);
  assert.deepEqual([st.params.cutoff, st.light, st.scene, st.kaleido], [0.7, 2, 4, null]);
  assert.equal(perf.indexAt(events, 0), 0);
  assert.equal(perf.indexAt(events, 3), 2);
  assert.equal(perf.indexAt(events, 3.01), 3);
  assert.equal(perf.indexAt(events, 99), 5);
});

/* ============================== Loop files ============================== */
function seqWorld() {
  const SS = load('audio.js', 'seq.js');
  return { S: SS.seq, A: SS.audio };
}

test('snapshots contain only what their kind promises', () => {
  const { S } = seqWorld();
  assert.deepEqual(Object.keys(S.snapshot('pattern')).sort(), ['app', 'kind', 'pattern', 'version']);
  assert.deepEqual(Object.keys(S.snapshot('drums')).sort(), ['app', 'drummers', 'kind', 'version']);
  assert.deepEqual(Object.keys(S.snapshot('sound')).sort(), ['app', 'dnb', 'drift', 'kind', 'kit', 'light', 'params', 'scene', 'swing', 'version']);
  assert.deepEqual(Object.keys(S.snapshot('loop')).sort(), ['app', 'dnb', 'drift', 'drummers', 'kind', 'kit', 'light', 'params', 'pattern', 'scene', 'swing', 'version']);
});

test('a full loop round-trips and old files with no kind still load', () => {
  const { S } = seqWorld();
  const snap = JSON.parse(JSON.stringify(S.snapshot()));
  S.synth.pattern = new Array(16).fill(-1);
  assert.equal(S.apply(snap), true);
  assert.deepEqual(S.synth.pattern, snap.pattern);
  const old = JSON.parse(JSON.stringify(snap));
  delete old.kind;
  assert.equal(S.apply(old), true);
});

test('partial files change only their own part', () => {
  const { S, A } = seqWorld();
  const drumsBefore = JSON.stringify(S.drummers);
  const pat = S.snapshot('pattern');
  pat.pattern = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
  assert.equal(S.apply(pat), true);
  assert.deepEqual(S.synth.pattern, pat.pattern);
  assert.equal(JSON.stringify(S.drummers), drumsBefore, 'drums untouched by a pattern file');

  const drums = S.snapshot('drums');
  drums.drummers[0].hits = 7;
  drums.drummers[0].steps = drums.drummers[0].steps.map((_, i) => i % 2 === 0);
  const patBefore = S.synth.pattern.slice();
  assert.equal(S.apply(drums), true);
  assert.equal(S.drummers[0].hits, 7);
  assert.deepEqual(S.synth.pattern, patBefore, 'pattern untouched by a drums file');

  const snd = S.snapshot('sound');
  snd.params.tempo = 101; snd.drift = 0.9; snd.swing = 0.4; snd.light = 2;
  assert.equal(S.apply(snd), true);
  assert.deepEqual([A.params.tempo, S.drift, S.swing, S.light], [101, 0.9, 0.4, 2]);
  assert.deepEqual(S.synth.pattern, patBefore);
});

test('bad files are rejected atomically: nothing changes', () => {
  const { S } = seqWorld();
  const before = JSON.stringify([S.synth.pattern, S.drummers, S.light, S.swing, S.drift]);
  const nope = [
    null, 'text', 5, [], {},
    { kind: 'loop', pattern: new Array(16).fill(99), drummers: [{}, {}, {}] },       // bad bass
    { kind: 'loop', pattern: new Array(16).fill(0), drummers: [{}, {}] },             // wrong number of drummers
    { kind: 'pattern', pattern: [1, 2, 3] },
    { kind: 'drums' },
    { kind: 'sound' },
    { kind: 'mystery', pattern: new Array(16).fill(0) },
  ];
  for (const bad of nope) assert.equal(S.apply(bad), false, JSON.stringify(bad));
  assert.equal(JSON.stringify([S.synth.pattern, S.drummers, S.light, S.swing, S.drift]), before);
});

test('out-of-range values are clamped, hostile drummer entries ignored', () => {
  const { S, A } = seqWorld();
  const j = S.snapshot('loop');
  j.params.tempo = 9999; j.params.cutoff = -3; j.drift = 50; j.swing = 'fast'; j.light = 12;
  j.drummers[1] = { len: 99999, steps: [] };
  const d1 = JSON.stringify(S.drummers[1]);
  const light = S.light, swing = S.swing;
  assert.equal(S.apply(j), true);
  assert.deepEqual([A.params.tempo, A.params.cutoff, S.drift], [200, 0, 1]);
  assert.equal(S.swing, swing);
  assert.equal(S.light, light);
  assert.equal(JSON.stringify(S.drummers[1]), d1);
});

/* ============================== Output guard ============================== */
test('the soft-clip guard is transparent below the knee and can never reach full scale', () => {
  const { audio } = load('audio.js');
  const c = audio.guardCurve(), n = c.length;
  const inputAt = (i) => ((i / (n - 1)) * 2 - 1) * 2;            // the curve is indexed by x/2 (a 0.5 pre-gain sits in front of it)
  let max = 0, prev = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = inputAt(i), y = c[i];
    if (Math.abs(x) <= 0.7) assert.ok(Math.abs(y - x) < 1e-6, `not transparent at ${x}: ${y}`);
    assert.ok(y >= prev, 'monotonic');                            // louder in never means quieter out
    prev = y;
    max = Math.max(max, Math.abs(y));
    assert.ok(Math.abs(c[i] + c[n - 1 - i]) < 1e-6, 'symmetric');
  }
  assert.ok(max <= 0.97 + 1e-6, `ceiling ${max}`);
  assert.ok(max > 0.96, 'uses the headroom it promises');
  // a signal 6 dB over full scale (x = 2) comes out below the ceiling too
  assert.ok(c[n - 1] <= 0.97 + 1e-6);
});
