/* Glass Groove: presses that feed the picture.
   Every press on the screen or on any control becomes a small event: where it was, which control it was, how hard. It does three things at once.
   1. It blooms in the picture right away: a ring and a glyph at the spot, folded into the kaleidoscope like everything else.
   2. It is remembered: the last presses stir the "seed" the scenes use to vary themselves, so what you press changes what the picture generates next.
   3. It nudges the whole machine: energy (denser, busier scenes for a while) and a warp (the tunnel leans toward where you pressed).
   The same event is written into recordings (code 17), so a replay and the Studio rebuild exactly the same picture. */
import { TAU } from './scenes.js';

/** Where a point (dx, dy from the centre, in screen pixels) lands inside the kaleidoscope's one visible wedge of angle `a`, when the picture is turned by `rot`.
    The wedges alternate mirrored, so the angle is folded back and forth. Returns the angle within the wedge (0..a) and the distance from the centre. */
export function foldPoint(dx, dy, rot, a) {
  let phi = (((Math.atan2(dy, dx) - rot) % (2 * a)) + 2 * a) % (2 * a);
  if (phi > a) phi = 2 * a - phi;
  return { phi, r: Math.hypot(dx, dy) };
}

const MAX_RIPPLES = 14;
const GLYPHS = 6;

export function createPress() {
  const ripples = [];
  const P = {
    ripples,
    /** st = the shared picture state; (r, phi) = where it landed in scene space; id = a 32-bit hash of the control; force 0..2. */
    add(st, r, phi, id, force, eco) {
      if (ripples.length >= (eco ? 6 : MAX_RIPPLES)) ripples.shift();
      ripples.push({ x: r * Math.cos(phi), y: r * Math.sin(phi), t: 0, size: 26 + 34 * force, glyph: id % GLYPHS, spin: ((id >>> 8) % 628) / 100 });
      st.seed = (Math.imul(st.seed ^ id, 2654435761) >>> 0) % 1000003;          // the memory: each press stirs the generator
      st.sw = (st.seed % 628) / 100;
      st.energy = Math.min(1, st.energy + 0.14 * force);
    },
    /** Draw every live ripple (scene space) and age it. `a` = the wedge angle. */
    draw(c, dt) {
      for (let i = ripples.length - 1; i >= 0; i--) {
        const q = ripples[i];
        q.t += dt / 1.6;
        if (q.t >= 1) { ripples.splice(i, 1); continue; }
        const k = 1 - q.t, ring = q.size * (0.4 + 2.4 * q.t);
        c.strokeStyle = `rgba(255,255,255,${(0.7 * k).toFixed(3)})`;
        c.lineWidth = 1 + 2.5 * k;
        c.beginPath(); c.arc(q.x, q.y, ring, 0, TAU); c.stroke();
        c.fillStyle = `rgba(255,255,255,${(0.85 * k).toFixed(3)})`;
        const s = q.size * 0.5 * (0.4 + k * 0.6);
        c.save();
        c.translate(q.x, q.y);
        c.rotate(q.spin + q.t * 2);
        c.beginPath();
        glyph(c, q.glyph, s);
        c.fill();
        c.restore();
      }
    },
  };
  return P;
}

/** Six glyphs: circle, half circle, square, triangle, star, ring-with-hole. (Plain geometry: nothing borrowed.) */
function glyph(c, g, s) {
  if (g === 0) c.arc(0, 0, s, 0, TAU);
  else if (g === 1) c.arc(0, 0, s, 0, Math.PI);
  else if (g === 2) c.rect(-s, -s, s * 2, s * 2);
  else if (g === 3) { c.moveTo(0, -s); c.lineTo(s * 0.87, s * 0.5); c.lineTo(-s * 0.87, s * 0.5); c.closePath(); }
  else if (g === 4) { for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s, a = (i / 10) * TAU - Math.PI / 2; if (i) c.lineTo(r * Math.cos(a), r * Math.sin(a)); else c.moveTo(r * Math.cos(a), r * Math.sin(a)); } c.closePath(); }
  else { c.arc(0, 0, s, 0, TAU); c.moveTo(s * 0.45, 0); c.arc(0, 0, s * 0.45, 0, TAU, true); }
}
