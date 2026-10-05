/* What is new in Glass Groove: the Studio's editing functions, presses in the recording format, version-1 files, and the picture's press folding. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { C, validate, decode, encode, toDoc, createRecorder } from '../src/perf/format.js';
import * as ed from '../src/takes/edit.js';
import { foldPoint } from '../src/visual/press.js';
import { library } from '../src/rec/library.js';
import { hashStr } from '../src/util.js';

const ev = (t, code, ...a) => ({ t, code, a });
const take = () => ed.withIds([
  ev(0, C.param, 'tempo', 120), ev(0.5, C.light, 1), ev(1, C.noteOn, 40, 0.9, 1, 800), ev(1.4, C.noteOff), ev(2, C.noteOn, 45, 0.6, 0, 600), ev(2.3, C.noteOff),
  ev(2.1, C.kick, 0.95), ev(3, C.snare, 0.8), ev(3.5, C.hat, 0.5, 0), ev(4, C.param, 'cutoff', 0.7), ev(5, C.scene, 2),
]).sort((a, b) => a.t - b.t);

test('moving events keeps time order and never goes before the start', () => {
  const e = take(), sel = new Set([e.find((x) => x.code === C.snare).id]);
  const m = ed.move(e, sel, 2);
  assert.equal(m.find((x) => x.code === C.snare).t, 5);
  assert.deepEqual(m.map((x) => x.t), [...m.map((x) => x.t)].sort((a, b) => a - b));
  const back = ed.move(e, new Set([e.find((x) => x.code === C.noteOn).id]), -10);
  assert.equal(Math.min(...back.map((x) => x.t)), 0);
  assert.equal(back.find((x) => x.code === C.noteOn && x.a[0] === 40).t, 0, 'clamped at the start');
});

test('editing returns new lists and leaves the old ones alone (that is the undo history)', () => {
  const e = take(), snapshot = JSON.stringify(e), sel = new Set([e[2].id]);
  ed.remove(e, sel); ed.transpose(e, sel, 12); ed.quantise(e, sel, 0.25); ed.velocity(e, sel, 0.5); ed.move(e, sel, 1);
  assert.equal(JSON.stringify(e), snapshot);
});

test('transpose moves only the selected notes, and stays inside the MIDI range', () => {
  const e = take(), n40 = e.find((x) => x.code === C.noteOn && x.a[0] === 40), sel = new Set([n40.id]);
  assert.equal(ed.transpose(e, sel, 12).find((x) => x.id === n40.id).a[0], 52);
  assert.equal(ed.transpose(e, sel, 500).find((x) => x.id === n40.id).a[0], 127);
  assert.equal(ed.transpose(e, sel, -500).find((x) => x.id === n40.id).a[0], 0);
  assert.equal(ed.transpose(e, sel, 12).find((x) => x.code === C.noteOn && x.a[0] === 45).a[0], 45, 'the other note is untouched');
  assert.deepEqual(ed.transpose(e, new Set([e.find((x) => x.code === C.kick).id]), 12).find((x) => x.code === C.kick).a, [0.95], 'only notes transpose');
});

test('quantise snaps notes and hits to the grid and leaves knobs and pictures alone', () => {
  const e = take(), q = ed.quantise(e, new Set(), 0.25);                         // nothing selected: everything that can be snapped
  assert.equal(q.find((x) => x.code === C.kick).t, 2);                          // 2.1 -> 2.0
  assert.equal(q.find((x) => x.code === C.hat).t, 3.5);
  assert.equal(q.find((x) => x.code === C.light).t, 0.5, 'a light change is not a note');
  const half = ed.quantise(e, new Set(), 0.25, 0.5);
  assert.ok(Math.abs(half.find((x) => x.code === C.kick).t - 2.05) < 1e-9, 'half-way pull');
});

test('velocity scales within limits, for notes and for drum hits', () => {
  const e = take(), sel = new Set(e.filter((x) => x.code === C.noteOn || x.code === C.kick).map((x) => x.id));
  const v = ed.velocity(e, sel, 2);
  assert.equal(v.find((x) => x.code === C.noteOn && x.a[0] === 40).a[1], 1);
  assert.equal(v.find((x) => x.code === C.kick).a[0], 1);
  const soft = ed.velocity(e, sel, 0.01);
  assert.equal(soft.find((x) => x.code === C.kick).a[0], 0.05);
});

test('trim keeps a range, shifts it to zero and carries the earlier state across', () => {
  const e = take(), t = ed.trim(e, 2, 4);
  assert.equal(t.duration, 2);
  assert.ok(t.events.every((x) => x.t >= 0 && x.t <= 2));
  const first = t.events.filter((x) => x.t === 0);
  assert.ok(first.some((x) => x.code === C.param && x.a[0] === 'tempo' && x.a[1] === 120), 'tempo carried over');
  assert.ok(first.some((x) => x.code === C.light && x.a[0] === 1), 'light carried over');
  assert.ok(!t.events.some((x) => x.code === C.scene), 'the scene change after the range is gone');
  assert.ok(!t.events.some((x) => x.code === C.noteOff && x.t === 0 && !t.events.some((y) => y.code === C.noteOn)), 'no orphaned note-off at the start');
});

test('a range cut closes the gap', () => {
  const e = take(), c = ed.cut(e, 1, 3);
  assert.ok(!c.some((x) => x.code === C.noteOn && x.a[0] === 40));
  assert.equal(c.find((x) => x.code === C.snare).t, 1, 'the snare at exactly 3 s is after the gap: it remains, two seconds earlier');
  const after = ed.cut(e, 1, 3).find((x) => x.code === C.hat);
  assert.equal(after.t, 1.5);
});

test('duplicate makes copies with new ids and selects them', () => {
  const e = take(), sel = new Set([e.find((x) => x.code === C.kick).id]), r = ed.duplicate(e, sel, 4);
  assert.equal(r.events.length, e.length + 1);
  assert.equal(r.ids.size, 1);
  const copy = r.events.find((x) => r.ids.has(x.id));
  assert.equal(copy.t, 6.1);
  assert.ok(!e.some((x) => x.id === copy.id));
});

test('note bars end at the next note-off or the next note', () => {
  const bars = ed.noteBars(take());
  assert.deepEqual(bars.map((b) => [b.midi, b.t, b.end]), [[40, 1, 1.4], [45, 2, 2.3]]);
  assert.equal(ed.noteBars(ed.withIds([ev(1, C.noteOn, 40, 1, 0, 100), ev(1.2, C.noteOn, 42, 1, 0, 100)])).at(0).end, 1.2);
});

test('the beat grid follows the tempo in force', () => {
  const e = take();
  assert.equal(ed.tempoAt(e, {}, 1), 120);
  assert.equal(ed.tempoAt([], { params: { tempo: 98 } }), 98);
  assert.equal(ed.tempoAt([], {}), 119);
});

/* ---------------- presses in the file format ---------------- */
test('a press is a recorded event with its position, control and force, and bad ones are dropped', async () => {
  const r = createRecorder();
  r.start(10, { kit: 'dnb' });
  r.log(10.5, C.press, 0.25, 0.75, 4000000000, 1.2);
  r.log(10.6, C.press, 2, 0.5, 5, 1);                                // off screen: dropped on load
  r.log(10.7, C.press, 0.5, 0.5, 5, 9);                               // absurd force: dropped
  r.log(10.8, C.press, 0.1, 0.2, -3, 1);                              // a negative control id: dropped
  const doc = r.stop(12);
  assert.equal(doc.version, 2);
  assert.equal(doc.app, 'GlassGroove');
  const back = await decode((await encode(doc)).bytes);
  assert.deepEqual(back.events.map((e) => [e.code, ...e.a]), [[C.press, 0.25, 0.75, 4000000000, 1.2]]);
});

test('version-1 files from the original instrument still load, and the old exposure riser becomes a riser and a hit', () => {
  const doc = { app: 'SquidgySqueegee', kind: 'performance', version: 1, duration: 3, events: [[10000, 6, 1], [20000, 6, 0], [100, 2, 1]] };
  const out = validate(doc);
  assert.deepEqual(out.events.map((e) => [Math.round(e.t * 100) / 100, e.code, ...e.a]), [[1, C.riser, 1, 0], [3, C.riser, 0, 0], [3, C.impact, 1], [3.01, C.kick, 1]]);
  assert.throws(() => validate({ ...doc, app: 'SomethingElse' }), /not a performance/);
});

test('a take survives toDoc and back, with its length', () => {
  const e = take();
  const doc = toDoc({ snapshot: { kit: 'dnb' }, events: e, duration: 9 });
  assert.equal(doc.duration, 9);
  const back = validate(doc);
  assert.equal(back.events.length, e.length);
  assert.deepEqual(back.events.map((x) => x.t), e.map((x) => x.t));
  assert.equal(back.snapshot.kit, 'dnb');
});

/* ---------------- the picture ---------------- */
test('a press folds into the kaleidoscope wedge the way the picture does', () => {
  const a = Math.PI / 4;                                                  // 8 folds
  for (let k = 0; k < 400; k++) {
    const dx = Math.cos(k) * (10 + k), dy = Math.sin(k * 1.7) * (10 + k), { phi, r } = foldPoint(dx, dy, k * 0.013, a);
    assert.ok(phi >= 0 && phi <= a + 1e-12, `angle inside the wedge (${phi})`);
    assert.ok(Math.abs(r - Math.hypot(dx, dy)) < 1e-9);
  }
  assert.ok(Math.abs(foldPoint(1, 0, 0, a).phi) < 1e-12);                 // along the wedge's own edge
  assert.ok(Math.abs(foldPoint(Math.cos(2 * a), Math.sin(2 * a), 0, a).phi) < 1e-9, 'two wedges round is a copy of the first');
  assert.ok(Math.abs(foldPoint(Math.cos(a * 1.25), Math.sin(a * 1.25), 0, a).phi - a * 0.75) < 1e-9, 'the odd wedges are mirrored');
});

test('a control name always gives the same shape and colour', () => {
  assert.equal(hashStr('build ▸ drop'), hashStr('build ▸ drop'));
  assert.notEqual(hashStr('kick'), hashStr('snare'));
  assert.ok(hashStr('') >= 0 && Number.isInteger(hashStr('x')));
});

test('the library is only available in a browser, and says so without crashing the page', async () => {
  await assert.rejects(library.list(), /indexedDB|not defined/i);
});

/* ---------------- zip ---------------- */
import { crc32, zip } from '../src/rec/zip.js';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('a zip has the right structure: local headers, names, data, a central directory and an end record', () => {
  const a = new TextEncoder().encode('hello'), b = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const z = zip([{ name: 'a.txt', data: a }, { name: 'dir/é.wav', data: b }], new Date(2026, 9, 3, 12, 0, 0)), v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50, 'first local header');
  assert.equal(v.getUint32(14, true), crc32(a), 'its crc');
  assert.equal(v.getUint32(18, true), 5);
  assert.equal(new TextDecoder().decode(z.slice(30, 35)), 'a.txt');
  assert.equal(new TextDecoder().decode(z.slice(35, 40)), 'hello', 'the data is stored as it is');
  const end = z.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'end of central directory');
  assert.equal(v.getUint16(end + 10, true), 2, 'two entries');
  const centralAt = v.getUint32(end + 16, true);
  assert.equal(v.getUint32(centralAt, true), 0x02014b50, 'the central directory is where the end record says');
});
