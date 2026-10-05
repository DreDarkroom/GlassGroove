/* Wipelight: performing. Wake the light, pause, hide the controls, and the Rise button: hold it and the music thins out and climbs, let go and the drop lands on the beat. */
import { $, icon } from '../util.js';
import { hint } from './dom.js';

export function buildPerform(app) {
  const { A, S, V, PB } = app;
  let src = null;                                                   // who is holding the build: 'rise', 'touch', 'key', 'pad'

  function startBuild(variant, who) {
    if (src || PB.perf) return;
    if (!A.ready || !S.playing) return hint('Press play first.');
    if (!S.buildStart(variant)) return;
    src = who;
    $('#rise').classList.add('holding');
    $('#rise .word').textContent = 'Let go';
    app.buzz && app.buzz([14]);
  }
  function endBuild(who) {
    if (src !== who) return;
    src = null;
    $('#rise').classList.remove('holding');
    $('#rise .word').textContent = 'Rise';
    S.buildRelease();
  }
  const dropBuild = () => { src = null; $('#rise').classList.remove('holding'); $('#rise .word').textContent = 'Rise'; };

  const rise = $('#rise');
  rise.addEventListener('pointerdown', (e) => { e.preventDefault(); try { rise.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended: carry on */ } startBuild(0, 'rise'); });
  const up = () => endBuild('rise');
  rise.addEventListener('pointerup', up);
  rise.addEventListener('pointercancel', up);
  rise.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('blur', () => { endBuild('rise'); endBuild('touch'); endBuild('key'); });   // never leave a build hanging when the window loses focus

  /* ---- waking the light, pausing ---- */
  const paintPause = () => {
    const b = $('#pause');
    b.replaceChildren(icon(S.playing ? 'pause' : 'play'));
    b.setAttribute('aria-label', S.playing ? 'Pause the music' : 'Play the music');
  };
  async function wake() {
    document.body.classList.add('awake');
    await A.init();
    app.startSession && app.startSession();
    S.start();
    paintPause();
    app.updateWake && app.updateWake();
    if (!app.store.get('seenHints')) { setTimeout(() => hint('Drag across the picture to wipe the fog.'), 900); setTimeout(() => hint('Hold Rise, then let go to drop.', 5000), 5600); app.store.set('seenHints', true); }
  }
  function togglePlay() {
    if (!A.ready || PB.perf) return;
    if (S.playing) { S.buildCancel(); S.journeyStop(); dropBuild(); V.setBuild(0); S.stop(); } else S.start();
    paintPause();
    app.updateWake && app.updateWake();
  }
  $('#wake').addEventListener('click', wake);
  $('#pause').addEventListener('click', togglePlay);
  $('#hide').replaceChildren(icon('eye'));
  $('#hide').addEventListener('click', () => { app.setUiHidden(true); hint('Tap the picture twice to bring the controls back.', 4500); });
  $('#gear').replaceChildren(icon('gear'));
  paintPause();

  app.setUiHidden = (on) => { document.body.classList.toggle('ui-hidden', on); if (on) app.closeSheet && app.closeSheet(); };
  Object.assign(app, { startBuild, endBuild, dropBuild, togglePlay, wake, paintPause });
}
