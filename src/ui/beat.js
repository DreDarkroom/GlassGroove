/* Glass Groove: the Beat tab. Pick a part (kick, snare, hats, bass), then shape it with big, plain-worded controls.
   The three drummers are rings of dots that loop at different lengths (so the groove takes a long time to repeat): tap a dot to turn a hit on or off.
   The bass is a small grid, eight steps at a time. Pro view (Settings) shows all sixteen at once. */
import { $, h, clamp } from '../util.js';
import { paintRange, toast } from './dom.js';
import { DB_RANGE } from '../engine/audio.js';

const NS = 'http://www.w3.org/2000/svg';
const LENS = [8, 10, 12, 14, 15, 16];
const NAMES = ['Kick', 'Snare', 'Hats', 'Bass'];
const PARTS = ['kick', 'snare', 'hat', 'bass'];
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function buildBeat(app) {
  const { A, S } = app, pane = $('#pane-beat');
  let part = 0, page = 0, dots = [], cells = [], nowCol = -1, nowDot = -1;

  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const isMuted = (i) => !!S.mute[PARTS[i]];
  const dbOf = (i) => A.params[PARTS[i] + 'Db'] || 0;

  /* ---- the part chooser ---- */
  const partBtns = NAMES.map((n, i) => h('button', { type: 'button', class: 'part', role: 'tab', onclick: () => { part = i; page = 0; render(); } }, h('span', null, n), h('small')));
  const partsRow = h('div', { class: 'parts', role: 'tablist', 'aria-label': 'Part' }, partBtns);
  const editor = h('div', { class: 'editor' });
  const tools = h('div', { class: 'grid2' });
  const extra = h('div');

  /* ---- the ring (kick, snare, hats) ---- */
  function renderRing() {
    const d = S.drummers[part], rad = 38, pr = Math.min(7.5, rad * Math.sin(Math.PI / d.len) * 0.8);
    const svg = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'group', 'aria-label': `${NAMES[part]} pattern: tap a dot to turn a hit on or off` });
    dots = [];
    for (let s = 0; s < d.len; s++) {
      const a = (s / d.len) * Math.PI * 2 - Math.PI / 2;
      const c = svgEl('circle', { cx: (rad * Math.cos(a)).toFixed(2), cy: (rad * Math.sin(a)).toFixed(2), r: pr.toFixed(2), class: 'dot' + (d.steps[s] ? ' on' : ''), 'data-s': s,
        role: 'button', tabindex: 0, 'aria-pressed': String(!!d.steps[s]), 'aria-label': `${NAMES[part]} step ${s + 1} of ${d.len}` });
      svg.append(c); dots.push(c);
    }
    const t = svgEl('text', { x: 0, y: 1, class: 'ringtext' }); t.textContent = `${d.hits} of ${d.len}`;
    const sub = svgEl('text', { x: 0, y: 9, class: 'ringsub' }); sub.textContent = 'tap the dots';
    svg.append(t, sub);
    const toggleStep = (c) => {
      const s = +c.dataset.s; d.steps[s] = !d.steps[s]; d.hits = d.steps.filter(Boolean).length;
      c.classList.toggle('on', d.steps[s]); c.classList.remove('ghost'); c.setAttribute('aria-pressed', String(!!d.steps[s])); t.textContent = `${d.hits} of ${d.len}`;
    };
    svg.addEventListener('click', (e) => { const c = e.target.closest('.dot'); if (c) toggleStep(c); });
    svg.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = e.target.closest && e.target.closest('.dot'); if (c) { e.preventDefault(); toggleStep(c); } });
    editor.replaceChildren(h('div', { class: 'ringbox' }, svg));
    const redo = () => { S.regen(part); render(); };
    const btn = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    tools.replaceChildren(
      btn('Fewer hits', () => { d.hits = Math.max(0, d.hits - 1); redo(); }), btn('More hits', () => { d.hits = Math.min(d.len, d.hits + 1); redo(); }),
      btn('Shorter loop', () => { stepLen(d, -1); redo(); }), btn('Longer loop', () => { stepLen(d, 1); redo(); }),
      btn('Spin left', () => { d.steps.push(d.steps.shift()); render(); }), btn('Spin right', () => { d.steps.unshift(d.steps.pop()); render(); }),
      btn('New pattern', () => { d.hits = 2 + Math.floor(Math.random() * Math.max(2, d.len / 2 - 1)); d.rot = Math.floor(Math.random() * d.len); redo(); }),
      btn('Clear', () => { d.steps = new Array(d.len).fill(false); d.hits = 0; render(); }));
  }
  function stepLen(d, dir) { d.len = LENS[clamp(LENS.indexOf(d.len) + dir, 0, LENS.length - 1)]; d.hits = Math.min(d.hits, d.len); }

  /* ---- the bass grid ---- */
  function renderBass() {
    const pro = document.body.classList.contains('pro'), cols = pro ? 16 : 8, from = pro ? 0 : page * 8, pat = S.synth.pattern;
    cells = [];
    const grid = h('div', { class: 'bass', style: `grid-template-columns:repeat(${cols},1fr)`, role: 'group', 'aria-label': 'Bass steps: tap to place a note' });
    for (let row = 7; row >= 0; row--) {
      for (let c = 0; c < cols; c++) {
        const col = from + c;
        const b = h('button', { type: 'button', class: 'cell' + (col % 4 === 0 ? ' beat' : ''), 'aria-label': `Step ${col + 1}, note ${row + 1}`, 'aria-pressed': String(pat[col] === row), 'data-col': col, 'data-row': row });
        if (pat[col] === row) b.classList.add('on');
        (cells[col] = cells[col] || [])[row] = b;
        grid.append(b);
      }
    }
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.cell'); if (!b) return;
      const col = +b.dataset.col, row = +b.dataset.row, p = S.synth.pattern;
      p[col] = p[col] === row ? -1 : row; S.home = p.slice();
      for (let r = 0; r < 8; r++) { const x = cells[col][r]; if (x) { x.classList.toggle('on', p[col] === r); x.setAttribute('aria-pressed', String(p[col] === r)); } }
      if (A.ready && p[col] >= 0) A.note(A.now() + 0.01, S.midi(row), 0.7, 0.18, false);
    });
    const pager = pro ? null : h('div', { class: 'chips', role: 'group', 'aria-label': 'Which steps' },
      [['Steps 1 to 8', 0], ['Steps 9 to 16', 1]].map(([t, i]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(page === i), onclick: () => { page = i; render(); } }, t)));
    editor.replaceChildren(...[pager, grid, h('p', { class: 'bassnote', text: `Key of ${NOTE_NAMES[A.params.root % 12]}. Higher rows are higher notes.` })].filter(Boolean));
    const btn = (label, fn) => h('button', { type: 'button', class: 'btn', onclick: fn }, label);
    const key = (d) => { A.setParam('root', clamp(A.params.root + d, 33, 57)); render(); toast(`Key of ${NOTE_NAMES[A.params.root % 12]}`, 1400); };
    tools.replaceChildren(
      btn('New bass line', () => { const pool = [0, 0, 0, 2, 3, 4, 5, 7]; S.synth.pattern = Array.from({ length: 16 }, (_, i) => (Math.random() < (i % 4 === 0 ? 0.8 : 0.4) ? pool[Math.floor(Math.random() * pool.length)] : -1)); S.home = S.synth.pattern.slice(); render(); }),
      btn('Clear', () => { S.clear('bass'); render(); }),
      btn('Shift left', () => { const q = S.synth.pattern; q.push(q.shift()); S.home = q.slice(); render(); }), btn('Shift right', () => { const q = S.synth.pattern; q.unshift(q.pop()); S.home = q.slice(); render(); }),
      btn('Key down', () => key(-1)), btn('Key up', () => key(1)));
  }

  /* ---- mute, solo and level for the chosen part ---- */
  function renderExtra() {
    const i = part, mute = h('button', { type: 'button', class: 'btn', 'aria-pressed': String(isMuted(i)), onclick: () => { S.toggleMute(PARTS[i]); render(); } }, isMuted(i) ? 'Turn it back on' : 'Mute');
    const others = PARTS.filter((p) => p !== PARTS[i]), solo = !isMuted(i) && others.every((p) => S.mute[p]);
    const soloBtn = h('button', { type: 'button', class: 'btn', onclick: () => { others.forEach((p) => S.toggleMute(p, !solo)); S.toggleMute(PARTS[i], false); render(); } }, solo ? 'Bring the others back' : 'Only this part');
    const db = dbOf(i), val = h('small', { text: `${db > 0.04 ? '+' : ''}${db.toFixed(1)} dB` });
    const slider = h('input', { type: 'range', min: DB_RANGE[0], max: DB_RANGE[1], step: 0.5, value: db, 'aria-label': `${NAMES[i]} level` });
    paintRange(slider);
    slider.addEventListener('input', () => { A.setParam(PARTS[i] + 'Db', +slider.value); val.textContent = `${+slider.value > 0.04 ? '+' : ''}${(+slider.value).toFixed(1)} dB`; paintRange(slider); });
    extra.replaceChildren(h('div', { class: 'grid2', style: 'margin-top:8px' }, mute, soloBtn), h('label', { class: 'field' }, h('span', { class: 'top' }, h('span', null, 'Level'), val), slider));
  }

  function render() {
    partBtns.forEach((b, i) => { b.setAttribute('aria-pressed', String(i === part)); b.classList.toggle('muted', isMuted(i)); b.querySelector('small').textContent = isMuted(i) ? 'muted' : 'on'; });
    nowDot = -1; nowCol = -1;
    if (part < 3) renderRing(); else renderBass();
    renderExtra();
  }

  /* ---- the playhead, driven by the sequencer's timed events ---- */
  app.beatEvent = (e) => {
    if (app.currentTab() !== 'beat') return;
    if (e.type === 'step' && part === 3) {
      if (nowCol >= 0 && cells[nowCol]) for (const c of cells[nowCol]) if (c) c.classList.remove('now');
      nowCol = e.a;
      if (cells[nowCol]) for (const c of cells[nowCol]) if (c) c.classList.add('now');
    } else if (e.type === 'd' && e.a === part && part < 3) {
      if (dots[nowDot]) dots[nowDot].classList.remove('now');
      nowDot = e.b;
      if (dots[nowDot]) dots[nowDot].classList.add('now');
    } else if (e.type === 'cycle' && part === 3) {
      const p = S.synth.pattern;
      for (let col = 0; col < 16; col++) if (cells[col]) for (let r = 0; r < 8; r++) { const x = cells[col][r]; if (x) x.classList.toggle('on', p[col] === r); }
    }
  };

  pane.append(h('h2', { text: 'Shape the beat' }), partsRow, editor, tools, extra);
  app.onTab.beat = render;
  app.refreshBeat = () => { if (app.currentTab() === 'beat') render(); };
}
