/* Sharing a beat as a link: the round trip, and what a hostile or damaged link does (nothing). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBeat, decodeBeat, beatUrl, beatFromHash } from '../src/share.js';
import { load } from './compat.js';
import { snapshot, applySnapshot } from '../src/engine/loopfile.js';

test('a beat survives the trip into a link and back, and the link is short', async () => {
  const { seq: S, audio: A } = load();
  S.applyStyle(4, { now: true });
  const snap = snapshot(S, A), text = await encodeBeat(snap), back = await decodeBeat(text);
  assert.ok(text.length < 900, `link text is ${text.length} characters`);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(text), 'only characters that are safe in an address');
  assert.deepEqual(back.pattern, snap.pattern);
  assert.equal(back.kit, 'dnb');
  const w = load();
  assert.equal(applySnapshot(w.seq, w.audio, back), true);
  assert.deepEqual(w.seq.synth.pattern, S.synth.pattern);
  assert.equal(w.audio.params.tempo, 174);
});

test('the address puts the beat after the #, which is never sent to a server', async () => {
  const u = await beatUrl({ app: 'Glass Groove', kind: 'loop', version: 1, pattern: new Array(16).fill(-1) }, 'https://example.test/wipelight/index.html?x=1#old');
  const url = new URL(u);
  assert.equal(url.search, '?x=1');
  assert.ok(url.hash.startsWith('#b='));
  assert.ok(beatFromHash(url.hash));
  assert.equal(beatFromHash('#other'), null);
  assert.equal(beatFromHash(''), null);
});

test('damaged, foreign or absurd links are refused with a plain reason', async () => {
  await assert.rejects(decodeBeat('!!!'), /not a beat/);
  await assert.rejects(decodeBeat('a'.repeat(30000)), /not a beat/);
  await assert.rejects(decodeBeat('AAAAAAAA'), /damaged/);
  const other = await encodeBeat({ app: 'SomethingElse', kind: 'loop' });
  await assert.rejects(decodeBeat(other), /not a beat/);
  const notLoop = await encodeBeat({ app: 'Glass Groove', kind: 'clip' });
  await assert.rejects(decodeBeat(notLoop), /not a beat/);
});

test('a relative from the DreVelopDrop family is accepted, and bad contents never half-load', async () => {
  const w = load();
  const before = JSON.stringify(snapshot(w.seq, w.audio));
  const legacy = await decodeBeat(await encodeBeat({ app: 'DreVelopDrop', kind: 'loop', version: 1, pattern: [9, 9, 9], drummers: [], params: {} }));
  assert.equal(applySnapshot(w.seq, w.audio, legacy), false);
  assert.equal(JSON.stringify(snapshot(w.seq, w.audio)), before, 'a bad beat changed nothing');
});
