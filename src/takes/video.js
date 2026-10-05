/* Wipelight Takes: the video panel. Play a recorded take, mark a start and an end, save the kept part as a new take, grab a frame.
   A browser cannot cut a video file without re-encoding it, so "save trimmed copy" plays the kept part and records it again, in real time. */
import { $, clamp, fmtBytes, fmtTime, download } from '../util.js';
import { library } from '../rec/library.js';
import { toast } from '../ui/dom.js';

const once = (target, type, ms = 4000) => new Promise((resolve) => { const t = setTimeout(resolve, ms); target.addEventListener(type, () => { clearTimeout(t); resolve(); }, { once: true }); });

export function buildVideo(studio) {
  const v = $('#vid2');
  let take = null, url = null, dur = 0, bounds = { a: 0, b: 0 }, audio = null, previewing = false;
  const status = (t) => { $('#vstatus').textContent = t || ''; };

  function paintTrim() {
    const { a, b } = bounds, pct = (x) => (dur ? (x / dur) * 100 : 0);
    $('#tin').value = a; $('#tout').value = b;
    const s = $('#trimsel');
    s.style.left = `${pct(a)}%`; s.style.width = `${pct(b) - pct(a)}%`;
    $('#trimtxt').textContent = `keep ${fmtTime(a)} to ${fmtTime(b)} (${(b - a).toFixed(1)} s)`;
  }

  async function open(t) {
    take = t;
    if (url) URL.revokeObjectURL(url);
    const blob = await library.blob(t.id);
    url = URL.createObjectURL(blob);
    v.src = url;
    await once(v, 'loadedmetadata');
    if (!isFinite(v.duration)) {                                // a recorded WebM carries no length: ask the player to find the end
      v.currentTime = 1e9;
      await once(v, 'timeupdate');
      v.currentTime = 0;
    }
    dur = isFinite(v.duration) && v.duration > 0 ? v.duration : t.duration || 0;
    for (const id of ['#tin', '#tout']) $(id).max = dur;
    bounds = { a: 0, b: dur };
    paintTrim();
    $('#vname').value = t.name;
    $('#vnotes').value = t.notes || '';
    $('#vmeta').textContent = `${fmtTime(dur)} · ${fmtBytes(t.bytes)} · ${new Date(t.created).toLocaleString()}`;
    const pair = t.meta && t.meta.pair;
    $('#vpair').textContent = pair ? 'This video has a matching performance in the library: look for it in the list.' : '';
    status('');
  }

  function close() { v.pause(); v.removeAttribute('src'); v.load(); if (url) { URL.revokeObjectURL(url); url = null; } take = null; }

  /* ---- trim handles ---- */
  $('#tin').addEventListener('input', () => { bounds.a = Math.min(+$('#tin').value, bounds.b - 0.2); paintTrim(); v.currentTime = bounds.a; });
  $('#tout').addEventListener('input', () => { bounds.b = Math.max(+$('#tout').value, bounds.a + 0.2); paintTrim(); v.currentTime = bounds.b; });
  $('#setin').addEventListener('click', () => { bounds.a = Math.min(v.currentTime, bounds.b - 0.2); paintTrim(); });
  $('#setout').addEventListener('click', () => { bounds.b = Math.max(v.currentTime, bounds.a + 0.2); paintTrim(); });
  $('#previewtrim').addEventListener('click', async () => { previewing = true; v.currentTime = bounds.a; try { await v.play(); } catch (err) { /* needs a gesture: this click is one */ } });
  v.addEventListener('timeupdate', () => { if (previewing && v.currentTime >= bounds.b) { v.pause(); previewing = false; v.currentTime = bounds.a; } });
  v.addEventListener('pause', () => { if (v.currentTime < bounds.b - 0.05) previewing = false; });

  /* ---- save the kept part as a new take: play it silently and record it ---- */
  $('#savetrim').addEventListener('click', async () => {
    if (!take) return;
    const { a, b } = bounds;
    if (b - a < 0.3) return toast('Choose at least a third of a second.');
    if (typeof v.captureStream !== 'function' || !window.MediaRecorder) return toast('This browser cannot re-record a video. Use Chrome or Edge.');
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) return toast('This browser cannot record WebM.');
    status(`recording ${(b - a).toFixed(1)} s in real time…`);
    $('#savetrim').disabled = true;
    try {
      if (!audio) {                                             // one source per element, for ever: keep it, and keep it audible
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        audio = { ac, src: ac.createMediaElementSource(v), dest: ac.createMediaStreamDestination() };
        audio.src.connect(ac.destination);
      }
      audio.src.connect(audio.dest);
      audio.src.disconnect(audio.ac.destination);               // silent while it is copied
      await audio.ac.resume();
      v.pause(); v.currentTime = a; await once(v, 'seeked', 1500);
      const vs = v.captureStream(), ms = new MediaStream([...vs.getVideoTracks(), ...audio.dest.stream.getAudioTracks()]), parts = [];
      const mr = new MediaRecorder(ms, { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 160000 });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const stopped = new Promise((res) => { mr.onstop = res; });
      mr.start(500);
      await v.play();
      await new Promise((res) => { const tick = () => { if (v.currentTime >= b || v.ended || v.paused) res(); else requestAnimationFrame(tick); }; tick(); });
      v.pause();
      mr.stop();
      await stopped;
      const blob = new Blob(parts, { type: mime.split(';')[0] });
      const rec = await library.add({ kind: 'video', name: `${take.name.replace(/\.[a-z0-9]+$/i, '')} (trimmed).webm`, mime: blob.type, duration: b - a, meta: { trimmedFrom: take.id, from: a, to: b } }, blob);
      toast(`Saved a ${(b - a).toFixed(1)} s copy.`);
      await studio.refresh(rec.id);
    } catch (err) {
      toast(`Could not save the copy: ${err.message}`, 6000);
    } finally {
      if (audio) { try { audio.src.disconnect(audio.dest); audio.src.connect(audio.ac.destination); } catch (err) { /* fine */ } }
      $('#savetrim').disabled = false;
      status('');
    }
  });

  $('#frame').addEventListener('click', () => {
    if (!v.videoWidth) return toast('Nothing to grab yet.');
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((blob) => { if (blob) { download(blob, `${(take ? take.name : 'frame').replace(/\.[a-z0-9]+$/i, '')}-${v.currentTime.toFixed(1)}s.png`); toast('Frame saved.'); } }, 'image/png');
  });
  $('#vdl').addEventListener('click', async () => { if (take) download(await library.blob(take.id), take.name); });
  $('#vname').addEventListener('change', async () => { if (take) { take = await library.update(take.id, { name: $('#vname').value.trim() || take.name }); studio.refresh(take.id, { keepOpen: true }); } });
  $('#vnotes').addEventListener('change', async () => { if (take) take = await library.update(take.id, { notes: $('#vnotes').value }); });
  $('#vdelete').addEventListener('click', async () => {
    if (!take || !confirm(`Delete "${take.name}"? This cannot be undone.`)) return;
    const id = take.id;
    close();
    await library.remove(id);
    studio.refresh(null);
  });

  return { open, close, clamp };
}
