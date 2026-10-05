/* Wipelight: the Play tab. Eight big keys that play the bass in the scale of the current mood (slide a finger across them), an octave shift, and Autopilot,
   which builds and drops by itself so you can just watch, or record. */
import { $, h } from '../util.js';
import { hint } from './dom.js';

export function buildPlay(app) {
  const { A, S } = app, pane = $('#pane-play');
  let octave = 0, held = null, pilot = false, bars = 0;
  const down = new Map();                                            // pointerId -> key index

  const keys = h('div', { class: 'keys', role: 'group', 'aria-label': 'Bass keys' });
  const pads = [];
  for (let i = 0; i < 8; i++) {
    const k = h('button', { type: 'button', class: 'key', 'aria-label': `Bass note ${i + 1}`, 'data-i': i }, i === 0 ? 'root' : i + 1);
    pads.push(k);
    keys.append(k);
  }
  const press = (i) => {
    if (!A.ready) return hint('Wake the light first.');
    release();
    held = i;
    pads[i].classList.add('on');
    A.noteOn(A.now() + 0.005, S.midi(i) + 12 * octave, 0.8, false);
  };
  function release() { if (held == null) return; pads[held].classList.remove('on'); held = null; A.noteOff(A.now() + 0.005); }
  keys.addEventListener('pointerdown', (e) => { const k = e.target.closest('.key'); if (!k) return; e.preventDefault(); try { keys.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended: carry on */ } down.set(e.pointerId, +k.dataset.i); press(+k.dataset.i); });
  keys.addEventListener('pointermove', (e) => {
    if (!down.has(e.pointerId)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), k = el && el.closest && el.closest('.key');
    if (k && +k.dataset.i !== down.get(e.pointerId)) { down.set(e.pointerId, +k.dataset.i); press(+k.dataset.i); }
  });
  const up = (e) => { if (down.delete(e.pointerId)) release(); };
  keys.addEventListener('pointerup', up);
  keys.addEventListener('pointercancel', up);

  const oct = h('span', { class: 'fine', text: 'Octave: middle' });
  const label = () => { oct.textContent = octave === 0 ? 'Octave: middle' : octave > 0 ? `Octave: up ${octave}` : `Octave: down ${-octave}`; };
  const lower = h('button', { type: 'button', class: 'btn', onclick: () => { octave = Math.max(-1, octave - 1); label(); } }, 'Lower');
  const higher = h('button', { type: 'button', class: 'btn', onclick: () => { octave = Math.min(2, octave + 1); label(); } }, 'Higher');

  /* ---- autopilot: every 24 bars, a 4-bar rise, then the drop ---- */
  const auto = h('input', { type: 'checkbox', id: 'auto' });
  auto.addEventListener('change', () => {
    pilot = auto.checked; bars = 0;
    if (!pilot) { S.buildRelease(); app.dropBuild(); }
    hint(pilot ? 'Autopilot on: it will build and drop by itself.' : 'Autopilot off.');
  });
  app.autopilotBar = () => {
    if (!pilot || !S.playing) return;
    bars++;
    const at = bars % 24;
    if (at === 16 && !S.build) { S.buildStart(Math.random() < 0.25 ? 1 : 0); }
    else if (at === 20 && S.build) S.buildRelease();
  };

  pane.append(
    h('h2', { text: 'Play the bass' }),
    keys,
    h('div', { class: 'row', style: 'margin-top:10px;justify-content:space-between' }, lower, oct, higher),
    h('h3', { text: 'Autopilot' }),
    h('label', { class: 'switch' }, h('span', null, 'Build and drop by itself', h('small', { text: 'A four-bar rise every 24 bars. Good for watching, or for recording.' })), auto),
  );
  Object.assign(app, { pilotOff: () => { auto.checked = false; pilot = false; } });
}
