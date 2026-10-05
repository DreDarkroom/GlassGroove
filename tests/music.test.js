/* The musical logic: styles, snapping to the beat, builds and drops, mutes, clips and the journey.
   Runs the real sequencer in Node with the audio engine replaced by a recorder, so every call and its time can be checked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './compat.js';

/** A sequencer whose audio calls are logged as [name, time, ...args]. */
function world() {
  const SS = load('perfrec.js', 'audio.js', 'seq.js');
  const A = SS.audio, S = SS.seq;
  const calls = [];
  for (const n of ['kick', 'snare', 'hat', 'note', 'noteOn', 'noteOff', 'impact', 'gap', 'sweep', 'riser']) {
    A[n] = (...a) => { calls.push([n, ...a]); };
  }
  A.openUp = (t, dur) => { calls.push(['openUp', t, dur]); };
  S.playing = true;
  S.mute = { kick: false, snare: false, hat: false, bass: false };
  S.ghosts = [];
  S.drift = 0;                                   // no random ghost hats or pattern changes unless a test wants them
  S.home = S.synth.pattern.slice();
  const run = (from, to, t0 = 0, sd = 0.126) => { for (let tk = from; tk < to; tk++) { S._setTick(tk); S.tickOnce(tk, t0 + (tk - from) * sd); } };
  return { SS, A, S, calls, run, names: () => calls.map((c) => c[0]) };
}

/* ============================== styles ============================== */
test('every style is a valid, playable starting point', () => {
  const { S, A } = world();
  assert.ok(S.styles.length >= 6);
  for (const st of S.styles) {
    assert.equal(st.bass.length, 16, st.name);
    assert.ok(st.bass.every((n) => Number.isInteger(n) && n >= -1 && n <= 7), st.name + ' bass degrees');
    for (const ring of [st.kick, st.snare, st.hat]) {
      assert.ok(ring.len >= 4 && ring.len <= 32, st.name + ' ring length');
      assert.equal(ring.steps.length, ring.len, st.name + ' ring steps');
    }
    assert.ok(Object.prototype.hasOwnProperty.call(A.kits, st.kit), st.name + ' kit');
    assert.ok(st.tempo >= 60 && st.tempo <= 200, st.name + ' tempo');
    assert.ok([0, 1, 2].includes(st.light) && [0, 1, 2, 3, 4].includes(st.scene), st.name + ' light/scene');
    for (const v of Object.values(st.sound)) assert.ok(v >= 0 && v <= 1, st.name + ' sound value');
    assert.ok(st.note && st.note.length > 10, st.name + ' has a description');
  }
});

test('styles have the rhythm they claim', () => {
  const { S } = world();
  const on = (ring) => ring.steps.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const by = (name) => S.styles.find((s) => s.name === name);
  assert.deepEqual(on(by('Drum & bass').kick), [0, 10]);                    // drum and bass: two-step
  assert.deepEqual(on(by('Drum & bass').snare), [4, 12]);                   // snare on two and four
  assert.equal(by('Drum & bass').tempo, 174);
  assert.deepEqual(on(by('Electro').kick), [0, 4, 8, 12]);             // four on the floor
  assert.deepEqual(on(by('Electro').snare), [4, 12]);
  assert.deepEqual(on(by('Electro').hat), [2, 6, 10, 14]);             // offbeat hats
  assert.deepEqual(on(by('Slow roll').kick), [0, 4, 8, 12]);
  assert.equal(by('Empty').bass.every((n) => n === -1), true);
  assert.deepEqual(by('Slow build').mute, { snare: true, bass: true });
});

test('applying a style changes everything it should, and mutes come and go with it', () => {
  const { S, A } = world();
  S.applyStyle(S.styles.findIndex((s) => s.name === 'Drum & bass'), { now: true });
  assert.equal(A.params.tempo, 174);
  assert.equal(S.dnb, true);
  assert.equal(A.kitName, 'dnb');
  assert.deepEqual(S.drummers[1].steps.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [4, 12]);
  assert.deepEqual(S.home, S.synth.pattern);
  S.applyStyle(S.styles.findIndex((s) => s.name === 'Slow build'), { now: true });
  assert.deepEqual([S.mute.kick, S.mute.snare, S.mute.hat, S.mute.bass], [false, true, false, true]);
  S.applyStyle(0, { now: true });
  assert.deepEqual(Object.values(S.mute), [false, false, false, false], 'a style without mutes clears them');
  assert.equal(S.dnb, false);
});

test('while playing, a style change waits for the next bar', () => {
  const { S, A, run } = world();
  S._setTick(5);
  S.applyStyle(4);                                   // Rapid Fixer, queued
  assert.notEqual(A.params.tempo, 174, 'not applied yet');
  run(5, 16);
  assert.notEqual(A.params.tempo, 174, 'still waiting during the bar');
  run(16, 17);
  assert.equal(A.params.tempo, 174, 'applied exactly when the next bar starts');
});

/* ============================== snapping ============================== */
test('the next boundary is the next beat or bar, never in the past', () => {
  const { S } = world();
  const at = (tk, mode) => { S._setTick(tk); return S.nextBoundary(mode); };
  assert.equal(at(5, 'now'), 5);
  assert.equal(at(5, 'beat'), 8);
  assert.equal(at(8, 'beat'), 8);
  assert.equal(at(9, 'beat'), 12);
  assert.equal(at(5, 'bar'), 16);
  assert.equal(at(16, 'bar'), 16);
  assert.equal(at(17, 'bar'), 32);
});

/* ============================== mutes and clearing ============================== */
test('muted layers make no sound and no events', () => {
  const { S, run, names } = world();
  run(0, 16);
  assert.ok(names().includes('kick') && names().includes('note'));
  for (const part of S.PARTS) S.toggleMute(part, true);
  const before = names().length;
  run(16, 48);
  assert.equal(names().length, before, 'nothing new while everything is muted');
  S.toggleMute('kick', false);
  run(48, 64);
  assert.ok(names().length > before && names().slice(before).every((n) => n === 'kick'));
});

test('clear empties the bass or the drums, and drift does not refill an empty bass line', () => {
  const { S, run, names } = world();
  S.clear('bass');
  assert.ok(S.synth.pattern.every((n) => n === -1));
  S.drift = 1;
  for (let i = 0; i < 300; i++) S.synth.pattern = S.evolve(S.synth.pattern.slice());
  assert.ok(S.synth.pattern.every((n) => n === -1), 'stays empty');
  S.clear('drums');
  assert.ok(S.drummers.every((d) => d.steps.every((v) => !v) && d.hits === 0));
  S.drift = 0;
  run(0, 32);
  assert.ok(!names().some((n) => ['kick', 'snare', 'hat', 'note'].includes(n)), 'silence');
});

/* ============================== builds and drops ============================== */
test('a lift build takes the kick out, rolls the snare faster over time, and thins the mix', () => {
  const { S, calls, run } = world();
  assert.equal(S.buildStart(0), true);
  assert.deepEqual(calls.find((c) => c[0] === 'riser').slice(1, 3), [true, 0]);
  assert.equal(S.buildStart(1), false, 'cannot start a second build while one is held');
  const t0 = S.build.t0;
  run(0, 16, t0);                                    // the first second: no kick, no roll
  assert.ok(!calls.some((c) => c[0] === 'kick'), 'kick drops out');
  const early = calls.filter((c) => c[0] === 'snare').length;
  calls.length = 0;
  run(16, 32, t0 + 2.0);                             // 2-2.5 s in: a snare on every beat
  const mid = calls.filter((c) => c[0] === 'snare').length;
  calls.length = 0;
  run(32, 48, t0 + 5.0);                             // 5 s in: a snare on every sixteenth, plus 32nds after 6 s
  const late = calls.filter((c) => c[0] === 'snare').length;
  assert.ok(mid > early && late > mid, `roll speeds up: ${early} < ${mid} < ${late}`);
});

test('a sink build keeps the drums going while the mix goes under water', () => {
  const { S, calls, run } = world();
  S.buildStart(1);
  assert.deepEqual(calls.find((c) => c[0] === 'riser').slice(1, 3), [true, 1]);
  run(0, 16, S.build.t0);
  assert.ok(calls.some((c) => c[0] === 'kick'), 'drums carry on');
});

test('releasing a build lands the drop on the next beat, with the full drop sound', () => {
  const { S, calls, run } = world();
  S.setQuant('beat');
  S.buildStart(0);
  S._setTick(5);
  assert.equal(S.buildRelease(), true);
  assert.equal(S.dropAt.tick, 8, 'snapped to the next beat, not at once');
  calls.length = 0;
  run(5, 8);                                         // still building until the beat
  assert.equal(calls.filter((c) => c[0] === 'impact').length, 0);
  calls.length = 0;
  S._setTick(8);
  S.tickOnce(8, 10.0);
  const n = calls.map((c) => c[0]);
  for (const need of ['gap', 'riser', 'openUp', 'impact', 'kick', 'note']) assert.ok(n.includes(need), `drop has ${need}: ${n}`);
  assert.deepEqual(calls.find((c) => c[0] === 'riser').slice(1, 2), [false], 'the riser stops');
  assert.equal(calls.find((c) => c[0] === 'impact')[1], 10.0, 'the hit is exactly on the beat');
  assert.ok(calls.find((c) => c[0] === 'gap')[1] < 10.0, 'the breath of silence comes before it');
  const bass = calls.find((c) => c[0] === 'note');
  assert.ok(bass[2] < S.midi(0), 'a bass note an octave under the drop');
  assert.equal(S.build, null);
  assert.equal(S.dropAt, null);
});

test('quantise: bar waits for the bar, now does not wait', () => {
  const { S } = world();
  S.buildStart(0);
  S._setTick(5);
  S.setQuant('bar');
  S.buildRelease();
  assert.equal(S.dropAt.tick, 16);
  S.dropAt = null;
  S.setQuant('now');
  S.buildRelease();
  assert.equal(S.dropAt.tick, 5);
  assert.equal(S.setQuant('nonsense'), 'now', 'invalid quantise values are ignored');
});

test('cancelling a build opens the filters again and leaves no riser running', () => {
  const { S, calls } = world();
  S.buildStart(0);
  calls.length = 0;
  S.buildCancel();
  assert.deepEqual(calls.filter((c) => c[0] === 'riser')[0].slice(1, 2), [false]);
  assert.ok(calls.some((c) => c[0] === 'openUp'));
  assert.equal(S.build, null);
  assert.equal(S.buildRelease(), false, 'nothing to release');
});

/* ============================== clips ============================== */
test('a clip records the bars you ask for, starting on the next bar, and loops once the written drums are gone', () => {
  const { S, calls, run } = world();
  S._setTick(3);
  assert.equal(S.recordClip('drums', 1), true);
  assert.equal(S.clipRec.startTick, 16, 'waits for the bar');
  run(3, 16);
  assert.equal(S.clipRec.state, 'armed');
  run(16, 32);                                        // the recorded bar
  assert.equal(S.clipRec.state, 'recording');
  S._setTick(32);
  S.tickOnce(32, 99);                                 // the bar is over: the clip is finished
  assert.equal(S.clipRec, null);
  const clip = S.clips.drums;
  assert.ok(clip && clip.bars === 1 && clip.len === 16 && clip.events.length > 0);
  assert.equal(clip.active, true);
  assert.equal(clip.startTick % 16, 0, 'starts on a bar line');
  const kicksWritten = S.drummers[0].steps.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(clip.events.filter((e) => e[1] === 0).map((e) => e[0]).sort((a, b) => a - b), kicksWritten, 'it captured exactly the written kicks');
  // now throw the written drums away: the clip alone must reproduce them, bar after bar
  S.clear('drums');
  calls.length = 0;
  run(32, 80);
  const kickTicks = calls.filter((c) => c[0] === 'kick').length;
  assert.equal(kickTicks, kicksWritten.length * 3, 'three bars of the loop');
});

test('a bass clip replaces the written bass line', () => {
  const { S, calls, run } = world();
  S._setTick(0);
  S.recordClip('bass', 1);
  run(0, 33);
  assert.ok(S.clips.bass);
  S.clear('bass');
  calls.length = 0;
  run(33, 65);
  assert.ok(calls.filter((c) => c[0] === 'note').length > 0, 'the clip plays the recorded notes');
});

test('clips export and import without loss, and bad files are refused', () => {
  const { S, run } = world();
  S._setTick(0);
  S.recordClip('both', 2);
  run(0, 66);
  assert.ok(S.clips.drums && S.clips.bass);
  const json = JSON.parse(JSON.stringify(S.clipToJSON('drums')));
  assert.equal(json.kind, 'clip');
  assert.equal(json.part, 'drums');
  S.clips.drums = null;
  assert.equal(S.loadClip(json), 'drums');
  assert.equal(S.clips.drums.events.length, json.events.length);
  const bad = [
    null, {}, { ...json, app: 'x' }, { ...json, kind: 'loop' }, { ...json, version: 9 }, { ...json, part: 'piano' }, { ...json, bars: 3 },
    { ...json, events: [] }, { ...json, events: 'nope' }, { ...json, events: [[999, 0, 1]] }, { ...json, events: [[0, 3, 40, 1, 0, 2]] },   // a bass event in a drum clip
    { ...json, events: new Array(9000).fill([0, 0, 1]) }, { ...json, events: [[0, 0, NaN]] },
  ];
  for (const b of bad) assert.equal(S.loadClip(b), null, JSON.stringify(b).slice(0, 60));
  assert.equal(S.loadClip(json), 'drums', 'a good file still loads after the bad ones');
});

test('a clip cannot be recorded while stopped, or with an absurd length', () => {
  const { S } = world();
  S.playing = false;
  assert.equal(S.recordClip('drums', 4), false);
  S.playing = true;
  assert.equal(S.recordClip('drums', 3), false);
  assert.equal(S.recordClip('kazoo', 4), false);
  assert.equal(S.recordClip('drums', 4), true);
});

/* ============================== the journey ============================== */
test('the journey raises the tempo steadily and walks through the pictures', () => {
  const { S, A, run } = world();
  A.params.tempo = 120;
  S._setTick(0);
  assert.equal(S.journeyStart({ to: 140, bars: 8 }), true);
  run(0, 16 * 4 + 1);                                 // four bars in: halfway
  assert.ok(Math.abs(A.params.tempo - 130) < 0.6, `halfway tempo ${A.params.tempo}`);
  assert.equal(S.scene, 2);
  run(16 * 4 + 1, 16 * 8 + 1);
  assert.equal(A.params.tempo, 140, 'arrives exactly');
  assert.equal(S.scene, 3);
  assert.equal(S.journey, null, 'and stops by itself');
  assert.equal(S.journeyStart({ to: 500 }), true, 'out-of-range targets are clamped, not trusted');
  assert.equal(S.journey.to, 200);
});

/* ============================== kits and the new performance events ============================== */
test('every drum kit defines every voice completely', () => {
  const { A } = world();
  assert.deepEqual(A.kitNames.slice().sort(), Object.keys(A.kits).sort());
  for (const [name, k] of Object.entries(A.kits)) {
    for (const f of ['f0', 'f1', 'sweep', 'decay', 'click', 'sub']) assert.ok(k.kick[f] >= 0, `${name} kick ${f}`);
    for (const f of ['nf', 'nq', 'nd', 'ng', 'tf0', 'tf1', 'td', 'tg', 'send']) assert.ok(k.snare[f] >= 0, `${name} snare ${f}`);
    for (const f of ['hp', 'cd', 'od', 'g']) assert.ok(k.hat[f] > 0, `${name} hat ${f}`);
    assert.equal(typeof k.snare.clap, 'boolean');
    assert.equal(typeof k.hat.metal, 'boolean');
  }
  assert.equal(A.setKit('nonsense'), false);
  assert.equal(A.setKit('dnb'), true);
  assert.equal(A.kitName, 'dnb');
});

test('the new performance events validate, and hostile versions of them are dropped', async () => {
  const { SS } = world();
  const perf = SS.perf;
  const dec = (events) => perf.decode(new TextEncoder().encode(JSON.stringify({ app: 'SquidgySqueegee', kind: 'performance', version: 1, events })));
  const good = await dec([[0, 11, 0, 1100, 9], [10, 11, 1, 160, 7], [10, 12, 0.1], [10, 13, 1], [10, 14, 1, 0], [10, 15, 2], [10, 16, 3], [10, 5, 'tempo', 174]]);
  assert.equal(good.events.length, 8);
  const hostile = await dec([
    [0, 11, 5, 1100, 9], [0, 11, 0, 1, 9], [0, 11, 0, 1100, 999], [0, 12, 99], [0, 13, -1], [0, 14, 2, 0], [0, 15, 99], [0, 15, 1.5], [0, 16, 9],
    [0, 17, 1], [0, 5, 'tempo', 99999],
  ]);
  assert.deepEqual(hostile.events.map((e) => [e.code, ...e.a]), [[5, 'tempo', 200]], 'only the clamped tempo survives');
});

test('performance files: new event codes validate, hostile ones are dropped, and stateAt tracks kit and scene', () => {
  const SSp = load('perfrec.js');
  const P = SSp.perf;
  const doc = { app: 'SquidgySqueegee', kind: 'performance', version: 1, duration: 5, snapshot: {}, events: [
    [0, 15, 3], [10, 16, 2], [10, 11, 0, 400, 1.5], [10, 12, 0.1], [10, 13, 1], [10, 14, 1, 1],
    [10, 15, 9],                 // kit index out of range
    [10, 16, 7],                 // scene out of range
    [10, 11, 5, 400, 1],         // bad filter id
    [10, 12, 99],                // absurd gap
    [10, 14, 2, 0],              // bad riser flag
    [10, 99, 1],                 // unknown code
    [10000, 16, 1], [10000, 15, 4],
  ] };
  const out = P.validate(doc);
  assert.equal(out.events.length, 8);
  const st = P.stateAt(out.events, 0.5);
  assert.equal(st.kit, 3);
  assert.equal(st.scene, 2);
  const later = P.stateAt(out.events, 2.5);
  assert.equal(later.kit, 4);
  assert.equal(later.scene, 1);
  assert.equal(P.stateAt(out.events, 0).scene, null);
});

test('performance files: a stylus stroke keeps its blade size, and non-numeric junk in a stroke is dropped', () => {
  const P = load('perfrec.js').perf;
  const out = P.validate({ app: 'SquidgySqueegee', kind: 'performance', version: 1, duration: 1, snapshot: {}, events: [
    [0, 8, 0.5, 0.5, 0.4, 0.4, 0.3],       // x, y, previous x, previous y, size
    [10, 8, 0.5, 0.5, 0.4, 0.4],           // an older file with no size
    [10, 8, 0.5, { evil: 1 }],             // not a number or a string: dropped
  ] });
  assert.equal(out.events.length, 2);
  assert.deepEqual(out.events[0].a, [0.5, 0.5, 0.4, 0.4, 0.3]);
  assert.equal(out.events[1].a.length, 4);
});

test('part levels (dB): clamped, saved with a loop, validated in loops and recordings', () => {
  const { A, S } = (() => { const w = world(); return { A: w.SS.audio, S: w.SS.seq }; })();
  A.setParam('hatDb', 99); assert.equal(A.params.hatDb, 12);
  A.setParam('bassDb', -99); assert.equal(A.params.bassDb, -24);
  A.setParam('kickDb', -1.25); assert.equal(A.params.kickDb, -1.25);
  const snap = S.snapshot('loop');
  assert.equal(snap.params.hatDb, 12);
  assert.equal(snap.params.kickDb, -1.25);
  // a hostile loop file cannot push a level outside its range (or smuggle a string in)
  const bad = JSON.parse(JSON.stringify(snap));
  bad.params.hatDb = 500; bad.params.snareDb = 'loud';
  S.apply(bad);
  assert.ok(A.params.hatDb <= 12);
  assert.ok(typeof A.params.snareDb === 'number');
  // recordings: level changes replay, and out-of-range ones are clamped
  const P = load('perfrec.js').perf;
  const out = P.validate({ app: 'SquidgySqueegee', kind: 'performance', version: 1, duration: 1, snapshot: {}, events: [[0, 5, 'hatDb', -300], [10, 5, 'root', 45], [10, 5, 'nope', 1]] });
  assert.equal(out.events.length, 2);
  assert.equal(out.events[0].a[1], -24);
});

test('the scheduler looks ahead by A.lookahead (longer on phones)', () => {
  const { A, S, calls } = (() => { const w = world(); return { A: w.SS.audio, S: w.SS.seq, calls: w.calls }; })();
  assert.equal(A.lookahead, 0.18);
  assert.equal(A.profile, 'desktop');
  assert.equal(typeof A.setEco, 'function');
  A.setEco(true);                                  // no audio context yet: it only records the choice
  assert.equal(A.eco, true);
  A.setEco(false);
  assert.equal(A.eco, false);
});
