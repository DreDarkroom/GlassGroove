import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeq } from '../src/engine/seq.js';

/* A stand-in audio engine: just enough for the scheduler (no browser needed). */
function fakeAudio() {
  const calls = [], A = new Proxy({ params: { tempo: 120 }, lookahead: 0.3, ready: true, _now: 0, stats: { nodes: 0, hits: 0 },
    now() { return A._now; }, setParam(k, v) { A.params[k] = v; }, setKit() { return true; }, riser(...a) { calls.push(['riser', ...a]); }, level() { return { bass: 0, mid: 0, high: 0 }; } },
  { get: (t, k) => (k in t ? t[k] : () => {}) });
  A.calls = calls;
  return A;
}

test('a surge schedules its drop on a bar line, whole bars away, and a long riser', () => {
  const A = fakeAudio(), S = createSeq(A, { emit: () => {} });
  S.playing = true; S._setTick(5, 0);
  const tk = S.surgeStart(8);
  assert.equal(tk, 16 + 8 * 16);                                  // the next bar line (tick 16) plus eight bars
  assert.equal(tk % 16, 0);
  const riser = A.calls.find((c) => c[0] === 'riser' && c[1] === true);
  assert.ok(riser[4] >= 8, 'the riser lasts as long as the surge');
  assert.equal(S.surgeStart(4), 0, 'a second surge cannot start while one is running');
});

test('a surge can be moved longer, shorter and to the next beat, and cancelling clears it', () => {
  const A = fakeAudio(), S = createSeq(A, { emit: () => {} });
  S.playing = true; S._setTick(0, 0);
  const tk = S.surgeStart(8);
  assert.equal(S.surgeShift(4), tk + 64);
  assert.equal(S.surgeShift(-100), 0 + (S.nextBoundary('bar')), 'never before the next bar');
  S.surgeShift(8);
  assert.equal(S.surgeNow(), S.nextBoundary('beat'));
  S.buildCancel();
  assert.equal(S.surgeTick, 0);
  assert.equal(S.dropAt, null);
});

test('after a long stall the scheduler skips what it missed and a surge drop still lands on a bar line, once', () => {
  const A = fakeAudio(), S = createSeq(A, { emit: () => {} }), bars = [];
  S.onBar = (n) => bars.push(n);
  let drops = 0; S.playing = true; S._setTick(0, 0.05); A._now = 0;
  S._pump();                                                       // the clock has been running: a few ticks are scheduled
  const target = S.surgeStart(2);                                  // a two-bar surge
  S.onDrop = () => { drops++; };
  A._now = 30;                                                     // the page froze for half a minute (many bars at 120 bpm)
  S._pump();
  assert.ok(S.stalls >= 1, 'a stall was noticed');
  assert.ok(bars.length >= 10, 'the bars that went by were still counted');
  A._now = 40; S._pump(); A._now = 45; S._pump();
  assert.equal(drops, 1, 'the drop ran exactly once');
  assert.equal(S.build, null);
  assert.ok(target % 16 === 0);
});
