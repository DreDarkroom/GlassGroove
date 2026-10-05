/* Glass Groove: the Keep tab. Record, share a beat as a link, save a beat on this phone, open a file, and go to Takes (where recordings live).
   Opening files and dropping them on the page both come through here. */
import { $, h, fmtBytes, fmtTime } from '../util.js';
import { isOurs } from '../config.js';
import { toast } from './dom.js';
import { snapshot, applySnapshot, saveLoop, loadLoop } from '../engine/loopfile.js';
import { beatUrl } from '../share.js';
import { decode } from '../perf/format.js';
import { library } from '../rec/library.js';

const FORMATS = [
  ['Replay', 'perf', 'A tiny file of what you did. Takes can edit it and turn it into sound.'],
  ['Video', 'webm', 'The picture and sound together.'],
  ['Video + replay', 'both', 'A video and its replay, kept together.'],
  ['Audio (WAV)', 'wav', 'Lossless sound, saved as a file.'],
  ['Audio (MP3)', 'mp3', 'Smaller sound, saved as a file.'],
];

export function buildKeep(app) {
  const { A, S, R, PB } = app, pane = $('#pane-keep');
  let format = app.store.get('recfmt', 'perf');
  const sup = R.support();
  if (!FORMATS.some(([, v]) => v === format) || sup[format] === false) format = 'perf';
  R.toStudio = app.store.get('toTakes', true) !== false;

  /* ---- record ---- */
  const info = h('p', { class: 'fine', 'aria-live': 'off' });
  const recBtn = h('button', { type: 'button', class: 'btn primary recbtn' }, h('span', { class: 'dotred' }), h('span', { class: 'lbl', text: 'Record' }));
  const fmtBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'What to record' });
  const takes = h('input', { type: 'checkbox', checked: R.toStudio });
  const takesRow = h('label', { class: 'switch' }, h('span', null, 'Keep it in Takes', h('small', { text: 'On this phone only. Nothing is uploaded.' })), takes);
  const paintFmt = () => {
    [...fmtBox.children].forEach((b, i) => { b.setAttribute('aria-pressed', String(FORMATS[i][1] === format)); const bad = sup[FORMATS[i][1]] === false; b.disabled = bad; });
    info.textContent = (FORMATS.find(([, v]) => v === format) || [])[2] || '';
    takesRow.hidden = !R.FORMATS[format].studio;
  };
  FORMATS.forEach(([t, v]) => fmtBox.append(h('button', { type: 'button', class: 'chip', onclick: () => { if (R.state.active) return; format = v; app.store.set('recfmt', v); paintFmt(); } }, t)));
  takes.addEventListener('change', () => { R.toStudio = takes.checked; app.store.set('toTakes', takes.checked); });
  recBtn.addEventListener('click', async () => {
    try {
      if (R.state.active) {
        const r = await R.stop();
        if (r) { toast(`Saved ${r.name} · ${fmtBytes(r.bytes)} · ${fmtTime(r.seconds)}${r.where === 'studio' ? ' · in Takes' : ''}`, 6000); if (r.where === 'studio' && r.ids[0]) app.lastTake = r.ids[0]; paintTakes(); }
      } else {
        if (!A.ready) return toast('Wake the light first.');
        if (PB.perf) return toast('Leave the replay first.');
        await R.start(format);
      }
    } catch (err) { toast(`Could not record: ${err.message}`, 6000); }
  });
  R.onUpdate = (st) => {
    document.body.classList.toggle('recording', !!st.active);
    recBtn.querySelector('.lbl').textContent = st.active ? `Stop · ${fmtTime(R.elapsed())}${st.format === 'perf' ? '' : ' · ' + fmtBytes(st.bytes || 0)}` : 'Record';
    for (const b of fmtBox.children) b.disabled = !!st.active || b.disabled;
    if (!st.active) paintFmt();
  };
  R.onAuto = (r) => toast(`Recording stopped: ${r.reason}. Saved ${r.name}.`, 8000);

  /* ---- beats ---- */
  async function share() {
    try {
      const url = await beatUrl(snapshot(S, A), location.href.split('#')[0]);
      if (navigator.share) { try { await navigator.share({ title: 'A Glass Groove beat', text: 'Open it, and press Wake the light.', url }); return; } catch (err) { if (err && err.name === 'AbortError') return; } }
      await navigator.clipboard.writeText(url);
      toast('Link copied. Paste it into a message.');
    } catch (err) { toast('Could not make a link here. Try Save instead.'); }
  }
  const save = () => { toast(saveLoop(S, A) ? 'Beat saved on this phone.' : 'This browser would not save. Use Share instead.'); };
  const load = () => { if (loadLoop(S, A)) { app.refreshAll(); toast('Your saved beat is back.'); } else toast('No saved beat yet.'); };

  /* ---- files ---- */
  async function openFile(f) {
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    if ((head[0] === 0x1f && head[1] === 0x8b) || /\.sqz$/i.test(f.name)) {                       // a replay: keep it in Takes, then open it there
      const doc = await decode(new Uint8Array(await f.arrayBuffer()));
      const rec = await library.add({ kind: 'performance', name: f.name, mime: 'application/octet-stream', duration: doc.duration, meta: { events: doc.events.length } }, f);
      app.lastTake = rec.id; paintTakes();
      return toast('Replay added to Takes. Open Takes to play or edit it.', 5000);
    }
    if (f.size > 4 * 1024 * 1024) return toast(`${f.name} is too big to be a beat.`);
    let j = null;
    try { j = JSON.parse(await f.text()); } catch (err) { /* handled below */ }
    if (j && j.kind === 'performance') return toast('That is a replay: add it as a .sqz file.');
    if (!j || !isOurs(j) || !applySnapshot(S, A, j)) return toast(`${f.name} is not a beat Glass Groove can use. Nothing was changed.`);
    app.refreshAll(); toast('Beat opened.');
  }
  const pick = $('#pick');
  pick.addEventListener('change', async () => { const files = [...pick.files]; pick.value = ''; for (const f of files.slice(0, 4)) { try { await openFile(f); } catch (err) { toast(`${f.name}: ${err.message}`); } } });
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; $('#dropzone').hidden = false; } });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('#dropzone').hidden = true; });
  addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $('#dropzone').hidden = true; (async () => { for (const f of [...e.dataTransfer.files].slice(0, 4)) { try { await openFile(f); } catch (err) { toast(`${f.name}: ${err.message}`); } } })(); });

  const takesLink = h('a', { class: 'btn', href: 'takes.html' }, 'Open Takes');
  const paintTakes = () => { takesLink.href = app.lastTake ? `takes.html?take=${app.lastTake}` : 'takes.html'; };

  const fbBtn = h('button', { type: 'button', class: 'btn wide', style: 'margin-top:14px', onclick: () => app.feedback.open() }, 'Send feedback or a suggestion');
  pane.append(
    h('h2', { text: 'Keep' }),
    h('h3', { text: 'Record' }), recBtn, h('div', { style: 'margin-top:10px' }, fmtBox), info, takesRow,
    h('h3', { text: 'This beat' }),
    h('div', { class: 'grid2' }, h('button', { type: 'button', class: 'btn primary', onclick: share }, 'Share a link'), h('button', { type: 'button', class: 'btn', onclick: save }, 'Save beat'),
      h('button', { type: 'button', class: 'btn', onclick: load }, 'Load saved beat'), h('button', { type: 'button', class: 'btn', onclick: () => pick.click() }, 'Open a file')),
    h('h3', { text: 'Your recordings' }), h('div', { class: 'row' }, takesLink),
    h('p', { class: 'fine', text: 'Takes plays them back, trims videos, edits replays and exports sound.' }),
    fbBtn,
  );
  app.onTab.keep = paintFmt;
  paintFmt();
}
