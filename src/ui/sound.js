/* Wipelight: the Sound tab. A vibe is a whole starting point; the mood sets the notes and the colour; four big sliders do most of what you want,
   and "More sound" holds the rest. Everything is named for what you hear, not for what the synth calls it. */
import { $, h, clamp } from '../util.js';
import { paintRange, toast } from './dom.js';

const SLIDERS = [
  ['cutoff', 'Brightness', 'dark to bright', (A) => A.params.cutoff, (A, v) => A.setParam('cutoff', v)],
  ['space', 'Space', 'dry to roomy', (A) => A.params.space, (A, v) => A.setParam('space', v)],
  ['swing', 'Groove', 'straight to bouncy', (A, S) => S.swing * 2, (A, S, v) => (S.swing = v / 2)],
  ['level', 'Volume', 'quiet to loud', (A) => A.params.level, (A, v) => A.setParam('level', v)],
];
const MORE = [
  ['reso', 'Edge', 'smooth to sharp', (A) => A.params.reso, (A, v) => A.setParam('reso', v)],
  ['decay', 'Length', 'short to long notes', (A) => A.params.decay, (A, v) => A.setParam('decay', v)],
  ['drive', 'Dirt', 'clean to gritty', (A) => A.params.drive, (A, v) => A.setParam('drive', v)],
  ['glide', 'Slide', 'stepped to gliding', (A) => A.params.glide, (A, v) => A.setParam('glide', v)],
  ['drift', 'Wander', 'fixed to roaming', (A, S) => S.drift, (A, S, v) => (S.drift = v)],
  ['duck', 'Pump', 'none to heavy', (A) => A.params.duck, (A, v) => A.setParam('duck', v)],
];
const DROPS = [['On the beat', 'beat'], ['On the bar', 'bar'], ['Right away', 'now']];

export function buildSound(app) {
  const { A, S, V, P } = app, pane = $('#pane-sound');
  const syncs = [];

  /* ---- mood ---- */
  function setLight(i) {
    S.light = i;
    V.setLight(i);
    if (P.active) P.log(A.now(), 7, i);
    document.documentElement.style.setProperty('--tint-rgb', S.lights[i].tint.join(','));
    document.querySelector('meta[name=theme-color]').setAttribute('content', '#070b18');
    for (const b of moodBtns) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
  }
  const moodBtns = S.lights.map((l, i) => h('button', { type: 'button', class: 'chip', 'data-i': i, onclick: () => setLight(i), style: `border-color:rgba(${l.tint.join(',')},.6)` }, `${l.name}`, h('small', { class: 'fine', text: l.mode })));

  /* ---- vibes ---- */
  const vibeBtns = S.styles.map((st, i) => h('button', { type: 'button', class: 'vibe', role: 'option', onclick: () => setStyle(i) }, h('b', { text: st.name }), h('small', { text: st.note })));
  function setStyle(i) {
    i = (i + S.styles.length) % S.styles.length;
    if (!S.applyStyle(i)) return;
    paintVibe();
    toast(`${S.styles[i].name}${S.playing ? ' (lands on the next bar)' : ''}`, 2200);
    if (!S.playing) app.refreshAll();
  }
  const paintVibe = () => vibeBtns.forEach((b, i) => b.setAttribute('aria-selected', String(i === S.style)));

  /* ---- tempo: a stepper, and tap ---- */
  const bpm = h('div', { class: 'bpm', 'aria-live': 'off' }, '119', h('small', { text: 'beats a minute' }));
  const paintTempo = () => { bpm.firstChild.textContent = Math.round(A.params.tempo); };
  function setTempo(v) { if (!isFinite(v)) return; A.setParam('tempo', clamp(Math.round(v * 10) / 10, 60, 200)); paintTempo(); }
  let taps = [];
  const tap = () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 2500).concat(now);
    if (taps.length >= 3) { const gaps = taps.slice(1).map((t, i) => t - taps[i]); setTempo(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)); }
  };
  const tempo = h('div', { class: 'tempo' },
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Slower', onclick: () => setTempo(A.params.tempo - 1) }, '−'), bpm,
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Faster', onclick: () => setTempo(A.params.tempo + 1) }, '+'),
    h('button', { type: 'button', class: 'btn', title: 'Tap a few times to set the speed', onclick: tap }, 'Tap'));

  /* ---- sliders ---- */
  function slider([id, label, sub, get, set]) {
    const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: get(A, S), 'aria-label': `${label}: ${sub}` });
    paintRange(inp);
    inp.addEventListener('input', () => { set(A, S, +inp.value); paintRange(inp); });
    syncs.push(() => { inp.value = get(A, S); paintRange(inp); });
    return h('label', { class: 'field' }, h('span', { class: 'top' }, h('span', null, label), h('small', { text: sub })), inp);
  }
  const more = h('div', { hidden: true }, MORE.map(slider));
  const moreBtn = h('button', { type: 'button', class: 'btn', style: 'width:100%;margin-top:6px', 'aria-expanded': 'false', onclick: () => { more.hidden = !more.hidden; moreBtn.setAttribute('aria-expanded', String(!more.hidden)); moreBtn.textContent = more.hidden ? 'More sound' : 'Less sound'; } }, 'More sound');
  const drops = h('div', { class: 'chips' }, DROPS.map(([t, v]) => h('button', { type: 'button', class: 'chip', 'data-v': v, 'aria-pressed': String(S.quant === v), onclick: () => { S.setQuant(v); for (const b of drops.children) b.setAttribute('aria-pressed', String(b.dataset.v === S.quant)); } }, t)));

  pane.append(
    h('h2', { text: 'Sound' }),
    h('h3', { text: 'Vibe' }), h('div', { class: 'vibes', role: 'listbox', 'aria-label': 'Vibe' }, vibeBtns),
    h('h3', { text: 'Mood' }), h('div', { class: 'chips' }, moodBtns),
    h('h3', { text: 'Speed' }), tempo,
    h('h3', { text: 'Tweak' }), SLIDERS.map(slider), moreBtn, more,
    h('h3', { text: 'When the drop lands' }), drops,
  );
  const sync = () => { syncs.forEach((f) => f()); paintTempo(); paintVibe(); setLight(S.light); };
  app.onTab.sound = sync;
  Object.assign(app, { setLight, setStyle, setTempo, nudgeTempo: (d) => setTempo(A.params.tempo + d), syncSound: sync, KNOBS: SLIDERS.concat(MORE) });
  sync();
}
