/* Glass Groove: the scenes. Each is drawn once per frame into a square canvas, centre at (512, 512), but only the wedge near angle 0..a is ever seen
   (the kaleidoscope folds it), so everything lives in that slice. A scene reads the shared state `st` (phase, seed, ...) and never keeps its own.
   0 tentacles · 1 dot grid · 2 film frames · 3 spokes · 4 ink (new: soft clouds that bloom where you press). */
export const TAU = Math.PI * 2;

export const hash = (i, j, k) => {
  let h = (Math.imul(i + 7, 73856093) ^ Math.imul(j + 13, 19349663) ^ Math.imul(k + 3, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h % 10000) / 10000;
};

// 0. bead-chain tentacles with a sucker in every bead; more of them as the journey progresses
function tentacles(c, a, bass, p, st) {
  const count = 4 + Math.round(p * 4);
  for (let k = 0; k < count; k++) {
    const len = 30;
    for (let i = 0; i < len; i++) {
      const th = a * (0.5 + 0.38 * Math.sin(st.phase * 0.9 + i * 0.28 + k * 1.7 + st.sw));
      const rad = 40 + i * 15 + 8 * Math.sin(st.phase + i * 0.5 + k);
      const x = rad * Math.cos(th), y = rad * Math.sin(th), br = 3 + (1 - i / len) * (16 + bass * 12);
      c.fillStyle = `rgba(235,235,235,${0.75 - i * 0.012})`;
      c.beginPath(); c.arc(x, y, br, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.75)';
      c.beginPath(); c.arc(x + br * 0.15, y + br * 0.15, br * 0.36, 0, TAU); c.fill();
    }
  }
}

// 1. a polar grid of circles, half-circles and squares that flip and swell in waves (pixel confetti)
function dots(c, a, bass, p, st) {
  const flip = Math.floor(st.phase * 1.6) + st.seed;
  for (let i = 0; i < 15; i++) {
    const r = 46 + i * 32, m = 3 + Math.floor(i * 0.55) + Math.round(p * 3);
    for (let j = 0; j < m; j++) {
      const h = hash(i, j, flip), shape = Math.floor(h * 4);
      if (shape === 3 && p < 0.5) continue;
      const th = (a * (j + 0.5)) / m, wave = 0.5 + 0.5 * Math.sin(st.phase * 1.1 - i * 0.45 + bass * 5), sz = 3.5 + 9 * wave * (0.4 + 0.6 * h);
      c.fillStyle = `rgba(240,240,240,${0.25 + 0.6 * wave})`;
      const x = r * Math.cos(th), y = r * Math.sin(th);
      c.beginPath();
      if (shape === 0) c.arc(x, y, sz, 0, TAU); else if (shape === 1) c.arc(x, y, sz, th, th + Math.PI); else c.rect(x - sz, y - sz, sz * 2, sz * 2);
      c.fill();
    }
  }
}

// 2. strips of film frames marching outward, each exposed a different amount, with sprocket holes (a contact sheet)
function film(c, a, bass, p, st) {
  const lanes = 2 + Math.round(p * 2), tick = Math.floor(st.phase * 0.6) + st.seed;
  for (let k = 0; k < lanes; k++) {
    const th = (a * (k + 0.5)) / lanes;
    for (let n = 0; n < 10; n++) {
      const r = ((n * 62 + st.phase * 38) % 560) + 30, w = 10 + r * 0.11, l = 14 + r * 0.16, e = 0.25 + 0.7 * hash(n, k, tick);
      c.save();
      c.translate(r * Math.cos(th), r * Math.sin(th));
      c.rotate(th);
      c.fillStyle = `rgba(235,235,235,${(e * 0.5 * (1 - r / 720) + bass * 0.12).toFixed(3)})`;
      c.fillRect(-l / 2, -w / 2, l, w);
      c.strokeStyle = 'rgba(240,240,240,0.7)'; c.lineWidth = 1.4;
      c.strokeRect(-l / 2, -w / 2, l, w);
      c.fillStyle = 'rgba(240,240,240,0.65)';
      for (let q = 0; q < 4; q++) { const sx = -l / 2 + 2 + q * (l / 4); c.fillRect(sx, -w / 2 - 4.5, 3, 3); c.fillRect(sx, w / 2 + 1.5, 3, 3); }
      c.restore();
    }
  }
}

// 3. fans of light: radiating lines, expanding arcs and rotating polygons (laser-like); more lines as it progresses
function spokes(c, a, bass, p, st) {
  const n = 6 + Math.round(p * 8);
  c.lineWidth = 1.6;
  for (let s = 0; s < n; s++) {
    const th = a * (s / (n - 1)) + 0.03 * Math.sin(st.phase + s + st.sw), len = 120 + 360 * (0.5 + 0.5 * Math.sin(st.phase * 1.3 + s * 0.9)) * (0.5 + bass), r0 = 26 + (s % 2 ? 20 : 0);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.moveTo(r0 * Math.cos(th), r0 * Math.sin(th)); c.lineTo((r0 + len) * Math.cos(th), (r0 + len) * Math.sin(th)); c.stroke();
  }
  for (let q = 0; q < 6; q++) {
    const r = ((q * 90 + st.phase * 70) % 540) + 30;
    c.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - r / 600)).toFixed(3)})`;
    c.beginPath(); c.arc(0, 0, r, 0, a); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  for (let m = 0; m < 3; m++) {
    const sides = 3 + m, rot = st.phase * (0.25 + m * 0.1), rad = 120 + m * 110 + 20 * Math.sin(st.phase + m);
    c.beginPath();
    for (let v = 0; v <= sides; v++) { const ang = rot + (v / sides) * TAU; if (v) c.lineTo(rad * Math.cos(ang), rad * Math.sin(ang)); else c.moveTo(rad * Math.cos(ang), rad * Math.sin(ang)); }
    c.stroke();
  }
}

// 4. ink: slow soft clouds that drift outward and breathe with the bass. Presses leave clouds of their own (see press.js).
function ink(c, a, bass, p, st) {
  const clouds = 5 + Math.round(p * 4);
  for (let k = 0; k < clouds; k++) {
    const drift = (st.phase * 0.06 + k / clouds + st.sw * 0.01) % 1, r = 60 + drift * 440, th = a * (0.5 + 0.42 * Math.sin(st.phase * 0.4 + k * 2.1 + st.sw));
    const size = 26 + 40 * Math.sin(drift * Math.PI) + bass * 40, x = r * Math.cos(th), y = r * Math.sin(th);
    const g = c.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, `rgba(240,240,240,${(0.5 * Math.sin(drift * Math.PI) + 0.08).toFixed(3)})`);
    g.addColorStop(1, 'rgba(240,240,240,0)');
    c.fillStyle = g;
    c.fillRect(x - size, y - size, size * 2, size * 2);
  }
}

export const SCENES = [tentacles, dots, film, spokes, ink];
export const SCENE_COUNT = SCENES.length;
