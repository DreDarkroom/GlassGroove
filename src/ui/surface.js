/* Wipelight: the picture is the instrument. One set of gestures for finger, pen and mouse.
   one finger  wipe the fog (it smears, squeaks, drips and opens the filter)    two fingers held  rise, let go to drop    three  rise under water
   double-tap  hide or show the controls    pen  pressure sets the blade, the barrel button rises, a resting palm is ignored
   mouse       drag to wipe, hold the right button to rise (the middle button: under water) */
import { $, clamp, round } from '../util.js';

export function buildSurface(app) {
  const { A, V, PB, P } = app, stage = $('#stage'), fingers = new Set();
  let strokeId = null, prev = null, quiet = 0, penAt = -1e9, moved = 0, downAt = 0, lastTap = { t: -1e9, x: 0, y: 0 }, buildTimer = 0;

  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, select, textarea')) e.preventDefault(); });   // right-click is an instrument here

  const endStroke = () => {
    if (strokeId === null) return;
    strokeId = null; prev = null;
    V.wipeEnd(); A.setParam('mod', 0.5); A.squeak(0);
  };

  stage.addEventListener('pointerdown', (e) => {
    const now = performance.now();
    if (e.pointerType === 'pen') penAt = now;
    else if (e.pointerType === 'touch' && now - penAt < 700) return;                // palm rejection
    if (e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32))) return;     // the eraser end does nothing
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* the pointer already ended: carry on */ }
    if (e.button === 2 || e.button === 1) { e.preventDefault(); app.startBuild(e.button === 1 || e.shiftKey ? 1 : 0, 'touch'); return; }
    if (PB.perf) return;
    if (e.pointerType === 'touch') {
      fingers.add(e.pointerId);
      if (fingers.size >= 2) {                                                         // a second finger turns the gesture into a build
        endStroke();
        clearTimeout(buildTimer);
        buildTimer = setTimeout(() => app.startBuild(fingers.size >= 3 ? 1 : 0, 'touch'), 110);   // wait a beat in case a third finger follows
        return;
      }
    }
    strokeId = e.pointerId;
    prev = { x: e.clientX, y: e.clientY };
    moved = 0; downAt = now;
  });

  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== strokeId || !prev) return;
    const co = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [], pts = co.length ? co : [e];   // every point a pen reported, not just the last
    for (const q of pts) {
      const size = e.pointerType === 'pen' ? clamp(0.2 + 0.95 * (q.pressure || 0.5), 0.2, 1.3) : 1;
      V.wipe(q.clientX, q.clientY, prev.x, prev.y, size);
      if (P.active) {
        const args = [round(q.clientX / innerWidth, 3), round(q.clientY / innerHeight, 3), round(prev.x / innerWidth, 3), round(prev.y / innerHeight, 3)];
        if (size !== 1) args.push(round(size, 3));
        P.log(A.now(), 8, ...args);
      }
      const x = q.clientX / innerWidth;
      A.setParam('mod', x);
      A.squeak((Math.hypot(q.clientX - prev.x, q.clientY - prev.y) / 40) * (e.pointerType === 'pen' ? 0.4 + (q.pressure || 0.5) : 1), x);
      moved += Math.abs(q.clientX - prev.x) + Math.abs(q.clientY - prev.y);
      prev = { x: q.clientX, y: q.clientY };
    }
    clearTimeout(quiet);
    quiet = setTimeout(() => A.squeak(0), 90);
  });

  const release = (e) => {
    if (e.button === 2 || e.button === 1) { app.endBuild('touch'); return; }
    if (e.pointerType === 'touch' && fingers.delete(e.pointerId) && fingers.size < 2) { clearTimeout(buildTimer); app.endBuild('touch'); }
    if (e.pointerId !== strokeId) return;
    const tap = moved < 10 && performance.now() - downAt < 280 && e.pointerType !== 'mouse' && e.type === 'pointerup';
    endStroke();
    if (tap) {                                                                          // double-tap hides or shows the controls
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) { app.setUiHidden(!document.body.classList.contains('ui-hidden')); lastTap.t = -1e9; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', (e) => { release(e); app.endBuild('touch'); if (e.pointerType === 'touch') { fingers.clear(); } });
  stage.addEventListener('auxclick', (e) => e.preventDefault());
}
