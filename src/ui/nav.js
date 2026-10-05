/* Glass Groove: getting in and out safely, and keeping the music going when you are not looking at it.

   - The Back button walks back through what is open (a sheet, settings, a surge, hidden controls). With nothing open, the first Back press pauses the music,
     saves the beat and asks before leaving; "Stay" carries on where it was.
   - Leaving by other doors (Home, another app, the lock button) never stops the music: the scheduler runs in a worker, and a silent media element plus the Media Session
     make Android treat it as a player, with lock-screen and notification controls (play / pause / next vibe / previous vibe).
   - "Float": a little picture-in-picture window with the beat, speed and vibe, drawn by a worker-timed canvas (so it keeps moving while the page is hidden).
   - The audio engine is watched: if the phone interrupts it (a call, a notification sound), it is resumed, and the next touch resumes it for sure. */
import { $, h } from '../util.js';
import { CONFIG } from '../config.js';
import { timed } from '../events.js';
import { makeClock } from '../engine/clock.js';
import { saveLoop } from '../engine/loopfile.js';
import { toast, modal } from './dom.js';

export function buildNav(app) {
  const { A, S, R, PB } = app;
  const nav = {};

  /* ================= the Back button ================= */
  const stack = [];                                            // open layers, innermost last: { name, close, d }
  let skip = 0, asking = false, leaving = false;
  const depth = () => (history.state && history.state.d) || 0;
  try { history.replaceState({ gg: 'root', d: 0 }, ''); history.pushState({ gg: 'app', d: 1 }, ''); } catch (err) { /* no history API (a sandboxed frame): Back simply leaves */ }

  /** Register something that is now open; Back will close it (by calling `close`). */
  nav.push = (name, close) => {
    if (stack.some((l) => l.name === name)) return;
    let hist = true;
    try { history.pushState({ gg: 'app', d: depth() + 1 }, ''); } catch (err) { hist = false; }    // if the browser refuses, the layer works but Back will not close it
    stack.push({ name, close, d: hist ? depth() : Infinity, hist });
  };
  /** It was closed some other way (a button): take it off the stack and its history step with it, if it was the innermost. */
  nav.release = (name) => {
    const i = stack.findIndex((l) => l.name === name);
    if (i < 0) return;
    const [l] = stack.splice(i, 1);
    if (l.hist && i === stack.length && depth() === l.d) { skip++; try { history.back(); } catch (err) { skip--; } }
  };
  nav.open = (name) => stack.some((l) => l.name === name);

  addEventListener('popstate', () => {
    if (skip > 0) { skip--; return; }
    const s = history.state || {};
    if (s.gg === 'root') return askLeave();
    const d = s.d || 1;
    while (stack.length && stack[stack.length - 1].hist && stack[stack.length - 1].d > d) stack.pop().close();
  });

  function askLeave() {
    if (leaving || asking) return;
    if (!A.ready && !R.state.active) { leaving = true; history.back(); return; }          // nothing has happened yet: just go
    asking = true;
    const wasPlaying = S.playing;
    if (wasPlaying) app.togglePlay();                                                        // paused, not stopped: the beat, the sound and the picture stay as they are
    saveLoop(S, A);
    const stay = h('button', { type: 'button', class: 'btn primary', onclick: () => done(true) }, wasPlaying ? 'Stay and play' : 'Stay');
    const go = h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, 'Leave');
    const box = h('section', { id: 'leave', class: 'modal', role: 'alertdialog', 'aria-label': `Leave ${CONFIG.name}?` },
      h('h2', null, `Leave ${CONFIG.name}?`),
      h('p', { class: 'fine', text: `The music is paused and your beat is saved on this phone.${R.state.active ? ' A recording is still running and will be lost if you leave.' : ''}` }),
      h('div', { class: 'row', style: 'gap:10px;margin-top:12px' }, stay, go));
    document.body.append(box);
    const releaseModal = modal(box);
    stay.focus();
    function done(keep) {
      box.remove(); asking = false; releaseModal();
      if (keep) { try { history.pushState({ gg: 'app', d: 1 }, ''); } catch (err) { /* see above */ } if (wasPlaying) app.togglePlay(); }
      else { leaving = true; history.back(); setTimeout(() => { try { window.close(); } catch (err) { /* a tab we did not open stays open */ } }, 250); }
    }
  }
  addEventListener('beforeunload', (e) => { if (!leaving && (R.state.active || S.playing)) { e.preventDefault(); e.returnValue = ''; } });

  /* ================= the audio engine: keep it alive ================= */
  const healthy = () => !A.ready || A.info().state === 'running';
  const revive = () => { if (A.ready && !healthy()) A.resume().catch(() => { /* needs a touch: the next one does it */ }); };
  A.onState = (st) => { if (st !== 'running' && S.playing) { revive(); setTimeout(() => { if (S.playing && !healthy() && document.visibilityState === 'visible') toast('The sound was interrupted. Touch the screen to carry on.', 6000); }, 800); } };
  setInterval(() => { if (S.playing) revive(); }, 2000);
  document.addEventListener('pointerdown', revive, true);
  document.addEventListener('keydown', revive, true);

  /* ================= leaving without stopping ================= */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (A.ready) saveLoop(S, A); }
    else { timed.drain(A.now() - 0.6, () => { /* the picture was not drawing: forget the old lights instead of firing them all at once */ }); revive(); }
  });
  addEventListener('pagehide', () => { if (A.ready) saveLoop(S, A); });

  /* a silent looping sound, ten seconds long (Chrome ignores media shorter than about five seconds when deciding whether to show a notification): it makes the phone treat this page as a music player (a notification, lock-screen buttons, kinder to the page when it is in the background) */
  const silence = (() => {
    const rate = 8000, n = rate * 10, buf = new Uint8Array(44 + n), v = new DataView(buf.buffer), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    buf.fill(128, 44);
    return new Blob([buf], { type: 'audio/wav' });
  })();
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (err) { /* Safari 16.4+: say this page is a music player, so the silent switch and the lock screen treat it like one */ }
  const keep = new Audio(URL.createObjectURL(silence));
  keep.loop = true; keep.setAttribute('playsinline', ''); keep.volume = 0.01;

  const ms = navigator.mediaSession;
  const meta = () => {
    if (!ms || typeof MediaMetadata !== 'function') return;
    ms.metadata = new MediaMetadata({ title: CONFIG.name, artist: S.styles[S.style] ? S.styles[S.style].name : '', album: `${Math.round(A.params.tempo)} beats a minute`,
      artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  };
  const state = () => {
    if (!ms) return;
    ms.playbackState = S.playing ? 'playing' : 'paused';
    meta();
  };
  if (ms) {
    const act = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (err) { /* this browser has no such button */ } };
    act('play', () => { if (!S.playing) app.togglePlay(); });
    act('pause', () => { if (S.playing) app.togglePlay(); });
    act('stop', () => { if (S.playing) app.togglePlay(); });
    act('nexttrack', () => app.setStyle(S.style + 1));
    act('previoustrack', () => app.setStyle(S.style - 1));
    act('enterpictureinpicture', () => float(true));
  }
  app.onPlayState = () => { state(); if (S.playing) keep.play().catch(() => {}); else keep.pause(); floatSync(); };     // perform.js calls this whenever play or pause changes
  nav.state = state;

  /* ================= Float: a small picture-in-picture player ================= */
  const supportsPip = !!(document.pictureInPictureEnabled && HTMLVideoElement.prototype.requestPictureInPicture);
  let video = null, canvas = null, g = null, fclock = null, last = 0;
  const hue = () => `rgb(${document.documentElement.style.getPropertyValue('--tint-rgb') || '150,112,255'})`;
  function paintMini() {
    const now = performance.now();
    if (now - last < 90 || !g) return;
    last = now;
    const lv = A.ready ? A.level() : { bass: 0, mid: 0, high: 0 }, W = canvas.width, H = canvas.height, c = hue();
    g.fillStyle = '#070b18'; g.fillRect(0, 0, W, H);
    const r = 36 + lv.bass * 90 + lv.mid * 30, grad = g.createRadialGradient(W / 2, H / 2 - 8, 4, W / 2, H / 2 - 8, r * 1.8);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.25, c); grad.addColorStop(1, 'rgba(7,11,24,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#eaf1ff'; g.textAlign = 'center';
    g.font = '700 22px system-ui, sans-serif'; g.fillText(CONFIG.name, W / 2, 32);
    g.font = '600 18px system-ui, sans-serif';
    const sg = app.surge && app.surge.status();
    g.fillText(sg ? `Drop in ${sg.bars} bar${sg.bars === 1 ? '' : 's'}` : `${S.styles[S.style].name} · ${Math.round(A.params.tempo)}`, W / 2, H - 22);
    if (sg) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(24, H - 12, W - 48, 4); g.fillStyle = '#fff'; g.fillRect(24, H - 12, (W - 48) * sg.p, 4); }
  }
  function floatSync() {
    if (!video) return;
    if (S.playing) { fclock.start(); video.play().catch(() => {}); } else { fclock.stop(); video.pause(); }
  }
  async function float(on) {
    if (!supportsPip) { toast('This browser has no floating player. The notification and lock-screen controls still work.', 5000); return false; }
    try {
      if (!on) { if (document.pictureInPictureElement) await document.exitPictureInPicture(); return true; }
      if (!video) {
        canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; g = canvas.getContext('2d');
        video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = canvas.captureStream(12);
        fclock = makeClock(paintMini);
      }
      paintMini(); fclock.start();
      await video.play();
      await video.requestPictureInPicture();
      return true;
    } catch (err) { toast('Could not float the player here. Try again from a tap.', 4000); return false; }
  }
  nav.float = { supported: supportsPip, toggle: () => float(!document.pictureInPictureElement), active: () => !!document.pictureInPictureElement };

  Object.assign(app, { nav });
  state();
}
