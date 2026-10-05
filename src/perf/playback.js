/* Wipelight: playback of a recorded performance (.sqz).
   One engine, used by the Studio and by the instrument itself (drop a file on the page). It re-plays what the instrument did, every note and drum hit on
   the audio clock and every knob, light, picture, squeegee move and press, through the same synth and visuals as the live instrument. No DOM in here. */
import { timed } from '../events.js';
import { LIGHTS } from '../engine/styles.js';
import { C, decode, stateAt, indexAt, pump } from './format.js';

export function createPlayback({ audio: A, visual: V, makeClock, onLight }) {
  const PB = { perf: null, playing: false, onEnd: null, onChange: null };
  let idx = 0, T0 = 0, clock = null, needsSeek = true, startAt = 0;
  const changed = () => { if (PB.onChange) PB.onChange(); };
  const light = (i) => { V.setLight(i); if (onLight) onLight(i); };

  /* each event code -> what to do; `at` is the audio-clock time it should happen */
  const handlers = {
    [C.noteOn]: (at, midi, vel, accent, base) => A.noteOn(at, midi, vel, !!accent, base),
    [C.noteOff]: (at) => A.noteOff(at),
    [C.kick]: (at, v) => { A.kick(at, v); timed.push(at, 'kick'); },
    [C.snare]: (at, v) => { A.snare(at, v); timed.push(at, 'snare'); },
    [C.hat]: (at, v, open) => { A.hat(at, v, !!open); timed.push(at, v < 0.3 ? 'ghost' : 'hat'); },
    [C.param]: (at, key, v) => A.setParam(key, v, at),
    [C.light]: (at, i) => light(i),
    [C.wipe]: (at, x, y, px, py, size) => { const [w, h] = V.cssSize(); V.wipe(x * w, y * h, px * w, py * h, size); },
    [C.kaleido]: (at, n) => V.setKaleido(n),
    [C.squeak]: (at, speed, x) => A.squeak(speed, x, at),
    [C.sweep]: (at, which, hz, secs) => A.sweep(which ? 'lp' : 'hp', hz, at, secs),
    [C.gap]: (at, secs) => A.gap(at, secs),
    [C.impact]: (at, size) => { A.impact(at, size); timed.push(at, 'drop'); },
    [C.riser]: (at, on, variant) => { A.riser(!!on, variant, at); if (on) timed.push(at, 'build', variant); else V.setBuild(0); },
    [C.kit]: (at, i) => { if (A.kitNames[i]) A.setKit(A.kitNames[i]); },
    [C.scene]: (at, i) => V.setScene(i),
    [C.press]: (at, x, y, id, force) => V.press(x, y, id, force),
  };

  /* bring every setting to what it was at time t (used at the start and after a seek) */
  function applyState(t) {
    const st = stateAt(PB.perf.events, t), snap = PB.perf.snapshot || {}, now = A.now();
    A.noteOff(now); A.squeak(0); A.riser(false, 0, now);
    A.openUp(now, 0);                                         // a seek can land mid-build: start from open filters
    if (snap.kit && A.kits[snap.kit]) A.setKit(snap.kit);
    for (const [k, v] of Object.entries(snap.params || {})) if (typeof v === 'number') A.setParam(k, v);
    for (const [k, v] of Object.entries(st.params)) A.setParam(k, v);
    if (st.kit != null && A.kitNames[st.kit]) A.setKit(A.kitNames[st.kit]);
    light(st.light != null ? st.light : (LIGHTS[snap.light] ? snap.light : 0));
    V.setKaleido(st.kaleido || 8);
    V.setScene(st.scene != null ? st.scene : (Number.isInteger(snap.scene) ? snap.scene : 0));
    V.setBuild(0);
  }

  PB.position = () => (!PB.perf ? 0 : !A.ready || needsSeek ? startAt : Math.min(PB.perf.duration, Math.max(0, A.now() - T0)));

  PB.seek = (t) => {
    if (!PB.perf) return;
    t = Math.min(PB.perf.duration, Math.max(0, t));
    idx = indexAt(PB.perf.events, t);
    if (!A.ready) { startAt = t; needsSeek = true; changed(); return; }
    applyState(t);
    T0 = A.now() + 0.15 - t;                       // audio time at which the performance's t=0 would have happened
    needsSeek = false;
    changed();
  };

  function tick() {
    if (!PB.playing || !PB.perf) return;
    const now = A.now();
    idx = pump(PB.perf.events, idx, now, T0, handlers, A.lookahead);
    if (now - T0 >= PB.perf.duration + 1.5) finish();
    changed();
  }

  function finish() {
    PB.playing = false;
    if (clock) clock.stop();
    A.noteOff(A.now()); A.riser(false, 0, A.now());
    changed();
    if (PB.onEnd) PB.onEnd();
  }

  PB.play = async () => {
    if (!PB.perf) return;
    if (!A.ready) await A.init();
    await A.resume();
    const atEnd = !needsSeek && PB.position() >= PB.perf.duration - 0.05;
    if (needsSeek || atEnd) PB.seek(atEnd ? 0 : startAt);
    PB.playing = true;
    clock = clock || makeClock(tick);                         // a background-thread heartbeat: keeps time even if this tab is covered
    clock.start();
    changed();
  };

  PB.pause = async () => {
    PB.playing = false;
    if (clock) clock.stop();
    try { await A.ctx().suspend(); } catch (err) { /* nothing to pause */ }
    changed();
  };
  PB.toggle = () => (PB.playing ? PB.pause() : PB.play());

  /** Leave playback altogether (the instrument takes the audio back). */
  PB.close = async () => {
    PB.playing = false;
    if (clock) clock.stop();
    if (A.ready) { A.noteOff(A.now()); A.riser(false, 0, A.now()); try { await A.resume(); } catch (err) { /* fine */ } }
    V.setBuild(0);
    V.replay = false;
    PB.perf = null;
    changed();
  };

  /** Load an already-decoded performance document (the Studio hands over edited ones). */
  PB.set = async (doc) => {
    if (PB.playing) await PB.pause();
    PB.perf = doc;
    V.replay = true;
    timed.clear();
    idx = 0; startAt = 0; needsSeek = true;
    if (A.ready) PB.seek(0);                                  // otherwise audio is created on the first play (browsers need a click for that)
    changed();
    return doc;
  };

  /** bytes of a .sqz (gzip or plain JSON) -> loaded. Throws a readable error if it is not a performance. */
  PB.load = async (bytes) => PB.set(await decode(bytes));

  return PB;
}
