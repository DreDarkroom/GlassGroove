/* Glass Groove: recording and export.
   Ways to keep a set:
     perf     the compact, replayable performance (.sqz): what the instrument DID, not the sound; the Studio edits it
     webm     the picture and the sound together as a lean WebM (VP9 + Opus, about 3 Mbps): the everyday video
     visuals  the picture only, no sound (to lay over a WAV in an editor)
     both     a lean WebM and a performance together (two takes that belong to each other)
     mp4      the same as MP4, where the browser can make one
     screen   the whole page with its controls, captured as this tab (asks the browser's own permission)
     wav      24-bit lossless, streamed to disk where the browser allows it, so a long set never fills memory
     mp3      320 kbps, encoded live in a background worker (LAME via lamejs, loaded only when chosen)
   perf, webm, visuals, both, mp4 and screen go to the Takes library by default (or to a file, if you prefer); wav and mp3 are always files.
   Everything records the FINAL output (after the limiter), exactly what the room hears. */
import { CONFIG } from '../config.js';
import { download, stamp } from '../util.js';
import { encode } from '../perf/format.js';
import { library } from './library.js';
import * as wav from './wav.js';

export const FORMATS = {
  perf: { label: 'Performance', hint: 'a tiny replayable take (a few KB a minute): the Studio can edit it', studio: true },
  webm: { label: 'Video · lean WebM', hint: 'picture and sound, small: about 20 to 25 MB a minute', studio: true },
  both: { label: 'Video + performance', hint: 'a lean WebM and a replayable performance together (two takes)', studio: true },
  visuals: { label: 'Visuals only', hint: 'the picture with no sound, to lay over a WAV in an editor', studio: true },
  mp4: { label: 'Video · MP4', hint: 'picture and sound as MP4, for players that do not take WebM (bigger)', studio: true },
  screen: { label: 'Screen · with controls', hint: 'records this whole tab, panel and all; the browser asks you to allow it', studio: true },
  wav: { label: 'WAV · lossless', hint: '24-bit, about 16 MB a minute' },
  mp3: { label: 'MP3 · 320 kbps', hint: 'about 2.4 MB a minute' },
};

/* how each video format is made: the source of the picture, whether it has sound, the container, a performance alongside */
const VIDEO = {
  webm: { src: 'canvas', audio: true, box: 'webm' }, visuals: { src: 'canvas', audio: false, box: 'webm' }, both: { src: 'canvas', audio: true, box: 'webm', perf: true },
  mp4: { src: 'canvas', audio: true, box: 'mp4' }, screen: { src: 'screen', audio: true, box: 'webm' },
};
const TYPES = {
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'],
};
const pickType = (box, audio) => {
  if (!window.MediaRecorder) return null;
  const list = audio ? TYPES[box] : TYPES[box].map((t) => t.replace(',opus', '').replace(',mp4a.40.2', ''));
  return list.find((t) => MediaRecorder.isTypeSupported(t)) || null;
};

/* The capture processor may only be registered once per audio context, so every recording shares one load. */
const WORKLET = `class Cap extends AudioWorkletProcessor{constructor(){super();this.N=4096;this.l=new Float32Array(this.N);this.r=new Float32Array(this.N);this.n=0;
this.port.onmessage=e=>{if(e.data==='flush'){this.port.postMessage({l:this.l.slice(0,this.n),r:this.r.slice(0,this.n),end:true});this.n=0}}}
process(inp){const i=inp[0];if(i&&i[0]){const L=i[0],Rr=i[1]||i[0];for(let k=0;k<L.length;k++){this.l[this.n]=L[k];this.r[this.n]=Rr[k];
if(++this.n===this.N){this.port.postMessage({l:this.l,r:this.r},[this.l.buffer,this.r.buffer]);this.l=new Float32Array(this.N);this.r=new Float32Array(this.N);this.n=0}}}return true}}
registerProcessor('dd-capture',Cap)`;
let workletLoad = null;
function loadWorklet(ctx) {
  if (workletLoad && workletLoad.ctx === ctx) return workletLoad.promise;
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  const promise = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  promise.catch(() => { if (workletLoad && workletLoad.promise === promise) workletLoad = null; });   // allow a retry after a failure
  workletLoad = { ctx, promise };
  return promise;
}

function mp3Worker(sampleRate) {
  const lib = new URL('vendor/lame.min.js?v=' + encodeURIComponent(CONFIG.version), document.baseURI).href;
  const src = `importScripts(${JSON.stringify(lib)});
let enc=null;
const i16=(a)=>{const o=new Int16Array(a.length);for(let i=0;i<a.length;i++){const v=a[i]>1?1:a[i]<-1?-1:a[i];o[i]=v<0?v*32768:v*32767}return o};
onmessage=(e)=>{const d=e.data;
 if(d.init){enc=new lamejs.Mp3Encoder(2,d.sr,d.kbps);postMessage({ready:true});return}
 if(d.l){const out=enc.encodeBuffer(i16(d.l),i16(d.r));if(out.length){const u=new Uint8Array(out);postMessage({mp3:u},[u.buffer])}}
 if(d.end){const out=enc.flush();const u=new Uint8Array(out);postMessage({mp3:u,end:true},[u.buffer])}
};`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), w = new Worker(url);
  URL.revokeObjectURL(url);                                    // the worker has its code now
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('the MP3 encoder did not start')), 6000);
    w.onerror = () => { clearTimeout(t); reject(new Error('the MP3 encoder could not load (it needs the hosted page or localhost; WAV works everywhere)')); };
    w.onmessage = (e) => { if (e.data.ready) { clearTimeout(t); resolve(w); } };
    w.postMessage({ init: true, sr: sampleRate, kbps: 320 });
  });
}

/** deps: { audio, perf (a performance recorder from format.js), snapshot () -> the loop as JSON, canvas } */
export function createRecording({ audio: A, perf, snapshot, canvas }) {
  const R = { state: { active: false }, onUpdate: null, onAuto: null, FORMATS, videoBitrate: 3000000, memoryLimit: 1.5 * 1024 * 1024 * 1024, toStudio: true };
  let job = null, ticker = null;
  const notify = () => { if (R.onUpdate) R.onUpdate(R.state); };

  R.support = () => {
    const capture = typeof HTMLCanvasElement.prototype.captureStream === 'function', web = capture && !!pickType('webm', true);
    return {
      disk: typeof window.showSaveFilePicker === 'function', mp3: typeof Worker !== 'undefined', perf: true, webm: web, visuals: capture && !!pickType('webm', false), both: web, wav: true,
      mp4: capture && !!pickType('mp4', true), screen: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !!pickType('webm', true),
    };
  };

  /* ---------------- where the bytes go ---------------- */
  /** To the Takes library: collected in memory, saved when the take ends. */
  function studioSink(kind, name, mime, meta = {}) {
    const parts = [], t0 = performance.now();
    return {
      kind: 'studio', name,
      write: (b) => { parts.push(b); },
      close: async (extra = {}) => library.add({ kind, name, mime, duration: (performance.now() - t0) / 1000, meta: { ...meta, ...extra } }, new Blob(parts, { type: mime })),
      abort: async () => { parts.length = 0; },
    };
  }

  /** Streams to a file the person picked (Chrome / Edge), or collects in memory and downloads at the end. */
  async function fileSink(name, mime, ext, label) {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: label, accept: { [mime]: ['.' + ext] } }] }), w = await handle.createWritable();
        return {
          kind: 'disk', name: handle.name, write: (b) => w.write(b),
          close: async (header) => { if (header) await w.write({ type: 'write', position: 0, data: header }); await w.close(); },
          abort: async () => { try { await w.abort(); } catch (e) { /* already closed */ } },
        };
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;       // the person cancelled the save dialog: stop quietly
      }
    }
    const parts = [];
    return { kind: 'memory', name, write: (b) => { parts.push(b); }, close: async (header) => { if (header) parts[0] = header; download(new Blob(parts, { type: mime }), name); }, abort: async () => { parts.length = 0; } };
  }

  async function makeCapture(onChunk) {
    const ctx = A.ctx(), src = A.tapSource(), mute = ctx.createGain();
    mute.gain.value = 0;                                       // keeps the node in the graph without adding any sound
    let node = null, ended = null;
    if (ctx.audioWorklet && ctx.audioWorklet.addModule) {
      try {
        await loadWorklet(ctx);
        node = new AudioWorkletNode(ctx, 'dd-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2] });
        node.port.onmessage = (e) => { onChunk(e.data.l, e.data.r); if (e.data.end && ended) ended(); };
      } catch (err) { node = null; }                           // no worklet support: use the older, universal route
    }
    if (!node) {
      node = ctx.createScriptProcessor(4096, 2, 2);
      node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1)));
    }
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    return {
      async stop() {
        if (node.port) await new Promise((res) => { ended = res; node.port.postMessage('flush'); setTimeout(res, 500); });   // collect the last partial block
        try { src.disconnect(node); node.disconnect(); mute.disconnect(); } catch (err) { /* already gone */ }
        if (node.port) node.port.onmessage = null; else node.onaudioprocess = null;
      },
    };
  }

  /* ---------------- start / stop ---------------- */
  R.start = async (format) => {
    if (R.state.active) return;
    if (!A.ready) throw new Error('turn on the safelight first');
    const f = FORMATS[format];
    if (!f) throw new Error('unknown format');
    const sup = R.support(), sr = A.ctx().sampleRate, studio = R.toStudio && f.studio, base = `${CONFIG.slug}-${stamp()}`;
    let sink, psink = null, capture, worker, mr, extra = null, chain = Promise.resolve(), bytes = 0, vt;
    const enqueue = (u8) => {
      bytes += u8.length; R.state.bytes = bytes;
      chain = chain.then(() => sink.write(u8));
      if (sink.kind === 'memory' && bytes > R.memoryLimit && R.state.active) R.stop('this browser is holding the recording in memory, so it was saved at 1.5 GB to protect your set. Chrome or Edge can stream long recordings straight to disk').catch(() => {});
      return chain;
    };
    const perfSink = () => (studio ? studioSink('performance', `${base}.sqz`, 'application/octet-stream', { format }) : fileSink(`${base}.sqz`, 'application/octet-stream', 'sqz', 'Glass Groove performance'));
    const startPerf = () => { perf.start(A.now(), snapshot()); A.hook = (...a) => perf.log(...a); };

    try {
      if (format === 'wav') {
        sink = await fileSink(`${base}.wav`, 'audio/wav', 'wav', 'WAV audio');
        await sink.write(wav.header(sr, 2, 24, 0));
        capture = await makeCapture((l, r) => { if (bytes > wav.MAX_DATA_BYTES - 1e6) { R.stop('the file reached the 4 GB limit of the WAV format'); return; } enqueue(wav.pcm24(l, r)); });
      } else if (format === 'mp3') {
        if (!sup.mp3) throw new Error('this browser cannot encode MP3 in the background; use WAV');
        worker = await mp3Worker(sr);
        sink = await fileSink(`${base}.mp3`, 'audio/mpeg', 'mp3', 'MP3 audio');
        let finished;
        const done = new Promise((res) => { finished = res; });
        worker.onmessage = (e) => { if (e.data.mp3 && e.data.mp3.length) enqueue(e.data.mp3); if (e.data.end) finished(); };
        capture = await makeCapture((l, r) => worker.postMessage({ l, r }, [l.buffer, r.buffer]));
        job = { done, worker };
      } else if (format === 'perf') {
        sink = await perfSink();
        startPerf();
      } else if (VIDEO[format]) {
        const cfg = VIDEO[format];
        if (!sup[format]) throw new Error('this browser cannot record that kind of video; try WAV or Performance');
        vt = pickType(cfg.box, cfg.audio);
        let picture;
        if (cfg.src === 'screen') {                            // the whole tab, panel and all. The browser shows its own "share this tab" prompt; nothing is sent anywhere.
          const disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
          picture = disp.getVideoTracks(); extra = disp;
          picture[0].addEventListener('ended', () => { if (R.state.active) R.stop('screen sharing was ended').catch(() => {}); });
        } else picture = canvas.captureStream(30).getVideoTracks();
        const mime = vt.split(';')[0];
        sink = studio ? studioSink('video', `${base}.${cfg.box}`, mime, { format }) : await fileSink(`${base}.${cfg.box}`, mime, cfg.box, 'Video');
        if (cfg.perf) { psink = await perfSink(); startPerf(); }
        const ms = new MediaStream([...picture, ...(cfg.audio ? A.stream().getAudioTracks() : [])]), opts = { mimeType: vt, videoBitsPerSecond: R.videoBitrate };
        if (cfg.audio) opts.audioBitsPerSecond = 160000;
        mr = new MediaRecorder(ms, opts);
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chain = chain.then(async () => { const u8 = new Uint8Array(await e.data.arrayBuffer()); bytes += u8.length; R.state.bytes = bytes; await sink.write(u8); }); };
        mr.start(1000);
      }
    } catch (err) {
      if (sink) await sink.abort();
      if (psink) await psink.abort();
      if (extra) extra.getTracks().forEach((t) => t.stop());
      if (worker) worker.terminate();
      A.hook = null;
      if (err && err.name === 'AbortError') return;            // cancelled the save dialog
      throw err;
    }
    R.state = { active: true, format, label: f.label, startedAt: performance.now(), bytes: 0, name: sink.name, where: sink.kind };
    job = Object.assign(job || {}, { sink, psink, extra, capture, mr, format, chain: () => chain, bytesNow: () => bytes });
    clearInterval(ticker);
    ticker = setInterval(notify, 500);
    notify();
  };

  /** Finish and save. Resolves to {name, bytes, seconds, where, ids}. `reason` is shown if it was an automatic stop. */
  R.stop = async (reason) => {
    if (!R.state.active || !job) return null;
    const j = job, st = R.state, ids = [];
    job = null;
    clearInterval(ticker);
    R.state = { active: false };
    let header = null, perfBytes = 0;
    try {
      if (j.format === 'wav' || j.format === 'mp3') await j.capture.stop();
      if (j.format === 'mp3') { j.worker.postMessage({ end: true }); await j.done; j.worker.terminate(); }
      if (j.mr) await new Promise((res) => { j.mr.onstop = res; j.mr.stop(); });
      if (j.extra) j.extra.getTracks().forEach((t) => t.stop());
      await j.chain();
      if (j.format === 'wav') header = wav.header(A.ctx().sampleRate, 2, 24, j.bytesNow());   // bytesNow() counts audio data only, not the 44-byte header
      const finishPerf = async (sink, meta) => {
        A.hook = null;
        const doc = perf.stop(A.now()), enc = await encode(doc);
        await sink.write(enc.bytes);
        perfBytes = enc.bytes.length;
        return sink.kind === 'studio' ? sink.close({ ...meta, events: doc.events.length, perfDuration: doc.duration }) : sink.close();
      };
      let main;
      if (j.format === 'perf') main = await finishPerf(j.sink, {});
      else main = await j.sink.close(header);
      if (main && main.id) ids.push(main.id);
      if (j.psink) {                                           // the performance that goes with the video
        const p = await finishPerf(j.psink, { pair: main && main.id });
        if (p && p.id) { ids.push(p.id); if (main && main.id) await library.update(main.id, { meta: { ...main.meta, pair: p.id } }); }
      }
    } catch (err) {
      await j.sink.abort();
      if (j.psink) await j.psink.abort();
      A.hook = null;
      notify();
      throw err;
    }
    const result = { name: j.sink.name + (j.psink ? ' + ' + j.psink.name : ''), bytes: (j.format === 'perf' ? perfBytes : j.bytesNow()) + (j.psink ? perfBytes : 0), seconds: (performance.now() - st.startedAt) / 1000, where: j.sink.kind, ids, reason: reason || null };
    if (reason && R.onAuto) R.onAuto(result);
    notify();
    return result;
  };

  /** A PNG of exactly what is on screen (without the panel). */
  R.snap = () => new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('could not read the picture'));
      const name = `${CONFIG.slug}-${stamp()}.png`;
      download(b, name);
      resolve(name);
    }, 'image/png');
  });

  R.elapsed = () => (R.state.active ? (performance.now() - R.state.startedAt) / 1000 : 0);
  return R;
}
