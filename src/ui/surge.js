/* Glass Groove: Surge. Tap the picture twice with two fingers (or press Surge in the Play tab) and the controls swap for a different set: a long rise that drops by itself,
   with a countdown you can see. The picture climbs with the sound: the hue turns through the spectrum, brightness follows the riser's pitch, and the whole screen glows more
   as the drop gets near. You can make it longer or shorter, bring the drop forward, cancel it, and choose what lands: the same vibe, the next one, or a surprise. */
import { $, h, clamp } from '../util.js';
import { hint } from './dom.js';

const LANDS = [['same', 'Same vibe'], ['next', 'Next vibe'], ['surprise', 'Surprise']];

export function buildSurge(app) {
  const { A, S, V } = app;
  let bars = clamp(+app.store.get('surgeBars', 8) || 8, 4, 16), lands = app.store.get('surgeLands', 'same');
  let active = false, cancelled = false, t0 = 0, raf = 0, lastTint = 0, status = null;

  const num = h('b', { class: 'sg-n', text: '8' }), unit = h('span', { class: 'sg-u', text: 'bars' });
  const fill = h('i', { class: 'sg-fill' });
  const beats = h('div', { class: 'sg-beats', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const landBtns = LANDS.map(([v, t]) => h('button', { type: 'button', class: 'chip', 'data-v': v, onclick: () => { lands = v; app.store.set('surgeLands', v); paintLands(); } }, t));
  const paintLands = () => landBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === lands)));
  const longer = h('button', { type: 'button', class: 'btn', onclick: () => shift(4) }, 'Longer');
  const shorter = h('button', { type: 'button', class: 'btn', onclick: () => shift(-4) }, 'Shorter');
  const now = h('button', { type: 'button', class: 'btn primary', onclick: () => { if (S.surgeNow()) hint('Dropping on the next beat.', 1800); } }, 'Drop now');
  const cancel = h('button', { type: 'button', class: 'btn', onclick: () => end(true) }, 'Cancel');
  const box = h('section', { id: 'surge', 'aria-label': 'Surge', hidden: true },
    h('div', { class: 'sg-top', 'aria-live': 'off' }, h('span', { class: 'sg-k', text: 'Drop in' }), num, unit, h('div', { class: 'sg-bar' }, fill), beats),
    h('div', { class: 'sg-panel' },
      h('div', { class: 'row' }, shorter, longer),
      h('h3', { text: 'What lands' }), h('div', { class: 'chips' }, landBtns),
      h('div', { class: 'row', style: 'margin-top:10px' }, now, cancel)));
  document.body.append(box);
  paintLands();

  function shift(d) {
    if (!S.surgeShift(d)) return;
    bars = clamp(bars + d, 4, 16); app.store.set('surgeBars', bars);
    hint(`${d > 0 ? 'Longer' : 'Shorter'}: the drop moved ${Math.abs(d)} bars.`, 1800);
  }

  function pickStyle() {
    const n = S.styles.length;
    if (lands === 'next') return (S.style + 1) % n;
    if (lands === 'surprise') { let i; do i = Math.floor(Math.random() * n); while (i === S.style && n > 1); return i; }
    return -1;
  }

  function start() {
    if (active) return;
    if (!A.ready || !S.playing) return hint('Wake the light and press play first.');
    if (S.build) return hint('Already rising. Let go of Rise first.');
    if (!S.surgeStart(bars)) return;
    active = true; cancelled = false; t0 = performance.now();
    const next = pickStyle();
    S.onDrop = next >= 0 ? () => S.applyStyle(next, { now: true }) : null;     // the new vibe starts on the drop itself
    document.body.classList.add('surging');
    app.closeSheet && app.closeSheet();
    box.hidden = false; box.classList.remove('dropped');
    app.nav.push('surge', () => end(true));
    app.buzz && app.buzz([20, 30, 20]);
    raf = requestAnimationFrame(frame);
  }

  function frame() {
    if (!active) return;
    if (!S.surgeTick) return end(cancelled || !S.playing);                    // the drop landed (or the music stopped)
    const left = S.timeToTick(S.surgeTick), el = (performance.now() - t0) / 1000, total = Math.max(0.5, el + left), p = clamp(el / total, 0, 1), bar = S.barDur();
    status = { p, bars: Math.max(1, Math.ceil(left / bar)) };
    V.setSurge(p);
    document.body.style.setProperty('--surge', p.toFixed(3));
    const inLast = left < bar;
    num.textContent = inLast ? Math.max(1, Math.ceil(left / (bar / 4))) : status.bars;
    unit.textContent = inLast ? (Math.ceil(left / (bar / 4)) === 1 ? 'beat' : 'beats') : (status.bars === 1 ? 'bar' : 'bars');
    fill.style.transform = `scaleX(${p.toFixed(3)})`;
    if (inLast) { const b = Math.max(1, Math.ceil(left / (bar / 4))); [...beats.children].forEach((e, i) => e.classList.toggle('on', i >= 4 - b)); }
    else [...beats.children].forEach((e) => e.classList.remove('on'));
    if (performance.now() - lastTint > 90) {                                    // the whole interface takes the picture's colour (a few times a second is enough)
      lastTint = performance.now();
      const c = V.tintNow();
      document.documentElement.style.setProperty('--tint-rgb', `${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}`);
    }
    raf = requestAnimationFrame(frame);
  }

  function end(wasCancelled) {
    if (!active) return;
    active = false; status = null; cancelAnimationFrame(raf);
    if (wasCancelled && S.build) { S.buildCancel(); app.dropBuild && app.dropBuild(); }
    V.setSurge(0);
    document.body.style.removeProperty('--surge');
    app.nav.release('surge');
    if (wasCancelled) { box.hidden = true; document.body.classList.remove('surging'); app.setLight(S.light); return; }
    box.classList.add('dropped');                                               // a flash and a word, then the controls come back
    num.textContent = 'DROP'; unit.textContent = '';
    setTimeout(() => { box.hidden = true; box.classList.remove('dropped'); document.body.classList.remove('surging'); app.setLight(S.light); }, 1500);
  }
  const cancelFn = () => { cancelled = true; end(true); };

  app.surge = { start, end: cancelFn, active: () => active, status: () => status, setBars: (n) => { bars = clamp(n, 4, 16); app.store.set('surgeBars', bars); }, bars: () => bars };
}
