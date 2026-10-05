/* Wipelight: developer mode. Switch it on in the settings (or Shift + D, or ?dev=1).
   Live numbers (frame time by section, audio nodes and sounds a second, how far ahead of the audio clock the scheduler is, memory), switches that turn one
   costly part off at a time so you can see what it costs, a benchmark that measures the picture and the sound with the browser's own clocks, and a log.
   It is how the speed-ups in this version were found and checked. It costs nothing while it is off. */
import { $, el, round } from '../util.js';
import { createAudio } from '../engine/audio.js';
import { createSeq } from '../engine/seq.js';
import { STYLES } from '../engine/styles.js';
import { toast } from '../ui/dom.js';

const SWITCHES = [
  ['V', 'grain', 'Film grain'], ['V', 'feedback', 'Feedback tunnel'], ['V', 'kaleido', 'Kaleidoscope + scene'], ['V', 'ripples', 'Press ripples'], ['V', 'drips', 'Drips'],
  ['A', 'metal', 'Metal hats (baked)'],
];

/** The sound benchmark: render N bars of a style through a fresh engine into an OfflineAudioContext, and time it. Same notes every run. */
export async function benchAudio({ styleIndex = 0, bars = 8, runs = 3, engine = {} } = {}) {
  const times = [];
  let nodes = 0, hits = 0, seconds = 0;
  for (let r = 0; r < runs; r++) {
    const A = createAudio(engine), S = createSeq(A, { emit: () => {} }), sr = 48000, stepDur = (tempo) => 60 / tempo / 4;
    const tempo = STYLES[styleIndex].tempo, secs = bars * 16 * stepDur(tempo) + 1.2;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    A.attach(ctx);
    S.applyStyle(styleIndex, { now: true });
    for (let tk = 0; tk < bars * 16; tk++) S.tickOnce(tk, 0.05 + tk * stepDur(tempo));
    const t0 = performance.now();
    await ctx.startRendering();
    times.push(performance.now() - t0);
    nodes = A.stats.nodes; hits = A.stats.hits; seconds = secs;
  }
  times.sort((a, b) => a - b);
  const ms = times[Math.floor(times.length / 2)];
  return { style: styleIndex, bars, ms: round(ms, 1), realtimeX: round((seconds * 1000) / ms, 1), nodes, hits };
}

export function buildDev(app) {
  const { A, S, V, R } = app;
  const box = $('#devpanel'), log = [];
  let timer = 0, on = false, lastNodes = 0, lastHits = 0, minMargin = 9, lastT = performance.now();

  const say = (msg) => { log.push(`${(performance.now() / 1000).toFixed(1)}s  ${msg}`); if (log.length > 60) log.shift(); };
  addEventListener('error', (e) => say(`ERROR ${e.message}`));
  addEventListener('unhandledrejection', (e) => say(`REJECTED ${e.reason && e.reason.message ? e.reason.message : e.reason}`));
  app.devSay = say;

  function build() {
    box.replaceChildren();
    box.classList.add('card');
    const close = el('button', 'xbtn', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close developer mode');
    close.addEventListener('click', () => toggle(false));
    box.append(close, el('h3', null, 'Developer mode'));
    const live = el('pre', 'devlive');
    live.id = 'devlive';
    box.append(live);

    const sw = el('div', 'devsw');
    for (const [who, key, label] of SWITCHES) {
      const l = el('label'), c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = (who === 'V' ? V.dev : A.dev)[key];
      c.addEventListener('change', () => { (who === 'V' ? V.dev : A.dev)[key] = c.checked; say(`${label}: ${c.checked ? 'on' : 'off'}`); });
      l.append(c, el('span', null, label));
      sw.append(l);
    }
    const room = el('label'), rc = document.createElement('input'), ov = el('label'), oc = document.createElement('input');
    rc.type = oc.type = 'checkbox'; rc.checked = !app.isEco(); oc.checked = A.oversample === '4x';
    rc.addEventListener('change', () => { A.setRoom(rc.checked); say(`Reverb room: ${rc.checked ? 'on' : 'off'}`); });
    oc.addEventListener('change', () => { A.setOversample(oc.checked ? '4x' : '2x'); say(`Output oversampling: ${oc.checked ? '4x' : '2x'}`); });
    room.append(rc, el('span', null, 'Reverb room')); ov.append(oc, el('span', null, 'Output oversampling 4x'));
    sw.append(room, ov);
    box.append(el('p', null, 'Switch one thing off and watch the numbers.'), sw);

    const row = el('div', 'row'), bench = el('button', null, 'run benchmark'), copy = el('button', null, 'copy report');
    bench.type = copy.type = 'button';
    row.append(bench, copy);
    const out = el('pre', 'devlive');
    out.id = 'devbench';
    out.textContent = 'The benchmark runs identical frames and identical notes, and takes about 20 seconds. Use a quiet moment.';
    box.append(row, out);
    let report = null;
    bench.addEventListener('click', async () => {
      bench.disabled = true;
      out.textContent = 'Running…';
      try { report = await runBench(out); } catch (err) { out.textContent = `Benchmark problem: ${err.message}`; }
      bench.disabled = false;
    });
    copy.addEventListener('click', async () => {
      const text = JSON.stringify({ when: new Date().toISOString(), ua: navigator.userAgent, bench: report, stats: V.stats, audio: A.info() }, null, 2);
      try { await navigator.clipboard.writeText(text); toast('Report copied.'); } catch (err) { toast('The browser would not let me use the clipboard.'); }
    });
    const lg = el('pre', 'devlive');
    lg.id = 'devlog';
    box.append(el('h3', null, 'Log'), lg);
  }

  async function runBench(out) {
    const wasStyle = S.style, res = { visual: {}, audio: {} };
    const lines = [];
    const show = () => { out.textContent = lines.join('\n'); };
    lines.push('picture (ms per frame, with the canvas flushed each frame):'); show();
    for (const [i, name] of ['tentacles', 'dots', 'film', 'spokes', 'ink'].entries()) {
      await new Promise((r) => setTimeout(r, 30));
      V.bench(6, i, 8);                                       // warm up
      const runs = [V.bench(30, i, 8), V.bench(30, i, 8), V.bench(30, i, 8)].map((x) => x.ms).sort((a, b) => a - b);
      res.visual[name] = runs[1];
      lines.push(`  ${name.padEnd(10)} ${runs[1].toFixed(2)}`); show();
    }
    lines.push('sound (ms to render 8 bars offline; lower is cheaper):'); show();
    for (const i of [0, 2, 4]) {
      const r = await benchAudio({ styleIndex: i });
      res.audio[S.styles[i].name] = r;
      lines.push(`  ${S.styles[i].name.padEnd(12)} ${String(r.ms).padStart(7)} ms · ${r.realtimeX}x real time · ${r.nodes} nodes`); show();
    }
    S.applyStyle(wasStyle, { now: true });
    return res;
  }

  function tick() {
    const now = performance.now(), dt = (now - lastT) / 1000;
    lastT = now;
    const s = V.stats, i = A.info(), nodes = A.stats.nodes, hits = A.stats.hits, m = S.playing ? S.margin() : null;
    if (m != null && m < minMargin) minMargin = m;
    const mem = performance.memory ? ` · heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : '';
    $('#devlive').textContent =
      `${s.fps} fps · frame ${s.frameMs.toFixed(1)} ms · ${s.level} (${s.mode})${s.eco ? ' · eco' : ''}\n` +
      `sim ${s.sections.sim} · compose ${s.sections.compose} · finish ${s.sections.finish} · ripples ${s.ripples} · errors ${s.errors}\n` +
      (i ? `audio ${i.state} ${i.sampleRate} Hz · latency ${(i.baseLatency * 1000).toFixed(0)}/${(i.outputLatency * 1000).toFixed(0)} ms\n` : 'audio not started\n') +
      `nodes ${Math.round((nodes - lastNodes) / Math.max(0.2, dt))}/s · sounds ${Math.round((hits - lastHits) / Math.max(0.2, dt))}/s · scheduler ahead ${m == null ? '-' : (minMargin * 1000).toFixed(0) + ' ms'}${mem}\n` +
      (R.state.active ? `recording ${R.state.label}` : '');
    lastNodes = nodes; lastHits = hits; minMargin = 9;
    $('#devlog').textContent = log.slice(-14).join('\n');
  }

  function toggle(force, persist = true) {
    on = force != null ? force : !on;
    box.hidden = !on;
    document.body.classList.toggle('dev', on);
    if (persist) app.store.set('dev', on);
    clearInterval(timer);
    if (on) { build(); lastT = performance.now(); lastNodes = A.stats.nodes; lastHits = A.stats.hits; timer = setInterval(tick, 500); tick(); say('developer mode on'); }
  }

  app.dev = { toggle, get on() { return on; }, say };
  if (app.qs.get('dev') === '1') toggle(true, false);                       // ?dev=1 is for this visit only
  else if (app.store.get('dev', false)) toggle(true, false);
}
