/* Wipelight: the page. Makes the engines, builds the interface, and joins them. */
import { $, store } from './util.js';
import { createAudio } from './engine/audio.js';
import { createSeq } from './engine/seq.js';
import { makeClock } from './engine/clock.js';
import { LIGHTS } from './engine/styles.js';
import { loadLoop, applySnapshot, snapshot } from './engine/loopfile.js';
import { createRecorder } from './perf/format.js';
import { createPlayback } from './perf/playback.js';
import { createVisual } from './visual/engine.js';
import { createRecording } from './rec/recorder.js';
import { beatFromHash, decodeBeat } from './share.js';
import { toast } from './ui/dom.js';
import { buildSheets } from './ui/sheets.js';
import { buildPerform } from './ui/perform.js';
import { buildSurface } from './ui/surface.js';
import { buildPlay } from './ui/play.js';
import { buildBeat } from './ui/beat.js';
import { buildSound } from './ui/sound.js';
import { buildLook } from './ui/look.js';
import { buildKeep } from './ui/keep.js';
import { buildSettings } from './ui/settings.js';
import { buildExtras, isTouchDevice } from './ui/extras.js';
import { buildDev } from './dev/devtools.js';

export function start() {
  const qs = new URLSearchParams(location.search);
  const A = createAudio(), S = createSeq(A), V = createVisual({ audio: A }), P = createRecorder();
  A.profile = qs.get('profile') || (isTouchDevice() ? 'mobile' : 'desktop');          // decided before any audio exists
  const R = createRecording({ audio: A, perf: P, snapshot: () => snapshot(S, A), canvas: $('#stage') });
  const PB = createPlayback({ audio: A, visual: V, makeClock, onLight: (i) => document.documentElement.style.setProperty('--tint-rgb', LIGHTS[i].tint.join(',')) });
  const app = { A, S, V, P, R, PB, qs, store };
  V.log = (code, ...args) => { if (P.active) P.log(A.now(), code, ...args); };
  V.styleScene = () => S.scene;
  V.init($('#stage'));

  buildExtras(app);                                                                   // first: the other tabs read the bloom, battery and haptics it sets up
  buildSheets(app); buildPerform(app); buildSurface(app); buildPlay(app); buildBeat(app); buildSound(app); buildLook(app); buildKeep(app);
  buildSettings(app); buildDev(app);
  app.isEco = app.isEco || (() => false);

  /* after a new beat, a vibe or a file: bring every control in line with the model */
  app.refreshAll = () => { app.syncSound(); app.refreshBeat(); app.setLight(S.light); };

  /* a beat in the address (someone shared a link), else the beat saved on this device */
  const code = beatFromHash(location.hash);
  if (code) {
    decodeBeat(code).then((doc) => { if (applySnapshot(S, A, doc)) { app.refreshAll(); toast('Beat from a link, loaded. Wake the light to hear it.', 5000); } else throw new Error('that beat could not be used'); })
      .catch((err) => toast(err.message, 5000));
  } else if (loadLoop(S, A)) app.refreshAll();
  app.setLight(S.light);

  addEventListener('beforeunload', (e) => { if (R.state.active) { e.preventDefault(); e.returnValue = ''; } });
  if (qs.get('autostart') === '1') app.wake().catch(() => { /* the browser wants a tap first: the start screen stays */ });
  window.__wl = app;                                                                  // a handle for the console, the tests and the benchmark
  return app;
}
