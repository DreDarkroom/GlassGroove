/* Wipelight Takes: the timeline. A canvas that draws a performance as lanes (bass notes, kick, snare, hats, builds and drops, picture changes, presses,
   squeegee strokes, knob moves), and lets you select, move, delete, quantise and transpose what is in them. It never edits anything itself: it asks
   the owner (`on.change(newEvents)`), which keeps the history, so undo is just "go back to the previous list". */
import { C } from '../perf/format.js';
import { hashStr, clamp, fmtTime } from '../util.js';
import { noteBars, tempoAt, lengthOf, sorted } from './edit.js';

const GUTTER = 88, RULER = 24, MIN_PPS = 4, MAX_PPS = 1600;
const LANES = [
  { key: 'bass', label: 'Bass', h: 74, codes: [C.noteOn, C.noteOff] },
  { key: 'kick', label: 'Kick', h: 22, codes: [C.kick] },
  { key: 'snare', label: 'Snare', h: 22, codes: [C.snare] },
  { key: 'hat', label: 'Hats', h: 22, codes: [C.hat] },
  { key: 'build', label: 'Builds', h: 26, codes: [C.riser, C.impact, C.gap, C.sweep] },
  { key: 'show', label: 'Picture', h: 24, codes: [C.scene, C.light, C.kit, C.kaleido] },
  { key: 'press', label: 'Presses', h: 24, codes: [C.press] },
  { key: 'wipe', label: 'Squeegee', h: 30, codes: [C.wipe, C.squeak] },
  { key: 'param', label: 'Knobs', h: 30, codes: [C.param] },
];
const LANE_OF = new Map(LANES.flatMap((l) => l.codes.map((c) => [c, l])));
const CODE_NAME = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]));

/** What an event is, in words (the readout under the timeline). */
export function describe(e) {
  const a = e.a, t = `${e.t.toFixed(2)} s`;
  switch (e.code) {
    case C.noteOn: return `note ${a[0]} · velocity ${a[1]}${a[2] ? ' · accent' : ''} · ${t}`;
    case C.noteOff: return `note off · ${t}`;
    case C.kick: case C.snare: return `${CODE_NAME[e.code]} · velocity ${a[0]} · ${t}`;
    case C.hat: return `hat${a[1] ? ' (open)' : ''} · velocity ${a[0]} · ${t}`;
    case C.param: return `${a[0]} = ${a[1]} · ${t}`;
    case C.light: return `light ${a[0] + 1} · ${t}`;
    case C.scene: return `picture ${a[0] + 1} · ${t}`;
    case C.kit: return `kit ${a[0] + 1} · ${t}`;
    case C.kaleido: return `${a[0]} folds · ${t}`;
    case C.riser: return `${a[0] ? 'build starts' : 'build ends'}${a[1] ? ' (under water)' : ''} · ${t}`;
    case C.impact: return `drop hit · ${t}`;
    case C.gap: return `breath of silence · ${t}`;
    case C.sweep: return `${a[0] ? 'low' : 'high'}-pass to ${a[1]} Hz · ${t}`;
    case C.press: return `press at ${Math.round(a[0] * 100)}%, ${Math.round(a[1] * 100)}% · ${t}`;
    case C.wipe: return `squeegee stroke · ${t}`;
    case C.squeak: return `squeak · ${t}`;
    default: return `${CODE_NAME[e.code] || e.code} · ${t}`;
  }
}

export function createTimeline(canvas, on = {}) {
  const ctx = canvas.getContext('2d');
  const T = { events: [], snapshot: {}, duration: 0, sel: new Set(), playhead: 0, snap: true, view: { t0: 0, pps: 60 } };
  let bars = [], items = [], dpr = 1, W = 0, H = 0, drag = null, hover = null, dirty = true, raf = 0;
  const tint = () => (getComputedStyle(document.documentElement).getPropertyValue('--tint-rgb') || '255,52,32').trim();
  const laneTop = (i) => RULER + LANES.slice(0, i).reduce((s, l) => s + l.h, 0);
  const totalH = () => RULER + LANES.reduce((s, l) => s + l.h, 0);
  const xOf = (t) => GUTTER + (t - T.view.t0) * T.view.pps;
  const tOf = (x) => T.view.t0 + (x - GUTTER) / T.view.pps;
  const laneAt = (y) => { let top = RULER; for (let i = 0; i < LANES.length; i++) { if (y >= top && y < top + LANES[i].h) return i; top += LANES[i].h; } return -1; };
  const gridStep = () => 60 / tempoAt(T.events, T.snapshot) / 4;                // a sixteenth, in seconds

  const redraw = () => { dirty = true; if (!raf) raf = requestAnimationFrame(draw); };

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = totalH();
    canvas.style.height = `${H}px`;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    redraw();
  }

  T.set = (events, snapshot, duration) => {
    T.events = events; T.snapshot = snapshot || T.snapshot; T.duration = duration ?? lengthOf(events);
    bars = noteBars(events);
    T.sel = new Set([...T.sel].filter((id) => events.some((e) => e.id === id)));
    redraw();
  };
  T.setPlayhead = (t) => {
    T.playhead = t;
    if (T.following) { const x = xOf(t); if (x > W - 40 || x < GUTTER) T.view.t0 = Math.max(0, t - 2 / Math.max(1, T.view.pps / 60)); }
    redraw();
  };
  T.following = true;
  T.fit = () => { T.view.pps = clamp((W - GUTTER - 16) / Math.max(1, T.duration), MIN_PPS, MAX_PPS); T.view.t0 = 0; redraw(); };
  T.zoom = (factor, anchorX = W / 2) => {
    const t = tOf(anchorX);
    T.view.pps = clamp(T.view.pps * factor, MIN_PPS, MAX_PPS);
    T.view.t0 = Math.max(0, t - (anchorX - GUTTER) / T.view.pps);
    redraw();
  };
  T.selectAll = () => { T.sel = new Set(T.events.map((e) => e.id)); redraw(); if (on.select) on.select(T.sel); };
  T.clearSelection = () => { T.sel = new Set(); redraw(); if (on.select) on.select(T.sel); };
  T.selectedRange = () => { const ts = T.events.filter((e) => T.sel.has(e.id)).map((e) => e.t); return ts.length ? [Math.min(...ts), Math.max(...ts)] : null; };

  /* ---------------- drawing ---------------- */
  function draw() {
    raf = 0;
    if (!dirty) return;
    dirty = false;
    if (canvas.clientWidth !== W) size();
    const c = ctx, rgb = tint();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H);
    const t0 = T.view.t0, t1 = tOf(W), line = `rgba(${rgb},0.2)`, dim = `rgba(${rgb},0.55)`, strong = `rgb(${rgb})`;
    c.font = '10px ui-monospace, Consolas, monospace'; c.textBaseline = 'middle';
    items = [];

    // lanes and their labels
    LANES.forEach((l, i) => {
      const y = laneTop(i);
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)'; c.fillRect(GUTTER, y, W - GUTTER, l.h);
      c.fillStyle = dim; c.fillText(l.label.toUpperCase(), 8, y + l.h / 2);
      c.strokeStyle = line; c.beginPath(); c.moveTo(0, y + l.h + 0.5); c.lineTo(W, y + l.h + 0.5); c.stroke();
    });

    // beat grid and ruler
    const step = gridStep(), beat = step * 4, bar = beat * 4;
    c.strokeStyle = line; c.fillStyle = dim;
    const every = T.view.pps * beat > 14 ? beat : bar, tickStep = T.view.pps * every < 6 ? bar * 4 : every;
    for (let t = Math.floor(t0 / tickStep) * tickStep; t <= t1; t += tickStep) {
      const x = Math.round(xOf(t)) + 0.5;
      if (x < GUTTER) continue;
      const isBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6;
      c.globalAlpha = isBar ? 0.55 : 0.22;
      c.beginPath(); c.moveTo(x, RULER - (isBar ? 10 : 5)); c.lineTo(x, H); c.stroke();
      c.globalAlpha = 1;
      if (isBar && T.view.pps * bar > 38) c.fillText(fmtTime(t), x + 3, 8);
    }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, GUTTER, H);
    c.fillStyle = dim; c.fillText('TIME', 8, 12);
    LANES.forEach((l, i) => { c.fillText(l.label.toUpperCase(), 8, laneTop(i) + l.h / 2); });

    c.save();
    c.beginPath(); c.rect(GUTTER, 0, W - GUTTER, H); c.clip();

    // bass notes as bars, placed by pitch
    const bl = laneTop(0), bh = LANES[0].h - 8, lo = bars.length ? Math.min(...bars.map((b) => b.midi)) : 0, hi = bars.length ? Math.max(...bars.map((b) => b.midi)) : 1, span = Math.max(7, hi - lo);
    for (const b of bars) {
      if (b.end < t0 || b.t > t1) continue;
      const x = xOf(b.t), w = Math.max(3, (b.end - b.t) * T.view.pps), y = bl + 4 + (1 - (b.midi - lo) / span) * (bh - 6);
      c.fillStyle = T.sel.has(b.id) ? '#fff' : `rgba(${rgb},${0.45 + 0.5 * b.vel})`;
      c.fillRect(x, y, w, 5);
      items.push({ id: b.id, x, x2: x + w, y: y - 3, y2: y + 8, lane: 0 });
    }

    // everything else: one pass over the visible events
    const si = firstAtOrAfter(T.events, t0 - 1), dens = new Map();
    for (let i = si; i < T.events.length; i++) {
      const e = T.events[i];
      if (e.t > t1 + 1) break;
      const lane = LANE_OF.get(e.code);
      if (!lane || lane.key === 'bass') continue;
      const li = LANES.indexOf(lane), y = laneTop(li), x = xOf(e.t), sel = T.sel.has(e.id);
      if (lane.key === 'wipe') { const col = Math.round(x); dens.set(col, (dens.get(col) || 0) + 1); items.push({ id: e.id, x: x - 1, x2: x + 1, y, y2: y + lane.h, lane: li, dense: true }); continue; }
      const mid = y + lane.h / 2;
      c.fillStyle = sel ? '#fff' : strong;
      if (lane.key === 'kick' || lane.key === 'snare' || lane.key === 'hat') {
        const v = e.a[0], h = (lane.h - 8) * (0.35 + 0.65 * v), w = lane.key === 'hat' ? 2 : 3;
        c.globalAlpha = sel ? 1 : 0.9; c.fillRect(x - w / 2, y + lane.h - 4 - h, w, h); c.globalAlpha = 1;
        items.push({ id: e.id, x: x - 4, x2: x + 4, y, y2: y + lane.h, lane: li });
      } else if (lane.key === 'build') {
        if (e.code === C.impact) { c.beginPath(); c.moveTo(x, mid - 8); c.lineTo(x + 6, mid); c.lineTo(x, mid + 8); c.lineTo(x - 6, mid); c.closePath(); c.fill(); }
        else if (e.code === C.riser) { c.fillRect(x - 1, y + 3, 3, lane.h - 6); if (e.a[0]) { c.fillStyle = sel ? '#fff' : `rgba(${rgb},0.5)`; c.fillRect(x, mid - 3, 12, 6); } }
        else if (e.code === C.gap) { c.fillRect(x - 1, mid - 2, 3, 4); }
        else { c.fillRect(x - 2, mid - 2, 4, 4); }
        items.push({ id: e.id, x: x - 6, x2: x + 6, y, y2: y + lane.h, lane: li });
      } else if (lane.key === 'show') {
        const label = e.code === C.scene ? `S${e.a[0] + 1}` : e.code === C.light ? `L${e.a[0] + 1}` : e.code === C.kit ? `K${e.a[0] + 1}` : `${e.a[0]}`;
        c.fillStyle = sel ? '#fff' : dim; c.fillText(label, x + 2, mid); c.fillStyle = sel ? '#fff' : strong; c.fillRect(x, y + 3, 1, lane.h - 6);
        items.push({ id: e.id, x: x - 2, x2: x + 18, y, y2: y + lane.h, lane: li });
      } else if (lane.key === 'press') {
        c.beginPath(); c.arc(x, y + 4 + e.a[1] * (lane.h - 8), 3, 0, Math.PI * 2); c.fill();
        items.push({ id: e.id, x: x - 4, x2: x + 4, y, y2: y + lane.h, lane: li });
      } else if (lane.key === 'param') {
        c.fillStyle = sel ? '#fff' : `hsl(${hashStr(e.a[0]) % 360},70%,60%)`;
        const v = typeof e.a[1] === 'number' ? e.a[1] : 0.5;
        c.fillRect(x, y + lane.h - 4 - Math.min(1, Math.max(0, (v - (e.a[0] === 'tempo' ? 60 : 0)) / (e.a[0] === 'tempo' ? 140 : 1))) * (lane.h - 8), 2, 3);
        items.push({ id: e.id, x: x - 3, x2: x + 3, y, y2: y + lane.h, lane: li });
      }
    }
    const wl = LANES.findIndex((l) => l.key === 'wipe'), wy = laneTop(wl);
    for (const [col, n] of dens) { c.fillStyle = `rgba(${rgb},${Math.min(0.9, 0.12 + n * 0.1)})`; c.fillRect(col, wy + 4, 1, LANES[wl].h - 8); }
    // selected squeegee / dense events: outline the column
    for (const it of items) if (it.dense && T.sel.has(it.id)) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(it.x, wy + LANES[wl].h - 6, 2, 3); }

    // the end of the take, the rubber band, the playhead
    const ex = xOf(T.duration);
    c.fillStyle = 'rgba(0,0,0,0.5)'; if (ex < W) c.fillRect(ex, RULER, W - ex, H - RULER);
    if (drag && drag.mode === 'band') { c.strokeStyle = '#fff'; c.fillStyle = 'rgba(255,255,255,0.1)'; const r = bandRect(); c.fillRect(r.x, r.y, r.w, r.h); c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); }
    const px = xOf(T.playhead);
    c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(px + 0.5, 0); c.lineTo(px + 0.5, H); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(px - 5, 0); c.lineTo(px + 6, 0); c.lineTo(px + 0.5, 9); c.closePath(); c.fill();
    c.restore();
  }

  function firstAtOrAfter(list, t) { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].t < t) lo = m + 1; else hi = m; } return lo; }

  /* ---------------- interaction ---------------- */
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (x, y) => { for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (!it.dense && x >= it.x - 2 && x <= it.x2 + 2 && y >= it.y && y <= it.y2) return it; } return null; };
  const bandRect = () => ({ x: Math.min(drag.x0, drag.x), y: Math.min(drag.y0, drag.y), w: Math.abs(drag.x - drag.x0), h: Math.abs(drag.y - drag.y0) });
  const snapT = (t, alt) => (T.snap && !alt ? Math.round(t / gridStep()) * gridStep() : t);

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    const { x, y } = pos(e);
    canvas.setPointerCapture(e.pointerId);
    if (y < RULER || x < GUTTER) { drag = { mode: 'seek' }; if (on.seek) on.seek(Math.max(0, tOf(Math.max(x, GUTTER)))); return; }
    const it = hit(x, y);
    if (it) {
      if (!T.sel.has(it.id)) { T.sel = e.shiftKey ? new Set([...T.sel, it.id]) : new Set([it.id]); if (on.select) on.select(T.sel); }
      else if (e.shiftKey) { T.sel.delete(it.id); if (on.select) on.select(T.sel); }
      drag = { mode: 'move', x0: x, t0: tOf(x), moved: 0, base: T.events };
      redraw();
    } else drag = { mode: 'band', x0: x, y0: y, x, y, add: e.shiftKey, keep: new Set(T.sel) };
  });
  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = pos(e);
    if (!drag) {
      const it = hit(x, y), ev = it && T.events.find((q) => q.id === it.id);
      if (ev !== hover) { hover = ev || null; if (on.hover) on.hover(hover); }
      return;
    }
    if (drag.mode === 'seek') { if (on.seek) on.seek(Math.max(0, tOf(Math.max(x, GUTTER)))); return; }
    if (drag.mode === 'band') {
      drag.x = x; drag.y = y;
      const r = bandRect(), ta = tOf(r.x), tb = tOf(r.x + r.w), sel = new Set(drag.add ? drag.keep : []);
      const lanesHit = new Set(); for (let i = 0; i < LANES.length; i++) { const top = laneTop(i); if (top < r.y + r.h && top + LANES[i].h > r.y) lanesHit.add(i); }
      for (const ev of T.events) { if (ev.t < ta || ev.t > tb) continue; const l = LANE_OF.get(ev.code); if (l && lanesHit.has(LANES.indexOf(l))) sel.add(ev.id); }
      T.sel = sel; redraw();
      return;
    }
    if (drag.mode === 'move') {
      drag.moved = x - drag.x0;
      if (Math.abs(drag.moved) < 3 && !drag.live) return;
      drag.live = true;
      drag.dt = snapT(tOf(x), e.altKey) - snapT(drag.t0, e.altKey);
      if (on.preview) on.preview(drag.dt);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === 'band') { if (on.select) on.select(T.sel); const r = (d.x - d.x0) ** 2 + (d.y - d.y0) ** 2; if (r < 16 && !d.add) { T.sel = new Set(); if (on.select) on.select(T.sel); } redraw(); }
    else if (d.mode === 'move' && d.live && on.move) on.move(d.dt || 0);
    redraw();
    void e;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { x } = pos(e);
    if (e.ctrlKey || e.metaKey) T.zoom(Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 20 : 1)), x);
    else { T.view.t0 = Math.max(0, T.view.t0 + (e.deltaX || e.deltaY) / T.view.pps); redraw(); }
  }, { passive: false });
  addEventListener('resize', () => { dirty = true; size(); });
  new ResizeObserver(() => size()).observe(canvas);
  canvas.tabIndex = 0;
  T.redraw = redraw;
  T.lanes = LANES;
  size();
  return T;
}

export { sorted };
