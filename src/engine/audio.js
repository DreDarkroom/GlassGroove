/* Wipelight: the audio engine.
   One mono analogue-style bass voice (2 saws + square sub -> drive -> 24dB ladder-ish filter, ducked by the kick), drum kits, builds and drops
   (master filters, riser, gap, impact), and a tray (echo + room) everything can be dipped in.

   A factory, not a global: `createAudio()` makes an engine you can start live (`init()`) or point at an OfflineAudioContext (`attach(ctx)`),
   which is how the Studio renders a recording to a file faster than real time and how the benchmark measures the cost of the sound. */
import { clamp, mtof, dbToGain, round } from '../util.js';
import { KITS, KIT_NAMES } from './kits.js';

export const PART_DB = ['kickDb', 'snareDb', 'hatDb', 'bassDb'];
export const DB_RANGE = [-24, 12];
const BASS_TRIM = 0.68;                                   // measured in a browser: the bass alone was ~1.5x everything else together
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];    // the classic "808" set of square-wave ratios: a metallic, inharmonic shimmer
const cutHz = (x) => 50 * Math.pow(2, clamp(x, 0, 1) * 7.6);   // 0..1 -> 50 Hz .. ~9.7 kHz

export function createAudio(opts = {}) {
  const P = {
    cutoff: 0.42, reso: 0.4, decay: 0.38, drive: 0.22, glide: 0.18, space: 0.3,
    tempo: 119, mod: 0.5, lift: 0, breath: 0, root: 45, level: 0.75, duck: 0.5,
    kickDb: 0, snareDb: 0, hatDb: 0, bassDb: 0,           // fine balance of each part, in decibels (mouse wheel over a part)
  };
  const A = {
    ready: false, params: P, kitNames: KIT_NAMES, kits: KITS, kitName: 'safelight', PART_DB, DB_RANGE,
    /* 'mobile' asks the phone for a big, safe buffer (a small one is what makes phones crackle), looks further ahead and uses cheaper processing. */
    profile: 'desktop', lookahead: 0.18, eco: false, oversample: opts.oversample || '2x',                    // the soft clip only bends the top 3 dB and the limiter sits in front of it: 2x is enough (4x is a switch in developer mode)
    /* The room's tail follows a curve that is down 35 dB after 2.2 s of its 2.8 s: the last 0.6 s cost a fifth of the convolution and are inaudible under the mix. */
    roomSeconds: opts.roomSeconds || 2.2,
    squeakAlways: !!opts.squeakAlways,                     // true = the original: a noise source runs all the time, even in silence
    hook: null,                                            // set by the performance recorder: (audioTime, code, ...args)
    onState: null,                                         // set by the interface: 'running' | 'suspended' | 'interrupted' | 'closed'
    stats: { nodes: 0, hits: 0 },                          // for developer mode: audio nodes made, sounds scheduled
    dev: { metal: true },
  };
  const trim = { kick: 1, snare: 1, hat: 1 };              // linear gains from the dB settings, applied as each hit is scheduled
  let ctx, offline = false, kit = KITS.safelight;
  let dry, fxIn, comp, master, mhp, mlp, gapGain, limiter, guard, analyser, bins, noiseBuf, metalBuf, voice, echo, squeak, mediaDest, bassDuck, bassLevel, room;
  let riser = null, openHat = null;
  const mstate = { hp: 20, lp: 20000 };                    // where the master filters are heading (for chaining sweeps)

  /* every node comes through here so developer mode can count them */
  const mk = (kind, ...a) => { A.stats.nodes++; return ctx[kind](...a); };
  const G = () => mk('createGain');
  const hook = (t, code, ...args) => { if (A.hook) A.hook(t, code, ...args); };

  A.now = () => (ctx ? ctx.currentTime : 0);
  A.ctx = () => ctx;
  A.tapSource = () => guard;                               // the final output (limited and soft-clipped): what recordings capture
  A.resume = () => (ctx && ctx.resume ? ctx.resume() : Promise.resolve());
  A.info = () => (ctx ? { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency || 0 } : null);
  /** How long after a sound is scheduled it is actually heard (a phone's buffer is big): the picture waits this long to stay in time. */
  A.lag = () => (ctx && !offline ? Math.min(0.4, Math.max(0, ctx.outputLatency || ctx.baseLatency || 0)) : 0);

  /** Everything the final output goes through, as a stream (used for video capture). */
  A.stream = () => {
    if (!ctx) return null;
    if (!mediaDest) { mediaDest = ctx.createMediaStreamDestination(); guard.connect(mediaDest); }
    return mediaDest.stream;
  };

  A.setKit = (name) => {
    if (!KITS[name]) return false;
    kit = KITS[name];
    A.kitName = name;
    if (ctx) hook(ctx.currentTime, 15, KIT_NAMES.indexOf(name));
    return true;
  };

  /** Start live audio. */
  A.init = async () => {
    if (ctx) return ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    const mobile = A.profile === 'mobile', hint = mobile ? 'playback' : 'interactive';   // 'playback' = a bigger buffer: far fewer dropouts
    ctx = new AC({ latencyHint: hint });
    // MP3 encoders only speak 32 / 44.1 / 48 kHz; if the device runs at something else (e.g. 96 kHz), ask for 48 kHz.
    if (![32000, 44100, 48000].includes(ctx.sampleRate)) { await ctx.close(); ctx = new AC({ latencyHint: hint, sampleRate: 48000 }); }
    ctx.onstatechange = () => { if (A.onState) A.onState(ctx.state); };
    A.lookahead = mobile ? 0.32 : 0.18;
    build();
    return ctx.resume();
  };

  /** Point the engine at an OfflineAudioContext (the Studio's faster-than-real-time render, tests and the benchmark). */
  A.attach = (offlineCtx) => { ctx = offlineCtx; offline = true; build(); };

  function build() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.008; comp.release.value = 0.22;
    master = ctx.createGain();
    master.gain.value = P.level * 0.9;
    // Builds and drops act on the whole mix: a high-pass that thins it out, a low-pass that muffles it, and a gap (brief silence).
    mhp = ctx.createBiquadFilter(); mhp.type = 'highpass'; mhp.frequency.value = 20;
    mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 20000;
    gapGain = ctx.createGain();
    // Two lines of defence for a loud PA and for recordings: a fast compressor catches most peaks, then a soft-clip guard (untouched below
    // about -3 dBFS, a smooth curve above that can never exceed 0.97) so nothing reaches the speakers or a file clipped.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
    const guardIn = ctx.createGain();
    guardIn.gain.value = 0.5;                              // the shaper only sees -1..1, so halve the signal to give it 6 dB of overs to catch
    guard = ctx.createWaveShaper();
    guard.curve = guardCurve();
    guard.oversample = A.profile === 'mobile' || A.eco ? '2x' : A.oversample;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.7;
    bins = new Uint8Array(analyser.frequencyBinCount);
    comp.connect(master); master.connect(mhp); mhp.connect(mlp); mlp.connect(gapGain); gapGain.connect(limiter);
    limiter.connect(guardIn); guardIn.connect(guard); guard.connect(analyser); analyser.connect(ctx.destination);
    dry = ctx.createGain();
    dry.connect(comp);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    metalBuf = bakeMetal();
    buildTray(); buildVoice(); buildSqueak();
    A.ready = true;
  }

  /** Soft clip: identity up to 0.7, then a tanh knee that approaches (but never reaches) 0.97. Input is x/2 (see guardIn). */
  function guardCurve() {
    const n = 8193, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
      c[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27));
    }
    return c;
  }
  A.guardCurve = guardCurve;

  /** The six metallic squares of the hat, summed ONCE into a buffer (band-limited, like a real oscillator), instead of six oscillators on every hit. */
  function bakeMetal() {
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.32), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (const f of METAL) {
      const f0 = f * 2;
      for (let h = 1; h * f0 < sr / 2; h += 2) {
        const w = (2 * Math.PI * h * f0) / sr, a = 4 / (Math.PI * h);
        for (let i = 0; i < len; i++) d[i] += a * Math.sin(w * i);
      }
    }
    return buf;
  }

  /* ---- the tray: dotted-eighth echo that darkens every pass, plus a noise-tail room ---- */
  function buildTray() {
    fxIn = ctx.createGain();
    echo = ctx.createDelay(2);
    echo.delayTime.value = (0.75 * 60) / P.tempo;
    const fb = ctx.createGain(), tone = ctx.createBiquadFilter();
    fb.gain.value = 0.42;
    tone.type = 'lowpass'; tone.frequency.value = 2200;
    fxIn.connect(echo); echo.connect(tone); tone.connect(fb); fb.connect(echo); tone.connect(comp);
    room = ctx.createConvolver();
    room.buffer = A.profile === 'mobile' ? impulse(1.4, 1.4, 2.6) : impulse(A.roomSeconds, 2.8, 2.6);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.5;
    if (!A.eco) fxIn.connect(room);
    room.connect(roomOut); roomOut.connect(comp);
  }

  /** Noise with a falling envelope. `sec` of it is kept, but the curve is shaped over `total` seconds, so cutting `sec` short only trims the quiet end. */
  function impulse(sec, total, curve) {
    const len = Math.floor(ctx.sampleRate * sec), whole = ctx.sampleRate * total, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / whole, curve);
    }
    return buf;
  }

  /** The battery saver: no convolution room (the most expensive part of the mix), a cheaper output stage, simpler hats. */
  A.setEco = (on) => {
    on = !!on;
    if (on === A.eco) return;
    A.eco = on;
    A.setRoom(!on);
    if (guard) guard.oversample = on || A.profile === 'mobile' ? '2x' : A.oversample;
  };
  A.setRoom = (on) => { if (!ctx) return; try { if (on) fxIn.connect(room); else fxIn.disconnect(room); } catch (err) { /* already in that state */ } };
  A.setOversample = (v) => { A.oversample = v; if (guard) guard.oversample = A.eco || A.profile === 'mobile' ? '2x' : v; };

  /* ---- the bass voice ---- */
  const driveCurve = (d) => {
    const n = 512, c = new Float32Array(n), k = 1 + d * 10, norm = Math.tanh(k);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
    return c;
  };

  function buildVoice() {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
    o1.type = o2.type = 'sawtooth'; o2.detune.value = 9; sub.type = 'square';
    const mix = ctx.createGain();
    for (const [o, lvl] of [[o1, 0.22], [o2, 0.22], [sub, 0.17]]) { const g = ctx.createGain(); g.gain.value = lvl; o.connect(g); g.connect(mix); o.start(); }
    const shaper = ctx.createWaveShaper();
    shaper.oversample = A.profile === 'mobile' ? 'none' : '2x';
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'lowpass'; f2.Q.value = 0.5; f1.frequency.value = f2.frequency.value = cutHz(P.cutoff);
    const vca = ctx.createGain();
    vca.gain.value = 0;
    bassDuck = ctx.createGain();                           // the kick ducks the bass for a moment (like sidechain compression)
    bassDuck.gain.value = BASS_TRIM;
    const rumble = ctx.createBiquadFilter();               // nothing useful below ~36 Hz: it only eats headroom
    rumble.type = 'highpass'; rumble.frequency.value = 36;
    const send = ctx.createGain();
    bassLevel = ctx.createGain();
    bassLevel.gain.value = dbToGain(P.bassDb);
    mix.connect(shaper); shaper.connect(f1); f1.connect(f2); f2.connect(vca); vca.connect(bassDuck); bassDuck.connect(bassLevel);
    bassLevel.connect(rumble); rumble.connect(dry); rumble.connect(send); send.connect(fxIn);
    voice = { o1, o2, sub, f1, f2, vca, send, shaper };
    for (const k of ['reso', 'drive', 'space']) A.setParam(k, P[k]);
  }

  /** `t` (optional) is the audio time the change takes effect: the Studio's offline render schedules every move in advance. */
  A.setParam = (k, val, t) => {
    if (PART_DB.includes(k)) {
      val = clamp(val, DB_RANGE[0], DB_RANGE[1]);
      if (k !== 'bassDb') trim[k.slice(0, -2)] = dbToGain(val);
    }
    P[k] = val;
    if (!ctx) return;
    if (t == null) t = ctx.currentTime;
    if (typeof val === 'number' && k !== 'breath') hook(t, 5, k, round(val, 3));
    if (k === 'reso') voice.f1.Q.setTargetAtTime(0.7 + val * val * 16, t, 0.02);
    else if (k === 'drive') voice.shaper.curve = driveCurve(val);
    else if (k === 'space') voice.send.gain.setTargetAtTime(val * 0.9, t, 0.02);
    else if (k === 'tempo') echo.delayTime.setTargetAtTime((0.75 * 60) / val, t, 0.05);
    else if (k === 'level') master.gain.setTargetAtTime(val * 0.9, t, 0.02);
    else if (k === 'bassDb') bassLevel.gain.setTargetAtTime(dbToGain(val), t, 0.03);
  };

  A.noteOn = (t, midi, vel, accent, baseOverride) => {
    if (!ctx) return;
    const f = mtof(midi), tau = 0.004 + P.glide * 0.09;
    voice.o1.frequency.setTargetAtTime(f, t, tau);
    voice.o2.frequency.setTargetAtTime(f, t, tau);
    voice.sub.frequency.setTargetAtTime(f / 2, t, tau);
    const base = baseOverride != null ? baseOverride : cutHz(P.cutoff + (P.mod - 0.5) * 0.6 + P.lift + P.breath);
    hook(t, 0, midi, round(vel, 2), accent ? 1 : 0, round(base, 1));
    const peak = Math.min(base * Math.pow(2, 2.5 + (accent ? 1.2 : 0)), 14000), dec = 0.03 + P.decay * 0.32;
    for (const fl of [voice.f1, voice.f2]) {
      fl.frequency.cancelScheduledValues(t);
      fl.frequency.setTargetAtTime(peak, t, 0.003);
      fl.frequency.setTargetAtTime(base, t + 0.02, dec);
    }
    voice.vca.gain.cancelScheduledValues(t);
    voice.vca.gain.setTargetAtTime(vel, t, 0.004);
    A.stats.hits++;
  };

  A.noteOff = (t) => {
    if (!ctx) return;
    hook(t, 1);
    voice.vca.gain.cancelScheduledValues(t);
    voice.vca.gain.setTargetAtTime(0, t, 0.05);
  };

  A.note = (t, midi, vel, dur, accent) => { A.noteOn(t, midi, vel, accent); A.noteOff(t + dur); };

  /* ---- drums ---- */
  function route(node, send) {
    node.connect(dry);
    if (send > 0) { const s = G(); s.gain.value = send; node.connect(s); s.connect(fxIn); }
  }

  function burst(t, o) {
    const src = mk('createBufferSource'), f = mk('createBiquadFilter'), g = G();
    src.buffer = o.buf || noiseBuf;
    f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    src.connect(f); f.connect(g);
    route(g, o.send || 0);
    src.start(t, o.buf ? 0 : Math.random() * 1.5, o.dur + 0.05);
    return g;
  }

  function tone(t, type, f0, f1, sweep, dur, gain, send) {
    const o = mk('createOscillator'), g = G();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    route(g, send || 0);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** The bass dips as the kick lands, then swells back: keeps the low end clear (depth = the Duck setting). */
  function duckAt(t) {
    if (!bassDuck || P.duck <= 0) return;
    const g = bassDuck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(BASS_TRIM * (1 - P.duck * 0.7), t);
    g.linearRampToValueAtTime(BASS_TRIM, t + 0.16);
  }

  A.kick = (t, vel = 1) => {
    if (!ctx) return;
    hook(t, 2, round(vel, 2));
    const k = kit.kick, v = vel * trim.kick;
    tone(t, 'sine', k.f0, k.f1, k.sweep, k.decay, v, 0);
    if (k.sub) tone(t, 'sine', k.f1 * 0.9, k.f1 * 0.9, 0, k.decay * 1.4, v * k.sub, 0);
    burst(t, { type: 'highpass', freq: 2500, dur: 0.012, gain: k.click * v });
    duckAt(t);
    A.stats.hits++;
  };

  A.snare = (t, vel = 1) => {
    if (!ctx) return;
    hook(t, 3, round(vel, 2));
    vel *= trim.snare;
    const s = kit.snare;
    burst(t, { type: 'bandpass', freq: s.nf, q: s.nq, dur: s.nd, gain: s.ng * vel, send: s.send * P.space });
    tone(t, 'triangle', s.tf0, s.tf1, 0.08, s.td, s.tg * vel, 0);
    if (s.clap) for (const [dt, d] of [[0, 0.03], [0.011, 0.03], [0.022, 0.14]]) burst(t + dt, { type: 'bandpass', freq: 1300, q: 1.1, dur: d, gain: 0.3 * vel, send: s.send * P.space });   // three quick slaps, then the tail
    A.stats.hits++;
  };

  A.hat = (t, vel = 1, open) => {
    if (!ctx) return;
    hook(t, 4, round(vel, 2), open ? 1 : 0);
    vel *= trim.hat;
    const h = kit.hat, dur = open ? h.od : h.cd;
    if (openHat) { openHat.gain.cancelScheduledValues(t); openHat.gain.setTargetAtTime(0, t, 0.005); openHat = null; }   // any new hat chokes an open one
    let g;
    if (h.metal && !A.eco && A.dev.metal) g = burst(t, { buf: metalBuf, type: 'highpass', freq: h.hp, q: 1, dur, gain: h.g * vel * 0.6 });   // eco swaps the metal hat for plain noise
    else g = burst(t, { type: 'highpass', freq: h.hp, dur, gain: (open ? h.g * 0.8 : h.g) * vel * 1.15 });
    if (open) openHat = g;
    A.stats.hits++;
  };

  /* ---- the squeegee's squeak: filtered noise following the drag ---- */
  /* The noise source is only running while you are dragging (a second after the last movement it stops), not all the time. */
  function buildSqueak() {
    const bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 14; bp.frequency.value = 1500;
    g.gain.value = 0;
    bp.connect(g); g.connect(dry);
    squeak = { bp, g, src: null, off: 0 };
    if (A.squeakAlways) startSqueak();
  }
  function startSqueak() {
    if (squeak.src) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    src.connect(squeak.bp);
    src.start();
    squeak.src = src;
  }

  let lastSq = { t: -1, s: -1, x: -1 };
  A.squeak = (speed, x = 0.5, at) => {
    if (!squeak) return;
    const t = at == null ? ctx.currentTime : at;
    if (speed === 0 || t - lastSq.t > 0.04 || Math.abs(speed - lastSq.s) > 0.15 || Math.abs(x - lastSq.x) > 0.03) { hook(t, 10, round(speed, 2), round(x, 2)); lastSq = { t, s: speed, x }; }
    if (speed > 0) { startSqueak(); clearTimeout(squeak.off); squeak.off = 0; }
    squeak.g.gain.setTargetAtTime(clamp(speed, 0, 1) * 0.09, t, 0.03);
    squeak.bp.frequency.setTargetAtTime(900 + x * 2800, t, 0.03);
    if (speed === 0 && squeak.src && !A.squeakAlways && !offline && !squeak.off) {
      squeak.off = setTimeout(() => { if (squeak.src) { squeak.src.stop(); squeak.src.disconnect(); squeak.src = null; } squeak.off = 0; }, 1000);
    }
  };

  /* ---------------- builds and drops ---------------- */

  /** Move a master filter to `toHz`: over `dur` seconds starting at time t (dur 0 = at once). which: 'hp' | 'lp'. */
  A.sweep = (which, toHz, t, dur) => {
    if (!ctx) return;
    hook(t, 11, which === 'hp' ? 0 : 1, Math.round(clamp(toHz, 10, 20000)), round(dur, 2));
    sweepImpl(which, toHz, t, dur);
  };

  // the same move without recording it: a riser already records itself, and replaying both would sweep twice
  function sweepImpl(which, toHz, t, dur) {
    const node = which === 'hp' ? mhp : mlp;
    toHz = clamp(toHz, 10, 20000);
    node.frequency.cancelScheduledValues(t);
    node.frequency.setValueAtTime(mstate[which], t);
    if (dur > 0) node.frequency.exponentialRampToValueAtTime(toHz, t + dur); else node.frequency.setValueAtTime(toHz, t);
    mstate[which] = toHz;
  }

  /** A brief silence (the breath before a drop). */
  A.gap = (t, dur) => {
    if (!ctx) return;
    hook(t, 12, round(dur, 2));
    const g = gapGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t); g.linearRampToValueAtTime(0, t + 0.012); g.setValueAtTime(0, t + dur); g.linearRampToValueAtTime(1, t + dur + 0.004);
  };

  /** The hit of a drop: a sub boom that falls, and a crash. size 0..2 (1 = normal). */
  A.impact = (t, size = 1) => {
    if (!ctx) return;
    hook(t, 13, round(size, 2));
    tone(t, 'sine', 78, 24, 0.85, 1.25, 0.95 * size, 0);
    tone(t, 'sine', 39, 24, 0.85, 1.6, 0.6 * size, 0);
    burst(t, { type: 'highpass', freq: 2600, dur: 1.9, gain: 0.3 * size, send: 0.5 });
    burst(t, { type: 'bandpass', freq: 900, q: 0.6, dur: 0.5, gain: 0.25 * size, send: 0.3 });
  };

  /**
   * The riser that goes with a build. variant 0 "lift": noise climbing while the mix thins out (high-pass rising).
   * variant 1 "sink": the mix goes under water (low-pass falling toward nothing) while a low rumble swells. on=false at time t stops it.
   */
  A.riser = (on, variant, t) => {
    if (!ctx) return;
    if (t == null) t = ctx.currentTime;
    hook(t, 14, on ? 1 : 0, variant ? 1 : 0);
    if (on && !riser) {
      let rumble = null, rumbleGain = null;
      const src = mk('createBufferSource'), bp = mk('createBiquadFilter'), g = G();
      src.buffer = noiseBuf; src.loop = true;
      bp.type = 'bandpass'; bp.Q.value = variant ? 1.2 : 4;
      if (variant) {
        bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(260, t + 8);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.14, t + 6);
        sweepImpl('lp', 160, t, 7);
        rumble = mk('createOscillator'); rumbleGain = G();                // a low swell underneath: the pressure before a drop
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(38, t); rumble.frequency.linearRampToValueAtTime(52, t + 8);
        rumbleGain.gain.setValueAtTime(0.0001, t); rumbleGain.gain.linearRampToValueAtTime(0.3, t + 7);
        rumble.connect(rumbleGain);
        route(rumbleGain, 0);
        rumble.start(t);
      } else {
        bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(8000, t + 8);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.18, t + 7);
        sweepImpl('hp', 1100, t, 9);
      }
      src.connect(bp); bp.connect(g);
      route(g, 0.4);
      src.start(t);
      riser = { src, g, rumble, rumbleGain };
    } else if (!on && riser) {
      riser.g.gain.cancelScheduledValues(t); riser.g.gain.setTargetAtTime(0, t, 0.03); riser.src.stop(t + 0.3);
      if (riser.rumble) { riser.rumbleGain.gain.cancelScheduledValues(t); riser.rumbleGain.gain.setTargetAtTime(0, t, 0.03); riser.rumble.stop(t + 0.3); }
      riser = null;
    }
  };

  /** Open both master filters again (the moment of the drop, or cancelling a build). */
  A.openUp = (t, dur = 0) => { A.sweep('hp', 20, t, dur); A.sweep('lp', 20000, t, dur); };

  A.level = () => {
    if (!analyser) return { bass: 0, mid: 0, high: 0 };
    analyser.getByteFrequencyData(bins);
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += bins[i]; return s / ((b - a) * 255); };
    return { bass: avg(1, 6), mid: avg(6, 40), high: avg(40, 200) };
  };

  return A;
}
