/* Wipelight Takes: the page. A library of takes on the left; on the right, a performance (replayed with the instrument's own sound and picture, edited on a
   timeline) or a video (played, trimmed). Everything lives in this browser. */
import { $, el, download, fmtBytes, fmtTime, stamp } from '../util.js';
import { CONFIG } from '../config.js';
import { LIGHTS } from '../engine/styles.js';
import { createAudio } from '../engine/audio.js';
import { makeClock } from '../engine/clock.js';
import { createVisual } from '../visual/engine.js';
import { createPlayback } from '../perf/playback.js';
import { C, decode, encode, toDoc, createRecorder } from '../perf/format.js';
import { createRecording } from '../rec/recorder.js';
import { library } from '../rec/library.js';
import { toast } from '../ui/dom.js';
import { createTimeline, describe } from './timeline.js';
import * as ed from './edit.js';
import { renderWav, renderStems } from './render.js';
import { buildVideo } from './video.js';

const GLYPH = { performance: '◇', video: '▶', audio: '♪' };

export function start() {
  const qs = new URLSearchParams(location.search);
  const A = createAudio(), V = createVisual({ audio: A }), pic = $('#pic');
  const PB = createPlayback({ audio: A, visual: V, makeClock, onLight: (i) => document.documentElement.style.setProperty('--tint-rgb', LIGHTS[i].tint.join(',')) });
  V.init(pic, { fit: () => [pic.clientWidth || 640, pic.clientHeight || 280] });
  new ResizeObserver(() => V.resize()).observe($('#stagewrap'));
  const R = createRecording({ audio: A, perf: createRecorder(), snapshot: () => ({}), canvas: pic });
  R.toStudio = true;

  const S = { take: null, events: [], snapshot: {}, duration: 0, created: null, history: [], hi: 0, savedAt: 0, dirty: false };
  const tl = createTimeline($('#tl'), {
    seek: (t) => PB.seek(t),
    select: () => paintReadout(),
    hover: (e) => { $('#readout').textContent = e ? describe(e) : selectionText(); },
    preview: (dt) => tl.set(ed.move(S.events, tl.sel, dt), S.snapshot, S.duration),
    move: (dt) => commit(ed.move(S.events, tl.sel, dt)),
  });
  const selectionText = () => (tl.sel.size ? `${tl.sel.size} selected` : 'Tap an event to see it. Drag to select a range. Ctrl + wheel zooms.');
  const paintReadout = () => { $('#readout').textContent = selectionText(); };
  const video = buildVideo({ refresh: (id, o) => refresh(id, o) });

  /* ---------------- the library ---------------- */
  async function refresh(openId, { keepOpen } = {}) {
    const takes = await library.list(), ul = $('#takes');
    ul.replaceChildren();
    $('#libhint').hidden = takes.length > 0;
    for (const t of takes) {
      const li = el('li', 'take');
      li.tabIndex = 0;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(S.take && S.take.id === t.id));
      li.dataset.id = t.id;
      li.append(el('span', 'ic', GLYPH[t.kind] || '·'), el('b', null, t.name), el('small', null, `${fmtTime(t.duration || 0)} · ${fmtBytes(t.bytes)} · ${new Date(t.created).toLocaleDateString()}`));
      const go = () => openTake(t.id);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      ul.append(li);
    }
    usage();
    if (openId && !keepOpen) await openTake(openId);
    else if (!openId && !keepOpen) showView('empty');
  }

  async function usage() {
    const u = await library.usage();
    $('#usage').textContent = u ? `${fmtBytes(u.used)} used of ${fmtBytes(u.quota)}` : '';
  }

  function showView(which) {
    for (const id of ['empty', 'perfview', 'videoview']) $(`#${id}`).hidden = id !== which;
    if (which !== 'perfview' && PB.playing) PB.pause();
    if (which !== 'videoview') video.close();
  }

  async function openTake(id) {
    if (S.dirty && !confirm('You have changes that are not saved. Leave without saving?')) return;
    const take = await library.get(id);
    if (!take) return refresh(null);
    if (PB.playing) await PB.pause();
    S.take = take; S.dirty = false;
    for (const li of document.querySelectorAll('.take')) li.setAttribute('aria-selected', String(li.dataset.id === id));
    if (take.kind === 'performance') { showView('perfview'); await openPerf(take); }
    else if (take.kind === 'video') { showView('videoview'); await video.open(take); }
    else toast('This take is audio only: download it from the list and open it anywhere.');
    history.replaceState(null, '', `?take=${id}`);
  }

  /* ---------------- a performance ---------------- */
  async function openPerf(take) {
    const doc = await decode(new Uint8Array(await (await library.blob(take.id)).arrayBuffer()));
    S.events = ed.withIds(doc.events); S.snapshot = doc.snapshot; S.duration = doc.duration; S.created = doc.created;
    S.history = [{ events: S.events, duration: S.duration }]; S.hi = 0; S.savedAt = 0; S.dirty = false;
    $('#pname').value = take.name;
    $('#pnotes').value = take.notes || '';
    $('#gate').hidden = false;
    pushToViews(true);
    tl.fit();
    paintReadout();
    paintButtons();
  }

  const docNow = () => ({ duration: ed.lengthOf(S.events, S.duration), snapshot: S.snapshot, events: S.events, created: S.created });

  async function pushToViews(reset) {
    tl.set(S.events, S.snapshot, ed.lengthOf(S.events, S.duration));
    const pos = reset ? 0 : PB.position(), was = PB.playing;
    await PB.set(docNow());
    PB.seek(Math.min(pos, docNow().duration));
    if (was) PB.play();
    const d = docNow().duration;
    $('#tseek').max = d;
    $('#pmeta').textContent = `${fmtTime(d)} · ${S.events.length.toLocaleString()} events · ${S.dirty ? 'unsaved edits' : 'saved'}`;
  }

  function commit(events, duration) {
    if (duration != null) S.duration = duration;
    S.history = S.history.slice(0, S.hi + 1).concat([{ events, duration: S.duration }]);   // each step remembers the length too, so undoing a crop brings it back
    S.hi = S.history.length - 1;
    S.events = events;
    if (S.savedAt > S.hi) S.savedAt = -1;                                                  // the saved state was on a redo branch we just threw away
    S.dirty = S.hi !== S.savedAt;
    pushToViews(false);
    paintButtons();
  }

  function stepHistory(d) {
    const n = S.hi + d;
    if (n < 0 || n >= S.history.length) return;
    S.hi = n; S.events = S.history[n].events; S.duration = S.history[n].duration; S.dirty = n !== S.savedAt;
    pushToViews(false);
    paintButtons();
  }

  function paintButtons() {
    $('#undo').disabled = S.hi <= 0;
    $('#redo').disabled = S.hi >= S.history.length - 1;
    $('#save').disabled = !S.dirty;
  }

  const withSel = (fn) => () => { if (!tl.sel.size) return toast('Select something first: click an event or drag a box.'); fn(); };
  const gridSec = () => 60 / ed.tempoAt(S.events, S.snapshot, PB.position()) / (+$('#qgrid').value / 4);

  $('#undo').addEventListener('click', () => stepHistory(-1));
  $('#redo').addEventListener('click', () => stepHistory(1));
  $('#del').addEventListener('click', withSel(() => { commit(ed.remove(S.events, tl.sel)); tl.clearSelection(); }));
  $('#dup').addEventListener('click', withSel(() => { const r = ed.duplicate(S.events, tl.sel, gridSec() * 16); commit(r.events); tl.sel = r.ids; tl.redraw(); }));
  $('#quant').addEventListener('click', () => { commit(ed.quantise(S.events, tl.sel, gridSec())); toast(tl.sel.size ? 'Snapped the selection to the grid.' : 'Snapped every note and hit to the grid.'); });
  for (const [id, n] of [['tm12', -12], ['tm1', -1], ['tp1', 1], ['tp12', 12]]) $(`#${id}`).addEventListener('click', withSel(() => commit(ed.transpose(S.events, tl.sel, n))));
  $('#vdn').addEventListener('click', withSel(() => commit(ed.velocity(S.events, tl.sel, 0.85))));
  $('#vup').addEventListener('click', withSel(() => commit(ed.velocity(S.events, tl.sel, 1.15))));
  $('#crop').addEventListener('click', withSel(() => { const r = tl.selectedRange(), t = ed.trim(S.events, r[0], r[1] + 0.001); commit(t.events, t.duration); tl.clearSelection(); tl.fit(); }));
  $('#cutr').addEventListener('click', withSel(() => { const r = tl.selectedRange(); commit(ed.cut(S.events, r[0], r[1] + 0.001), Math.max(0, S.duration - (r[1] - r[0]))); tl.clearSelection(); }));
  $('#snap').addEventListener('change', (e) => { tl.snap = e.target.checked; });
  $('#follow').addEventListener('change', (e) => { tl.following = e.target.checked; });
  $('#tfit').addEventListener('click', () => tl.fit());
  $('#tzi').addEventListener('click', () => tl.zoom(1.5));
  $('#tzo').addEventListener('click', () => tl.zoom(1 / 1.5));

  const fillAdd = () => {
    const sel = $('#addval'), kind = $('#addkind').value;
    sel.replaceChildren();
    const labels = kind === 'scene' ? ['tentacles', 'dot grid', 'film frames', 'spokes', 'ink'] : LIGHTS.map((l) => l.name);
    labels.forEach((n, i) => { const o = el('option', null, `${i + 1} ${n}`); o.value = i; sel.append(o); });
  };
  $('#addkind').addEventListener('change', fillAdd);
  fillAdd();
  $('#addbtn').addEventListener('click', () => {
    const code = $('#addkind').value === 'scene' ? C.scene : C.light;
    commit(ed.insert(S.events, { t: PB.position(), code, a: [+$('#addval').value] }));
  });

  /* ---- transport ---- */
  const setPlayLabel = () => { $('#tplay').textContent = PB.playing ? '❚❚' : '▶'; $('#tplay').setAttribute('aria-label', PB.playing ? 'Pause' : 'Play'); $('#gate').hidden = PB.playing || PB.position() > 0.01; };
  PB.onChange = setPlayLabel;
  $('#tplay').addEventListener('click', () => PB.toggle());
  $('#gobtn').addEventListener('click', () => PB.play());
  let seeking = false;
  $('#tseek').addEventListener('input', () => { seeking = true; PB.seek(+$('#tseek').value); });
  $('#tseek').addEventListener('change', () => { seeking = false; });
  (function loop() {
    if (!$('#perfview').hidden && PB.perf) {
      const p = PB.position();
      tl.setPlayhead(p);
      if (!seeking) $('#tseek').value = p;
      $('#tseek').style.setProperty('--fill', `${(p / Math.max(0.01, +$('#tseek').max)) * 100}%`);
      $('#ttime').textContent = `${fmtTime(p)} / ${fmtTime(PB.perf.duration)}`;
    }
    requestAnimationFrame(loop);
  })();

  /* ---- keeping, exporting, rendering ---- */
  const baseName = () => ($('#pname').value.trim() || 'take').replace(/\.sqz$/i, '');
  const status = (t) => { $('#pstatus').textContent = t || ''; };
  async function encodeNow() { const doc = toDoc({ snapshot: S.snapshot, events: S.events, duration: S.duration, created: S.created }); return { doc, enc: await encode(doc) }; }
  const takeInfo = (doc, name) => ({ kind: 'performance', name, mime: 'application/octet-stream', duration: doc.duration, meta: { events: doc.events.length } });

  $('#save').addEventListener('click', async () => {
    const { doc, enc } = await encodeNow();
    S.take = await library.replaceBlob(S.take.id, new Blob([enc.bytes]), { name: baseName() + '.sqz', duration: doc.duration, meta: { ...(S.take.meta || {}), events: doc.events.length } });
    S.history = [{ events: S.events, duration: S.duration }]; S.hi = 0; S.savedAt = 0; S.dirty = false;
    toast('Saved.'); paintButtons(); await pushToViews(false); refresh(S.take.id, { keepOpen: true });
  });
  $('#saveas').addEventListener('click', async () => {
    const { doc, enc } = await encodeNow();
    const rec = await library.add(takeInfo(doc, `${baseName()} (copy).sqz`), new Blob([enc.bytes]));
    S.dirty = false;
    toast('Saved a copy.');
    refresh(rec.id);
  });
  $('#export').addEventListener('click', async () => { const { enc } = await encodeNow(); download(new Blob([enc.bytes]), `${baseName()}.sqz`); });
  $('#wav').addEventListener('click', async () => {
    const b = $('#wav');
    b.disabled = true;
    try {
      const t0 = performance.now(), r = await renderWav(docNow(), { onStatus: status });
      download(new Blob([r.bytes], { type: 'audio/wav' }), `${baseName()}.wav`);
      toast(`Rendered ${fmtTime(r.seconds)} of sound in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } catch (err) { toast(`Could not render: ${err.message}`, 6000); }
    b.disabled = false; status('');
  });
  $('#stems').addEventListener('click', async () => {
    const b = $('#stems');
    b.disabled = true;
    try {
      const t0 = performance.now(), bytes = await renderStems(docNow(), { onStatus: status, name: baseName() });
      download(new Blob([bytes], { type: 'application/zip' }), `${baseName()}-stems.zip`);
      toast(`Rendered the parts in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } catch (err) { toast(`Could not render: ${err.message}`, 6000); }
    b.disabled = false; status('');
  });
  $('#vid').addEventListener('click', async () => {
    const b = $('#vid');
    b.disabled = true;
    try {
      await PB.play();                                                          // starts the audio (this click is the gesture the browser wants)
      PB.seek(0);
      await R.start('webm');
      status('recording the replay…');
      await new Promise((res) => { PB.onEnd = res; });
      PB.onEnd = null;
      const r = await R.stop();
      toast(`Saved ${r ? r.name : 'the video'} in Takes.`);
      refresh(r && r.ids[0]);
    } catch (err) { toast(`Could not record: ${err.message}`, 6000); try { await R.stop(); } catch (e) { /* nothing running */ } }
    PB.onEnd = null; b.disabled = false; status('');
  });
  $('#delete').addEventListener('click', async () => {
    if (!S.take || !confirm(`Delete "${S.take.name}"? This cannot be undone.`)) return;
    await library.remove(S.take.id);
    S.take = null; S.dirty = false;
    refresh(null);
  });
  $('#pname').addEventListener('change', async () => { if (S.take) { S.take = await library.update(S.take.id, { name: $('#pname').value.trim() || S.take.name }); refresh(S.take.id, { keepOpen: true }); } });
  $('#pnotes').addEventListener('change', async () => { if (S.take) S.take = await library.update(S.take.id, { notes: $('#pnotes').value }); });

  /* ---- keys (only when you are not typing) ---- */
  addEventListener('keydown', (e) => {
    if ($('#perfview').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); stepHistory(e.shiftKey ? 1 : -1); }
    else if (mod && k === 'y') { e.preventDefault(); stepHistory(1); }
    else if (mod && k === 'a') { e.preventDefault(); tl.selectAll(); }
    else if (mod && k === 's') { e.preventDefault(); if (S.dirty) $('#save').click(); }
    else if (mod) return;
    else if (k === ' ') { e.preventDefault(); PB.toggle(); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); if (tl.sel.size) $('#del').click(); }
    else if (k === 'escape') tl.clearSelection();
    else if (k === 'q') $('#quant').click();
    else if ((k === 'arrowleft' || k === 'arrowright') && tl.sel.size) { e.preventDefault(); commit(ed.move(S.events, tl.sel, (k === 'arrowleft' ? -1 : 1) * gridSec() * (e.shiftKey ? 4 : 1))); }
    else if (k === 'arrowleft') PB.seek(PB.position() - 5);
    else if (k === 'arrowright') PB.seek(PB.position() + 5);
    else if (k === 'home') PB.seek(0);
  });
  addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- importing ---------------- */
  async function importFile(f) {
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    if ((head[0] === 0x1f && head[1] === 0x8b) || /\.(sqz|json)$/i.test(f.name)) {
      const doc = await decode(new Uint8Array(await f.arrayBuffer()));
      return library.add({ kind: 'performance', name: f.name, mime: 'application/octet-stream', duration: doc.duration, meta: { events: doc.events.length } }, f);
    }
    if (/^video\//.test(f.type) || /\.(webm|mp4|mkv)$/i.test(f.name)) return library.add({ kind: 'video', name: f.name, mime: f.type || 'video/webm', duration: 0 }, f);
    if (/^audio\//.test(f.type) || /\.(wav|mp3)$/i.test(f.name)) return library.add({ kind: 'audio', name: f.name, mime: f.type, duration: 0 }, f);
    throw new Error('not a performance, video or audio file');
  }
  async function importFiles(files) {
    let last = null;
    for (const f of files) { try { last = await importFile(f); toast(`Added ${f.name}`); } catch (err) { toast(`${f.name}: ${err.message}`, 5000); } }
    if (last) refresh(last.id);
  }
  $('#import').addEventListener('click', () => $('#importfile').click());
  $('#importfile').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; importFiles(files); });
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; $('#dropzone').hidden = false; } });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('#dropzone').hidden = true; });
  addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $('#dropzone').hidden = true; importFiles([...e.dataTransfer.files]); });
  $('#keep').addEventListener('click', async () => toast((await library.persist()) ? 'The browser will keep your takes unless you clear them yourself.' : 'The browser would not promise that. Download what matters.', 5000));

  refresh(qs.get('take'));
  window.__studio = { S, tl, PB, V, A, library, commit, ed, refresh, CONFIG, stamp };
}
