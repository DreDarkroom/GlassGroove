/* Glass Groove: the picture.
   A small scene is folded into a kaleidoscope, fed back into itself as a tunnel, tinted by the light you chose, and hidden behind a fog you wipe away
   with a squeegee (which now leaves drips, because it is wet). Presses anywhere stir the generator (see press.js).

   Faster than the original in four ways, all measured with the developer-mode benchmark:
   - the kaleidoscope draws only the wedge of the scene that is ever seen (a fifth of the pixels), not the whole square once per fold;
   - the scene canvas is cleared and clipped to that wedge too;
   - the feedback tunnel ping-pongs between two canvases, so it never copies a canvas onto itself;
   - the wedge outline is built once, not on every fold of every frame. */
import { clamp, round } from '../util.js';
import { LIGHTS } from '../engine/styles.js';
import { timed } from '../events.js';
import { SCENES, SCENE_COUNT, TAU } from './scenes.js';
import { createPress, foldPoint } from './press.js';

const SC = 1024, PAD = 8;                                     // scene canvas size (scene units: centre = 512)
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* Quality: the picture renders at a fraction of screen resolution on slower machines. 'auto' starts high and steps down when frames stay slow, and back up
   after two smooth minutes (with a backoff if that fails); a person can also choose a level (key Q, or ?quality=low). */
const LEVELS = [
  { name: 'low', scale: 0.6, grain: false, maxN: 8 },
  { name: 'medium', scale: 0.85, grain: true, maxN: 10 },
  { name: 'high', scale: 1.25, grain: true, maxN: 12 },
];
// Judged one SECOND at a time by average frame rate, not frame by frame: displays and compositors deliver uneven frames even when everything is fine.
const SLOW_FPS = 36, SLOW_SECONDS = 4, GOOD_FPS = 44;

const TMP = [0, 0, 0];
/** Where the colour goes as a build climbs: the hue turns through the spectrum, brightness follows the pitch of the riser, vividness follows how loud the middle is. */
function climbTint(base, p, lv) {
  const r = base[0] / 255, g = base[1] / 255, b = base[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360 + p * 250) % 360;
  const s = Math.min(1, 0.6 + lv.mid * 0.5), l = Math.min(0.96, 0.46 + 0.4 * p * p + lv.high * 0.2 + (p > 0.9 ? (p - 0.9) * 3 : 0));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2, k = Math.floor(hue / 60) % 6;
  const rr = [c, x, 0, 0, x, c][k], gg = [x, c, c, x, 0, 0][k], bb = [0, 0, x, c, c, x][k];
  TMP[0] = (rr + m) * 255; TMP[1] = (gg + m) * 255; TMP[2] = (bb + m) * 255;
  return TMP;
}

export function createVisual({ audio: A }) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const V = {
    replay: false,                                            // the player sets this: the recording decides the kaleidoscope, not chance
    recoverAfter: 120,                                        // smooth seconds (a slow one costs 10) before trying one level up
    log: null,                                                // (code, ...args) -> the performance recorder
    onEvent: null,                                            // the interface listens to the sequencer's timed events here
    pressScale: 1,                                            // 0 turns presses off; the Trippy setting in the menu
    dev: { grain: true, feedback: true, kaleido: true, ripples: true, drips: true, glow: true },
    opt: { tintScene: true, fogEvery: 3, grainOp: 'soft-light', grainAlpha: 0.35 },                    // speed-ups that change nothing you can see; developer mode can switch them off to compare
    stats: { fps: 0, frameMs: 0, level: 'high', mode: 'auto', downgrades: 0, upgrades: 0, recovery: 0, errors: 0, scene: 0, sections: {}, ripples: 0, eco: false },
  };
  const st = {
    t: 0, phase: 0, spin: 0, n: 8, rot: 0, kick: 0, snare: 0, flash: 0, scene: 0, prevScene: 0, mix: 1, progress: 0, building: 0, bld: 0, surge: 0, surgeT: 0, band: 0, after: 0, rotA: 0,
    seed: 0, sw: 0, energy: 0, wx: 0, wy: 0, tint: [255, 52, 32], tintTo: [255, 52, 32],
  };
  const press = createPress(), rings = [], sparks = [], drips = [];
  let stage, sctx, fbs, fcs, cur = 0, fog, gctx, scene, cctx, grain, wedge = null, wedgeKey = '', sceneN = 0;
  let W = 0, H = 0, DPR = 1, R = 1, last = 0, bladeAt = null, frameNo = 0;
  let mode = 'auto', level = 2, slowSecs = 0, goodSecs = 0, lastUp = -1e9, noUpUntil = 0, eco = false, lastDraw = 0, acc = 0, accN = 0, statsAt = 0;
  const prof = { sim: 0, compose: 0, finish: 0 };

  const maxN = () => (eco ? Math.min(8, LEVELS[level].maxN) : LEVELS[level].maxN);
  V.setKaleido = (n) => { st.n = Math.min(n, maxN()); };
  V.getState = () => st;

  function applyLevel(i) {
    level = clamp(i, 0, LEVELS.length - 1);
    st.n = Math.min(st.n, maxN());
    V.stats.level = LEVELS[level].name;
    if (stage) resize();
  }

  /** 'auto' | 'high' | 'medium' | 'low' */
  V.setQuality = (m) => {
    mode = m; V.stats.mode = m;
    applyLevel(m === 'auto' ? 2 : LEVELS.findIndex((l) => l.name === m));
    slowSecs = goodSecs = 0;
    return m;
  };
  V.cycleQuality = () => V.setQuality({ auto: 'high', high: 'medium', medium: 'low', low: 'auto' }[mode]);
  /** The battery saver: a small picture at 30 frames a second, fewer folds. The quality manager stands down while it is on. */
  V.setEco = (on) => {
    on = !!on;
    if (on === eco) return;
    eco = on; V.stats.eco = on;
    st.n = Math.min(st.n, maxN());
    if (stage) resize();
  };

  /** The picture normally fills the window. `fit` (the Studio) says how big the area it fills is, in CSS pixels. */
  V.cssSize = () => (V.fit ? V.fit() : [innerWidth, innerHeight]);
  V.resize = () => { if (stage) resize(); };

  V.init = (canvas, opts = {}) => {
    stage = canvas;
    V.fit = opts.fit || null;
    sctx = stage.getContext('2d', { alpha: false });
    const mkc = () => document.createElement('canvas');
    fbs = [mkc(), mkc()];
    fcs = fbs.map((c) => c.getContext('2d', { alpha: false }));
    fog = mkc(); gctx = fog.getContext('2d');
    scene = mkc(); scene.width = scene.height = SC; cctx = scene.getContext('2d');
    const g = mkc(), gc = g.getContext('2d');
    g.width = g.height = 200;
    const img = gc.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
    gc.putImageData(img, 0, 0);
    grain = sctx.createPattern(g, 'repeat');
    const q = new URLSearchParams(location.search).get('quality');
    if (q && LEVELS.some((l) => l.name === q)) V.setQuality(q);
    resize();
    addEventListener('resize', resize);
    if (opts.autostart !== false) V.start();
  };
  V.start = () => {
    if (V.running) return;
    V.running = true;
    requestAnimationFrame(frame);
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, eco ? Math.min(0.55, LEVELS[level].scale) : LEVELS[level].scale);
    const [cw, ch] = V.cssSize();
    W = Math.max(2, Math.floor(cw * DPR)); H = Math.max(2, Math.floor(ch * DPR));
    for (const c of [stage, fbs[0], fbs[1], fog]) { c.width = W; c.height = H; }
    R = Math.hypot(W, H) / 2;
    for (const c of [fcs[0], fcs[1], gctx]) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    wedgeKey = '';
  }

  V.setLight = (i) => { st.tintTo = LIGHTS[i].tint; };

  /** Which picture: 0 tentacles, 1 dot grid, 2 film frames, 3 spokes, 4 ink. Crossfades over a couple of seconds. */
  V.setScene = (i) => {
    i = clamp(i | 0, 0, SCENE_COUNT - 1);
    if (i === st.scene) return;
    st.prevScene = st.scene; st.scene = i; st.mix = 0; V.stats.scene = i;
    if (V.log && !V.replay) V.log(16, i);
  };
  V.setProgress = (p) => { st.progress = clamp(p, 0, 1); };
  /** 0 none, 1 lift, 2 sink: tension builds in the picture while a build is held. */
  V.setBuild = (v) => { st.building = v | 0; };
  /** The drop: flash, a hard zoom and spin, and the fog punched open. */
  /** The climb to a drop, 0..1 (a surge sets it; a held Rise adds its own). The colours follow it, like a sound that rises in pitch and loudness is seen as brighter and more vivid. */
  V.setSurge = (p) => {
    st.surgeT = clamp(p, 0, 1);
    const band = st.surgeT < 0.01 ? -1 : st.surgeT < 0.33 ? 0 : st.surgeT < 0.66 ? 1 : 2;
    if (band !== st.band) { st.band = band; if (band >= 0 && !V.replay) V.setKaleido([8, 10, 12][band]); }
  };
  V.tintNow = () => st.tint;
  V.drop = () => { st.after = 3.5; st.building = 0; st.bld = 0; st.kick = 1; if (!reduce) { st.flash = 1; st.spin += 0.3; } punchFog(); };

  /* ---- the squeegee ---- */
  /** One squeegee stroke segment. `size` (0.15 to 1.5, default 1) scales the blade: a pen's pressure makes it fine. */
  V.wipe = (cx, cy, px, py, size) => {
    if (!W || !H) return;                                     // no size yet (a hidden tab): nothing to wipe, and a zero-size canvas cannot be drawn
    const k = typeof size === 'number' && isFinite(size) ? clamp(size, 0.15, 1.5) : 1;
    const x = cx * DPR, y = cy * DPR, ox = px * DPR, oy = py * DPR, dx = x - ox, dy = y - oy;
    if (!dx && !dy) return;
    bladeAt = { x, y, dx, dy, t: performance.now(), k };
    gctx.save();
    gctx.globalCompositeOperation = 'destination-out';
    gctx.lineCap = 'round'; gctx.lineWidth = 96 * k * DPR; gctx.strokeStyle = '#000';
    gctx.beginPath(); gctx.moveTo(ox, oy); gctx.lineTo(x, y); gctx.stroke();
    gctx.restore();
    // drag the wet picture along with the blade
    const r = 90 * k * DPR, fc = fcs[cur];
    fc.save();
    fc.beginPath(); fc.arc(x, y, r, 0, TAU); fc.clip();
    fc.drawImage(fbs[cur], x - r, y - r, 2 * r, 2 * r, x - r + dx * 1.6, y - r + dy * 1.6, 2 * r, 2 * r);
    fc.restore();
    // it is wet: now and then a drip runs down from the edge of the blade
    if (V.dev.drips && !reduce && drips.length < 24 && Math.random() < 0.2) {
      const len = Math.hypot(dx, dy) || 1, h = 44 * k * DPR, side = Math.random() < 0.5 ? 1 : -1;
      drips.push({ x: x + (-dy / len) * h * side, y: y + (dx / len) * h * side, v: 0.4 + Math.random() * 0.8, w: (2 + Math.random() * 3) * DPR });
    }
  };
  V.wipeEnd = () => { bladeAt = null; };

  function punchFog() {
    const g = gctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.34);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.save(); gctx.globalCompositeOperation = 'destination-out'; gctx.fillStyle = g; gctx.fillRect(0, 0, W, H); gctx.restore();
  }

  /* ---- a press, from the screen or from any control: it blooms here, is remembered, and warms the machine ---- */
  /** nx, ny: 0..1 across the screen. id: a 32-bit hash of whatever was pressed. force 0..2 (a pen's pressure, or 1). */
  V.press = (nx, ny, id, force = 1) => {
    if (!W || !V.pressScale) return;
    force = clamp(force, 0, 2) * V.pressScale;
    const cx = (nx - 0.5) * W, cy = (ny - 0.5) * H, a = TAU / st.n, s = R / (SC / 2);
    const { phi, r } = foldPoint(cx, cy, st.rot, a);                             // fold the point into the one wedge that is drawn, as the kaleidoscope does
    press.add(st, Math.min((SC / 2) * 0.96, r / s), phi, id >>> 0, force, eco);
    st.wx = clamp(st.wx + (cx / (W / 2)) * 10 * force * DPR, -30 * DPR, 30 * DPR);   // the tunnel leans toward the press
    st.wy = clamp(st.wy + (cy / (H / 2)) * 10 * force * DPR, -30 * DPR, 30 * DPR);
    st.kick = Math.max(st.kick, 0.3 * force);
    if (V.log && !V.replay) V.log(17, round(nx, 3), round(ny, 3), id >>> 0, round(force / (V.pressScale || 1), 2));
  };

  /* ---- events from the sequencer, released when the audio clock reaches them ---- */
  function pumpEvents() {
    const now = A.now() - A.lag();                            // events are released when they are HEARD, not when they are scheduled
    timed.drain(now, (e) => {
      switch (e.type) {
        case 'kick': st.kick = 1; if (rings.length < 10) rings.push({ r: 20, a: 1 }); punchFog(); break;
        case 'snare': st.snare = 1; if (!reduce) st.spin += 0.08; break;
        case 'ghost': if (sparks.length < 240) sparks.push({ r: 60 + Math.random() * 420, k: Math.random(), a: 0.45, s: 4 + Math.random() * 4, shape: 'c' }); break;
        case 'hat': for (let i = 0; i < 3 && sparks.length < 240; i++) sparks.push({ r: 60 + Math.random() * 420, k: Math.random(), a: 1, s: 6 + Math.random() * 10, shape: pick(['c', 'h', 's']) }); break;
        case 'cycle': if (!V.replay && Math.random() < 0.6) { V.setKaleido(pick(st.progress < 0.3 ? [6, 8] : st.progress < 0.7 ? [8, 10] : [10, 12])); if (V.log) V.log(9, st.n); } break;
        case 'scene': if (!V.replay) V.setScene(e.a); break;
        case 'style': if (!V.replay && V.styleScene) V.setScene(V.styleScene()); break;
        case 'journey': V.setProgress(e.a || 0); break;
        case 'build': V.setBuild(e.a ? 2 : 1); break;
        case 'drop': V.drop(); break;
        default:
      }
      if (V.onEvent) V.onEvent(e);
    });
  }

  /* ---- the kaleidoscope: only the wedge of the scene that is ever seen is drawn, once per fold ---- */
  function wedgePath() {
    const key = `${st.n}|${R | 0}`;
    if (key !== wedgeKey) {
      const a = TAU / st.n, p = new Path2D();
      p.moveTo(0, 0); p.arc(0, 0, R * 1.02, -0.003, a + 0.003); p.closePath();
      wedge = p; wedgeKey = key;
    }
    return wedge;
  }
  const wedgeH = () => Math.min(SC / 2, (SC / 2) * Math.sin(TAU / st.n)) + PAD * 2;

  function kaleido(ctx) {
    const n = st.n, a = TAU / n, s = R / (SC / 2), path = wedgePath(), hh = wedgeH();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    for (let k = 0; k < n; k++) {
      ctx.save();
      if (k % 2) { ctx.rotate(st.rot + (k + 1) * a); ctx.scale(1, -1); } else ctx.rotate(st.rot + k * a);
      ctx.clip(path);
      ctx.scale(s, s);
      ctx.drawImage(scene, SC / 2, SC / 2 - PAD, SC / 2, hh, 0, -PAD, SC / 2, hh);   // just the wedge's box, not the whole square
      ctx.restore();
    }
    ctx.restore();
  }

  function drawScene(bass, dt) {
    const c = cctx, a = TAU / st.n, p = clamp(st.progress + 0.25 * st.energy, 0, 1), hh = wedgeH();
    if (sceneN !== st.n) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, SC, SC); sceneN = st.n; }   // the fold count changed: forget the old wedge
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(SC / 2, SC / 2 - PAD, SC / 2, hh);
    c.save();
    c.translate(SC / 2, SC / 2);
    c.beginPath(); c.rect(0, -PAD, SC / 2, hh); c.clip();     // nothing outside the wedge's box is ever rasterised
    if (st.mix < 1) {                                         // crossfading from the last picture to this one
      c.globalAlpha = 1 - st.mix; SCENES[st.prevScene](c, a, bass, p, st);
      c.globalAlpha = st.mix; SCENES[st.scene](c, a, bass, p, st);
      c.globalAlpha = 1;
    } else SCENES[st.scene](c, a, bass, p, st);

    for (let i = rings.length - 1; i >= 0; i--) {             // a ring of dots per kick, travelling outward (in every scene)
      const g = rings[i];
      g.r += 7 + g.r * 0.02; g.a -= 0.012;
      if (g.a <= 0 || g.r > 520) { rings.splice(i, 1); continue; }
      const count = Math.max(6, Math.floor((TAU * g.r) / 26));
      c.fillStyle = `rgba(255,255,255,${g.a})`;
      c.beginPath();
      for (let j = 0; j < count; j++) { const th = (j / count) * TAU, rr = 3 + g.a * 4; c.moveTo(g.r * Math.cos(th) + rr, g.r * Math.sin(th)); c.arc(g.r * Math.cos(th), g.r * Math.sin(th), rr, 0, TAU); }
      c.fill();                                               // one fill for the whole ring, not one per dot
    }
    for (let i = sparks.length - 1; i >= 0; i--) {            // hat confetti: circles, half-circles and squares (in every scene)
      const s = sparks[i];
      s.a -= 0.03;
      if (s.a <= 0) { sparks.splice(i, 1); continue; }
      const th = s.k * a;
      c.fillStyle = `rgba(255,255,255,${s.a})`;
      c.save(); c.translate(s.r * Math.cos(th), s.r * Math.sin(th)); c.beginPath();
      if (s.shape === 'c') c.arc(0, 0, s.s / 2, 0, TAU); else if (s.shape === 'h') c.arc(0, 0, s.s / 2, 0, Math.PI); else c.rect(-s.s / 2, -s.s / 2, s.s, s.s);
      c.fill(); c.restore();
    }
    if (V.dev.ripples) press.draw(c, dt);                     // presses bloom last, on top
    if (V.opt.tintScene) {                                    // colour the scene here, once, in the small wedge box, instead of multiplying the whole screen every frame
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = rgb(st.tint);
      c.fillRect(0, -PAD, SC / 2, hh);
    }
    c.restore();
  }

  function frame(ms) {
    requestAnimationFrame(frame);                             // schedule first: an error below must never stop the loop
    if (eco && ms - lastDraw < 25) return;                    // eco: every other frame on a 60 Hz screen
    lastDraw = ms;
    const raw = (ms - last) / 1000;
    last = ms;
    const t0 = performance.now();
    try { draw(Math.min(0.05, raw || 0.016)); } catch (err) { V.stats.errors++; if (V.stats.errors === 1) console.error('Glass Groove: a frame failed and was skipped', err); }
    if (raw > 0 && raw < 0.25) { acc += raw; accN++; V.stats.frameMs = V.stats.frameMs * 0.9 + (performance.now() - t0) * 0.1; }   // ignore the gap when the tab was hidden
    if (ms - statsAt > 1000 && accN) judge(ms);
  }

  function judge(ms) {
    const fps = accN / acc;
    V.stats.fps = Math.round(fps);
    V.stats.sections = { sim: +prof.sim.toFixed(1), compose: +prof.compose.toFixed(1), finish: +prof.finish.toFixed(1) };
    V.stats.ripples = press.ripples.length;
    acc = 0; accN = 0; statsAt = ms;
    if (eco) { slowSecs = goodSecs = 0; return; }             // the quality manager judges full-speed frames only
    slowSecs = fps < SLOW_FPS ? slowSecs + 1 : 0;
    goodSecs = fps >= GOOD_FPS ? goodSecs + 1 : Math.max(0, goodSecs - 10);
    V.stats.recovery = mode === 'auto' && level < 2 ? Math.min(100, Math.round((goodSecs / V.recoverAfter) * 100)) : 0;
    if (mode === 'auto' && slowSecs >= SLOW_SECONDS && level > 0) {
      if (ms - lastUp < 180000) noUpUntil = ms + 15 * 60 * 1000;   // we had only just stepped UP: this machine can't hold it, stop trying for a while
      V.stats.downgrades++; slowSecs = goodSecs = 0;
      applyLevel(level - 1);
    } else if (mode === 'auto' && level < 2 && goodSecs >= V.recoverAfter && ms > noUpUntil) {
      V.stats.upgrades++; goodSecs = 0; lastUp = ms;
      applyLevel(level + 1);
    }
  }

  function draw(dt) {
    const p0 = performance.now();
    if (!W || !H || !fbs[0].width) return;                    // mid-resize or hidden pane: nothing to draw into
    st.t += dt;
    if (A.ready) pumpEvents();
    const lv = A.level(), idle = !A.ready, bass = idle ? 0.12 + 0.08 * Math.sin(st.t * 0.9) : lv.bass;
    st.phase += dt * (0.5 + bass * 2.2);
    st.kick *= Math.pow(0.02, dt); st.snare *= Math.pow(0.05, dt); st.flash *= Math.pow(0.002, dt);
    st.energy *= Math.pow(0.92, dt);                          // a press warms the picture for several seconds
    const wd = Math.pow(0.04, dt); st.wx *= wd; st.wy *= wd;  // and the tunnel's lean settles
    st.bld += ((st.building ? 1 : 0) - st.bld) * Math.min(1, dt * (st.building ? 0.4 : 6));
    st.mix = Math.min(1, st.mix + dt / 2.2);
    st.surge += (st.surgeT - st.surge) * Math.min(1, dt * 3);
    const climb = Math.max(st.surge, st.bld * 0.8);            // 0..1: how far up the build is
    st.rotA += dt * (reduce ? 0.01 : 0.05 + climb * 0.45);
    st.rot = st.rotA + st.spin;
    const tension = Math.max(st.bld, st.surge * 0.9);
    const aim = climb > 0.01 ? climbTint(st.tintTo, climb, lv) : st.tintTo, rate = st.after > 0 ? 1.1 : 4;   // after a drop the colour settles back slowly
    st.after = Math.max(0, st.after - dt);
    for (let i = 0; i < 3; i++) st.tint[i] += (aim[i] - st.tint[i]) * Math.min(1, dt * rate);

    // 1. the feedback tunnel: last frame, a little bigger and turned, into the other canvas
    const src = fbs[cur], d = fcs[cur ^ 1], dst = fbs[cur ^ 1];
    d.globalCompositeOperation = 'source-over'; d.globalAlpha = 1;
    if (V.dev.feedback) {
      d.save();
      d.translate(W / 2 + st.wx, H / 2 + st.wy);
      d.rotate((reduce ? 0.0005 : 0.003 + st.progress * 0.002) + st.spin * 0.02);
      const z = 1.012 + st.kick * 0.02 + tension * 0.025 + climb * 0.02 + st.progress * 0.004 + st.energy * 0.004;
      d.scale(z, z);
      d.translate(-W / 2, -H / 2);
      d.drawImage(src, 0, 0);
      d.restore();
    } else { d.fillStyle = '#000'; d.fillRect(0, 0, W, H); }
    st.spin *= 0.9;
    d.fillStyle = 'rgba(0,0,0,0.07)'; d.fillRect(0, 0, W, H);
    cur ^= 1;

    // 2. fold the scene in
    if (V.dev.kaleido) {
      drawScene(bass, dt);
      d.globalAlpha = 0.5 + bass * 0.3;
      kaleido(d);
      d.globalAlpha = 1;
    }
    const p1 = performance.now();
    prof.sim = prof.sim * 0.9 + (p1 - p0) * 0.1;

    // 3. compose: tint, glow, fog, grain
    sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
    sctx.drawImage(dst, 0, 0);
    if (!V.opt.tintScene) {                                   // the original way: tint the whole picture, a full-screen pass
      sctx.globalCompositeOperation = 'multiply';
      sctx.fillStyle = rgb(st.tint);
      sctx.fillRect(0, 0, W, H);
    }
    const glow = 0.12 + st.kick * 0.22 + tension * 0.3 + climb * 0.25 + st.progress * 0.06, gr = Math.min(W, H) * 0.7;
    if (V.dev.glow) {
      const gg = sctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, gr);
      gg.addColorStop(0, rgb(st.tint, glow)); gg.addColorStop(1, rgb(st.tint, 0));
      sctx.globalCompositeOperation = 'screen';
      sctx.fillStyle = gg;
      sctx.fillRect(W / 2 - gr, H / 2 - gr, gr * 2, gr * 2);   // the glow ends at its radius: no need to cover the whole screen
    }

    gctx.globalCompositeOperation = 'source-over';
    const every = V.opt.fogEvery || 1;                        // the fog creeps back a little at a time: a third as many full-screen passes, three times as much each
    if (frameNo++ % every === 0) { gctx.fillStyle = `rgba(0,0,0,${0.02 * every})`; gctx.fillRect(0, 0, W, H); }
    if (drips.length) stepDrips(dt);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = Math.max(0.1, (idle ? 0.8 : 0.86) - tension * 0.5 - st.kick * 0.12);
    sctx.drawImage(fog, 0, 0);
    sctx.globalAlpha = 1;
    if (st.bld > 0.02 && st.building !== 1) { sctx.fillStyle = `rgba(0,0,0,${(0.45 * st.bld).toFixed(3)})`; sctx.fillRect(0, 0, W, H); }
    const p2 = performance.now();
    prof.compose = prof.compose * 0.9 + (p2 - p1) * 0.1;

    if (V.dev.grain && LEVELS[level].grain) {
      sctx.save();
      sctx.globalCompositeOperation = V.opt.grainOp; sctx.globalAlpha = V.opt.grainAlpha;
      sctx.translate(-Math.random() * 200, -Math.random() * 200);
      sctx.fillStyle = grain;
      sctx.fillRect(0, 0, W + 200, H + 200);
      sctx.restore();
    }
    if (st.flash > 0.01) { sctx.globalCompositeOperation = 'screen'; sctx.fillStyle = `rgba(255,244,230,${st.flash * 0.85})`; sctx.fillRect(0, 0, W, H); }

    // the blade itself: a thin line of light across the direction of travel (it squishes a little with the speed)
    if (bladeAt && performance.now() - bladeAt.t < 120) {
      const len = Math.hypot(bladeAt.dx, bladeAt.dy) || 1, nx = -bladeAt.dy / len, ny = bladeAt.dx / len, h = 48 * DPR * bladeAt.k * (1 + Math.min(0.4, len / 160));
      sctx.globalCompositeOperation = 'source-over';
      sctx.strokeStyle = 'rgba(255,236,226,0.75)'; sctx.lineWidth = 2 * DPR;
      sctx.beginPath(); sctx.moveTo(bladeAt.x - nx * h, bladeAt.y - ny * h); sctx.lineTo(bladeAt.x + nx * h, bladeAt.y + ny * h); sctx.stroke();
    }
    prof.finish = prof.finish * 0.9 + (performance.now() - p2) * 0.1;
  }

  /** Drips run down the fog, opening a thin wet line as they go. */
  function stepDrips(dt) {
    gctx.save();
    gctx.globalCompositeOperation = 'destination-out';
    gctx.lineCap = 'round'; gctx.strokeStyle = '#000';
    for (let i = drips.length - 1; i >= 0; i--) {
      const q = drips[i], y1 = q.y + q.v * 90 * DPR * dt;
      gctx.lineWidth = q.w;
      gctx.beginPath(); gctx.moveTo(q.x, q.y); gctx.lineTo(q.x, y1); gctx.stroke();
      q.y = y1; q.v *= 1 + dt * 0.8; q.w *= 1 - dt * 0.35;
      if (q.y > H || q.w < 0.6 * DPR) drips.splice(i, 1);
    }
    gctx.restore();
  }

  /** Developer benchmark: run N identical frames and report the average cost, forcing the canvas to finish with a 1-pixel read-back
      (otherwise the browser defers the real drawing and the timing would only measure how fast commands were queued). */
  V.bench = (n, sceneIndex, folds) => {
    if (mode !== 'high') V.setQuality('high');                // (changing quality resizes every canvas: do it once, not on every run)
    Object.assign(st, { scene: sceneIndex | 0, prevScene: sceneIndex | 0, mix: 1, n: folds || 8, progress: 0.5 });
    prof.sim = prof.compose = prof.finish = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (i % 8 === 0) { st.kick = 1; rings.push({ r: 20, a: 1 }); for (let k = 0; k < 3; k++) sparks.push({ r: 80 + k * 100, k: Math.random(), a: 1, s: 8, shape: 'c' }); }
      draw(1 / 60);
      sctx.getImageData(0, 0, 1, 1);
    }
    return { ms: +((performance.now() - t0) / n).toFixed(2), sim: +prof.sim.toFixed(2), compose: +prof.compose.toFixed(2), finish: +prof.finish.toFixed(2), w: W, h: H };
  };

  return V;
}
