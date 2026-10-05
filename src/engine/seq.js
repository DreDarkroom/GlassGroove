/* Glass Groove: the sequencer.
   A 16-step bass line that re-writes itself every cycle, three drummers who each loop at a different length, styles, mutes, builds and drops
   that land on the beat, recordable clips that snap to the bar, and a slow "journey" of tempo and visuals.
   Everything that changes the music while it plays is queued to the next beat or bar, so it always lands in time. */
import { timed } from '../events.js';
import { clamp } from '../util.js';
import { LIGHTS, STYLES, euclid } from './styles.js';
import { makeClock } from './clock.js';

const clampDeg = (n) => clamp(n, 0, 7);
const CHORD_TONES = [0, 2, 4, 7];
const K_KICK = 0, K_SNARE = 1, K_HAT = 2, K_BASS = 3;       // clip event codes
const sanitize = (p, fallback) => (Array.isArray(p) && p.length === 16 ? p.map((n) => (Number.isInteger(n) && n >= -1 && n <= 7 ? n : -1)) : fallback);

export function createSeq(A, { emit = (...a) => timed.push(...a) } = {}) {
  const S = {
    playing: false, cycle: 0, light: 0, swing: 0.22, style: 0, scene: 0, dnb: false, quant: 'beat',
    lights: LIGHTS, styles: STYLES, euclid, PARTS: ['kick', 'snare', 'hat', 'bass'],
    synth: { pattern: [0, -1, 0, 2, -1, 4, -1, 3, 0, -1, 5, -1, 4, 2, -1, 7] },   // scale degrees 0..7 (7 = the octave), -1 = rest
    mute: { kick: false, snare: false, hat: false, bass: false },
    drift: 0.4, ghosts: [], clips: { drums: null, bass: null }, clipRec: null, build: null, dropAt: null, journey: null,
  };
  S.home = S.synth.pattern.slice();

  const drummer = (name, len, hits, rot) => ({ name, len, hits, rot, steps: euclid(hits, len, rot) });
  S.drummers = [drummer('kick', 16, 4, 1), drummer('snare', 12, 2, 3), drummer('hat', 14, 7, 0)];
  S.regen = (i) => { const d = S.drummers[i]; d.steps = euclid(d.hits, d.len, d.rot); };
  S.midi = (deg) => A.params.root + LIGHTS[S.light].scale[deg % 7] + 12 * Math.floor(deg / 7);
  S.toggleMute = (part, force) => { if (!(part in S.mute)) return false; S.mute[part] = force != null ? !!force : !S.mute[part]; return S.mute[part]; };

  /* ---- drift: the loop breathes around a "home" pattern ----
     Once per cycle at most one step moves. Steps on the beat barely move, the rest can be nudged a scale degree, dropped out, or brought back on a
     chord tone. The further the line is from home, the more likely a step is put back. drift = 0 freezes it exactly. */
  S.evolve = (pattern) => {
    const d = S.drift, rnd = Math.random;
    if (d <= 0 || S.home.every((n) => n < 0)) return pattern;           // a cleared line stays cleared: drift only varies something that exists
    const away = [];
    for (let i = 0; i < 16; i++) if (pattern[i] !== S.home[i]) away.push(i);
    const allowed = 1 + Math.round(d * 5) + Math.round(Math.max(0, d - 0.5) * 8);   // how many steps may differ from home; past the middle of the knob the leash lengthens
    if (away.length > allowed || (away.length && rnd() < 0.15)) { const i = away[Math.floor(rnd() * away.length)]; pattern[i] = S.home[i]; return pattern; }
    if (rnd() > 0.5 + d * 0.5) return pattern;                          // some cycles pass untouched
    const i = Math.floor(rnd() * 16), r = rnd(), notes = pattern.filter((n) => n >= 0).length;
    if (i % 4 === 0) { if (pattern[i] >= 0 && r < 0.3) pattern[i] = clampDeg(pattern[i] + (rnd() < 0.5 ? -1 : 1)); }
    else if (pattern[i] < 0) { if (notes < 11) pattern[i] = CHORD_TONES[Math.floor(rnd() * CHORD_TONES.length)]; }
    else if (r < 0.25) { if (notes > 7) pattern[i] = -1; }
    else pattern[i] = clampDeg(pattern[i] + (rnd() < 0.5 ? -1 : 1));
    return pattern;
  };

  /* ghost hats: faint extra hits that appear in the hat ring's empty steps and fade away (strength 0..1 per step). They never touch a written hat. */
  S.driftGhosts = () => {
    const d = S.drift, hat = S.drummers[2], rnd = Math.random;
    if (S.ghosts.length !== hat.len) S.ghosts = new Array(hat.len).fill(0);
    const g = S.ghosts;
    for (let i = 0; i < g.length; i++) g[i] = hat.steps[i] ? 0 : Math.max(0, g[i] - (0.06 + (1 - d) * 0.05));
    if (g.filter((x) => x > 0.15).length < Math.round(d * 7) && rnd() < 0.3 + d * 0.5) {
      const free = [];
      for (let i = 0; i < g.length; i++) if (!hat.steps[i] && g[i] <= 0.15) free.push(i);
      if (free.length) g[free[Math.floor(rnd() * free.length)]] = 0.5 + rnd() * 0.5;
    }
  };

  S.goHome = () => { S.synth.pattern = S.home.slice(); };

  /** Empty the bass line, the drums, or both (Drift will not refill an emptied bass line). */
  S.clear = (what = 'bass') => {
    if (what === 'bass' || what === 'all') { S.synth.pattern = new Array(16).fill(-1); S.home = S.synth.pattern.slice(); }
    if (what === 'drums' || what === 'all') { S.drummers.forEach((d) => { d.steps = new Array(d.len).fill(false); d.hits = 0; }); S.ghosts = []; }
  };

  /* ---------------- styles ---------------- */
  function applyStyleNow(i) {
    const st = STYLES[i];
    if (!st) return false;
    S.style = i;
    S.synth.pattern = st.bass.slice();
    S.home = S.synth.pattern.slice();
    [st.kick, st.snare, st.hat].forEach((spec, k) => {
      const d = S.drummers[k];
      d.len = spec.len; d.steps = spec.steps.slice(); d.hits = d.steps.filter(Boolean).length; d.rot = 0;
    });
    Object.assign(S, { ghosts: [], swing: st.swing, drift: st.drift, light: st.light, dnb: !!st.dnb, scene: st.scene });
    for (const k of S.PARTS) S.mute[k] = !!(st.mute && st.mute[k]);
    A.setKit(st.kit);
    for (const [k, v] of Object.entries(st.sound)) A.setParam(k, v);
    A.setParam('tempo', st.tempo);
    emit(A.now(), 'style', i);
    return true;
  }

  /** Switch style. While playing it waits for the next bar so it lands in time; `now` forces it at once. */
  S.applyStyle = (i, opts = {}) => {
    if (!STYLES[i]) return false;
    if (!S.playing || opts.now) return applyStyleNow(i);
    S.atNextBar(() => applyStyleNow(i));
    emit(A.now(), 'queued', 'style');
    return true;
  };

  /* ---------------- timing: the scheduler, and everything that has to land on a beat ---------------- */
  const stepDur = () => 60 / A.params.tempo / 4;
  let clock = null, nextTime = 0, tick = 0;
  S.barDur = () => stepDur() * 16;
  S._tick = () => tick;
  S._setTick = (n, t) => { tick = n; if (t != null) nextTime = t; };

  /** The first tick at or after the next one to be scheduled that falls on a boundary: 'now' | 'beat' | 'bar'. */
  S.nextBoundary = (mode = 'beat') => {
    const m = mode === 'bar' ? 16 : mode === 'beat' ? 4 : 1;
    let tk = tick;
    while (tk % m) tk++;
    return tk;
  };
  S.margin = () => nextTime - A.now();                       // developer mode: how far ahead of the audio clock the scheduler is (negative = a late sound)
  S.timeToTick = (tk) => Math.max(0, nextTime + (tk - tick) * stepDur() - A.now());   // seconds until a tick plays

  const pending = [];
  S.atNextBar = (fn) => { pending.push({ tick: S.nextBoundary('bar'), fn }); };


  /* ---------------- clips: record a part for some bars, then loop it (snapped to the bar) ---------------- */
  /** part: 'drums' | 'bass' | 'both'. Starts at the next bar and lasts `bars` bars. */
  S.recordClip = (part = 'drums', bars = 4) => {
    if (!S.playing || ![1, 2, 4, 8].includes(bars) || !['drums', 'bass', 'both'].includes(part)) return false;
    S.clipRec = { parts: part === 'both' ? ['drums', 'bass'] : [part], bars, startTick: S.nextBoundary('bar'), state: 'armed', events: { drums: [], bass: [] } };
    emit(A.now(), 'clipArmed', part, bars);
    return true;
  };
  S.cancelClip = () => { if (S.clipRec) { S.clipRec = null; emit(A.now(), 'clipCancel'); } };

  const capture = (part, tk, ev) => {
    const r = S.clipRec;
    if (r && r.state === 'recording' && r.parts.includes(part)) r.events[part].push([tk - r.startTick, ...ev]);
  };

  S.makeClip = (part, bars, events) => {
    const len = bars * 16, byTick = Array.from({ length: len }, () => []);
    for (const e of events) byTick[e[0]].push(e);
    return { part, bars, len, events, byTick, active: false, startTick: 0, bpm: A.params.tempo };
  };

  function finishClip() {
    const r = S.clipRec;
    S.clipRec = null;
    for (const part of r.parts) {
      const c = S.makeClip(part, r.bars, r.events[part]);
      S.clips[part] = c;
      c.active = true;                                      // it starts looping straight away, on the next bar
      c.startTick = tick + ((16 - (tick % 16)) % 16);
    }
    emit(A.now(), 'clipDone', r.parts.join('+'), r.bars);
  }

  S.playClip = (part, on = true) => {
    const c = S.clips[part];
    if (!c) return false;
    if (on) { c.startTick = S.nextBoundary('bar'); c.active = true; } else c.active = false;
    emit(A.now(), 'clipState', part, on);
    return true;
  };
  S.clearClip = (part) => { S.clips[part] = null; emit(A.now(), 'clipState', part, false); };
  const activeClip = (part, tk) => { const c = S.clips[part]; return c && c.active && tk >= c.startTick ? c : null; };

  /* ---------------- builds and drops ---------------- */
  /** Start a build now: variant 0 "lift" (kick drops out, snare roll, the mix thins) or 1 "sink" (the mix goes under water). */
  S.buildStart = (variant = 0, len = 8) => {
    if (!S.playing || S.build) return false;
    const t = A.now() + 0.02;
    S.build = { variant: variant ? 1 : 0, t0: t };
    S.dropAt = null;
    A.riser(true, variant ? 1 : 0, t, len);
    emit(t, 'build', variant ? 1 : 0);
    return true;
  };

  /** A surge: a long rise that drops by itself on a bar line `bars` bars from the next one. Returns the drop's tick, or 0 if it could not start. */
  S.surgeStart = (bars) => {
    if (!S.playing || S.build) return 0;
    const tk = S.nextBoundary('bar') + bars * 16;
    if (!S.buildStart(0, Math.max(8, S.timeToTick(tk) + 0.5))) return 0;
    S.dropAt = { tick: tk, variant: 0, surge: true };
    S.surgeTick = tk;
    emit(A.now(), 'dropArmed', S.timeToTick(tk));
    return tk;
  };
  /** Move a surge's drop by whole bars (never before the next bar). Returns the new tick. */
  S.surgeShift = (bars) => {
    if (!S.dropAt || !S.dropAt.surge) return 0;
    S.dropAt.tick = Math.max(S.nextBoundary('bar'), S.dropAt.tick + bars * 16);
    S.surgeTick = S.dropAt.tick;
    return S.surgeTick;
  };
  /** Bring a surge's drop to the next beat. */
  S.surgeNow = () => { if (!S.dropAt || !S.dropAt.surge) return 0; S.dropAt.tick = S.nextBoundary('beat'); S.surgeTick = S.dropAt.tick; return S.surgeTick; };

  /** Let go: the drop lands on the next beat or bar (whichever Quantise is set to). */
  S.buildRelease = () => {
    if (!S.build || S.dropAt) return false;
    S.dropAt = { tick: S.nextBoundary(S.quant), variant: S.build.variant };
    emit(A.now(), 'dropArmed', S.timeToTick(S.dropAt.tick));
    return true;
  };

  function doDrop(t, variant) {
    const gapLen = Math.min(0.11, stepDur() * 0.85);
    A.gap(t - gapLen, gapLen);                              // a breath of silence, then the hit
    A.riser(false, variant, t);
    A.openUp(t, variant ? 0.03 : 0);                        // the filters snap open
    A.impact(t, 1);
    A.kick(t, 1);
    A.note(t, S.midi(0) - 12, 1, stepDur() * 7, true);      // a deep bass note under the drop
    emit(t, 'kick');
    emit(t, 'drop', variant);
    if (S.onDrop) { const f = S.onDrop; S.onDrop = null; f(variant); }
    S.build = null;
    S.dropAt = null;
    S.surgeTick = 0;
  }

  /** Cancel a build without a drop (stop pressed, or the music stopped). */
  S.buildCancel = () => {
    S.onDrop = null;
    if (!S.build) return;
    const t = A.now();
    A.riser(false, S.build.variant, t);
    A.openUp(t, 0.3);
    S.build = null;
    S.surgeTick = 0;
    S.dropAt = null;
  };
  S.setQuant = (m) => { if (['now', 'beat', 'bar'].includes(m)) S.quant = m; return S.quant; };

  /* ---------------- journey: tempo creeps up and the picture progresses, bar by bar ---------------- */
  S.journeyStart = (opts = {}) => {
    const to = Number.isFinite(opts.to) ? clamp(opts.to, 60, 200) : null, bars = Math.round(clamp(opts.bars || 64, 4, 1024));
    if (to == null) return false;
    S.journey = { from: A.params.tempo, to, bars, startTick: S.nextBoundary('bar'), scenes: opts.scenes !== false, lastScene: -1 };
    emit(A.now(), 'journey', 0);
    return true;
  };
  S.journeyStop = () => { if (S.journey) { S.journey = null; emit(A.now(), 'journeyEnd'); } };

  function journeyStep(tk, t) {
    const j = S.journey;
    if (!j || tk < j.startTick) return;
    const p = Math.min(1, (tk - j.startTick) / 16 / j.bars);
    A.setParam('tempo', Math.round((j.from + (j.to - j.from) * p) * 10) / 10);
    emit(t, 'journey', p);
    if (j.scenes) {
      const scene = Math.min(3, Math.floor(p * 4));
      if (scene !== j.lastScene) { j.lastScene = scene; S.scene = scene; emit(t, 'scene', scene); }
    }
    if (p >= 1) S.journeyStop();
  }

  /* ---------------- the scheduler ---------------- */
  const fire = {
    kick(st, vel, tk) { if (S.mute.kick || (S.build && S.build.variant === 0)) return; A.kick(st, vel); emit(st, 'kick'); capture('drums', tk, [K_KICK, Math.round(vel * 100) / 100]); },
    snare(st, vel, tk) { if (S.mute.snare) return; A.snare(st, vel); emit(st, 'snare'); capture('drums', tk, [K_SNARE, Math.round(vel * 100) / 100]); },
    hat(st, vel, open, tk, ghost) { if (S.mute.hat) return; A.hat(st, vel, open); emit(st, ghost ? 'ghost' : 'hat'); capture('drums', tk, [K_HAT, Math.round(vel * 100) / 100, open ? 1 : 0]); },
    bass(st, midi, vel, durTicks, accent, tk, sd) { if (S.mute.bass) return; A.note(st, midi, vel, durTicks * sd, accent); emit(st, 'note', midi); capture('bass', tk, [K_BASS, midi, Math.round(vel * 100) / 100, accent ? 1 : 0, durTicks]); },
  };

  function play(tk, t) {
    const sd = stepDur(), step = tk % 16;
    if (step === 0) {
      if (tk > 0) {
        S.cycle++;
        S.synth.pattern = sanitize(S.evolve(S.synth.pattern.slice()), S.synth.pattern);
        S.driftGhosts();
        emit(t, 'cycle', S.cycle);
        if (S.onBar) S.onBar(S.cycle, t);                      // from the scheduler itself, so it keeps counting when the picture is not drawing (the page is hidden)
      }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].tick <= tk) pending.splice(i, 1)[0].fn();
      journeyStep(tk, t);
    }
    const r = S.clipRec;
    if (r) {
      if (r.state === 'armed' && tk >= r.startTick) { r.state = 'recording'; emit(t, 'clipRec', r.parts.join('+'), r.bars); }
      else if (r.state === 'recording' && tk >= r.startTick + r.bars * 16) finishClip();
    }
    if (S.dropAt && tk >= S.dropAt.tick) doDrop(t, S.dropAt.variant);

    const st = t + (tk % 2 ? S.swing * sd : 0);              // Bounce: odd sixteenths arrive late
    // Aperture breathes on two slow waves of different lengths, so it never repeats exactly
    A.params.breath = (Math.sin((tk / 256) * Math.PI * 2) * 0.08 + Math.sin((tk / 400) * Math.PI * 2) * 0.05) * Math.min(2, S.drift / 0.3);

    // bass (a clip replaces the written line while it plays)
    const bc = activeClip('bass', tk);
    if (bc) for (const e of bc.byTick[(tk - bc.startTick) % bc.len]) fire.bass(st, e[2], e[3], e[5], e[4], tk, sd);
    else {
      const pat = S.synth.pattern, deg = pat[step];
      if (deg >= 0) { const accent = step % 4 === 0; fire.bass(st, S.midi(deg), accent ? 0.9 : 0.62, pat[(step + 1) % 16] >= 0 ? 1.15 : 0.8, accent, tk, sd); }
    }
    emit(st, 'step', step);

    // drums
    const dc = activeClip('drums', tk);
    if (dc) {
      for (const e of dc.byTick[(tk - dc.startTick) % dc.len]) {
        if (e[1] === K_KICK) fire.kick(st, e[2], tk);
        else if (e[1] === K_SNARE) fire.snare(st, e[2], tk);
        else if (e[1] === K_HAT) fire.hat(st, e[2], !!e[3], tk, e[2] < 0.3);
      }
      S.drummers.forEach((d, i) => emit(st, 'd', i, tk % d.len));
    } else {
      S.drummers.forEach((d, i) => {
        const idx = tk % d.len;
        emit(st, 'd', i, idx);
        if (!d.steps[idx]) {
          const gh = i === 2 ? S.ghosts[idx] || 0 : 0;
          if (gh > 0.15 && Math.random() < gh) fire.hat(st, 0.18 + 0.2 * gh, false, tk, true);
        } else if (i === 0) fire.kick(st, 0.95, tk);
        else if (i === 1) fire.snare(st, 0.8, tk);
        else fire.hat(st, idx % 2 ? 0.35 : 0.5, idx % 7 === 0, tk, false);
      });
    }

    // a "lift" build adds a snare roll that speeds up the longer you hold it
    if (S.build && S.build.variant === 0) {
      const el = t - S.build.t0, every = el < 1 ? 0 : el < 2.5 ? 4 : el < 4 ? 2 : 1;
      if (every && tk % every === 0) {
        const vel = Math.min(1, 0.4 + el * 0.1);
        fire.snare(st, vel, tk);
        if (el > 6) fire.snare(st + sd / 2, vel * 0.8, tk);
      }
    }
  }

  function pump() {
    const now = A.now();
    if (nextTime < now - 0.25) {                              // the page stalled (a busy frame, a call, the phone sleeping): skip what was missed, so it does not all play at once
      const skip = Math.ceil((now + 0.05 - nextTime) / stepDur());
      nextTime += skip * stepDur(); tick += skip;
      S.stalls = (S.stalls || 0) + 1;
    }
    while (nextTime < now + A.lookahead) { play(tick, nextTime); nextTime += stepDur(); tick++; }
  }

  S.tickOnce = play;                                         // tests and the benchmark drive the sequencer by hand
  S.start = () => {
    if (S.playing) return;
    S.playing = true; tick = 0; nextTime = A.now() + 0.08;
    clock = clock || makeClock(pump);
    clock.start();
  };
  S.stop = () => { S.buildCancel(); S.cancelClip(); S.playing = false; if (clock) clock.stop(); A.noteOff(A.now()); };

  return S;
}
