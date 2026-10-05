/* Glass Groove: the things around the edges that make it feel like a phone app: haptics on the beat, keeping the screen awake, a battery saver that switches itself on,
   the bloom under every press (which also feeds the picture), and, on a keyboard, shortcuts. */
import { clamp, hashStr } from '../util.js';
import { hint, toast } from './dom.js';

const COARSE = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };
export const isTouchDevice = () => COARSE.matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
const PIANO = 'awsedftgyhujkolp';
const PRESS_TARGETS = '.btn, .chip, .part, .vibe, .key, .cell, .dot, #dock button, #rise, .ico, .xbtn, .switch, #stage';
export const BLOOM = [{ name: 'off', press: 0 }, { name: 'soft', press: 0.6 }, { name: 'wild', press: 1 }, { name: 'max', press: 1.6 }];

export function buildExtras(app) {
  const { A, S, V, PB, R } = app, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- haptics: a tick on the kick, a thump on the drop (Android browsers; iPhones do not allow it) ---- */
  const canBuzz = typeof navigator.vibrate === 'function';
  let haptics = canBuzz && app.store.get('haptics', true) !== false;
  app.buzz = (pattern) => { if (haptics && document.visibilityState === 'visible') navigator.vibrate(pattern); };
  app.haptics = { available: canBuzz, get: () => haptics, set: (on) => { haptics = !!on && canBuzz; app.store.set('haptics', haptics); } };

  /* ---- keep the screen awake while it is playing ---- */
  let wake = null, keepAwake = app.store.get('awake', true) !== false;
  async function updateWake() {
    const want = keepAwake && (S.playing || R.state.active || PB.playing);
    try {
      if (want && !wake && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      else if (!want && wake) { await wake.release(); wake = null; }
    } catch (err) { /* refused or unsupported: everything still works */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updateWake(); if (A.ready) A.resume(); } });
  app.updateWake = updateWake;
  app.keepAwake = { get: () => keepAwake, set: (on) => { keepAwake = !!on; app.store.set('awake', keepAwake); updateWake(); } };

  /* ---- the battery saver: a smaller picture, no reverb room, plainer hats. A phone starts in it; a low battery turns it on ---- */
  let eco = false;
  function setEco(on, why, persist = true) {
    eco = !!on; A.setEco(eco); V.setEco(eco);
    if (persist) app.store.set('eco', eco);
    if (why) toast(why, 5000);
  }
  const savedEco = app.store.get('eco');
  setEco(app.qs.get('eco') != null ? app.qs.get('eco') === '1' : savedEco != null ? !!savedEco : isTouchDevice(), null, false);
  app.eco = { get: () => eco, set: (on) => setEco(on) };
  app.isEco = () => eco;
  if (navigator.getBattery) navigator.getBattery().then((b) => {
    const check = () => { if (!b.charging && b.level <= 0.2 && !eco) setEco(true, `Battery at ${Math.round(b.level * 100)}%: battery saver is on so it lasts.`, false); };
    b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check); check();
  }).catch(() => {});

  /* ---- bloom: a burst under every press, and every press feeds the picture ---- */
  let level = app.store.get('vfx', 2), alive = 0;
  function setBloom(n) {
    level = clamp(Math.round(n), 0, 3);
    V.pressScale = BLOOM[level].press;
    document.body.classList.toggle('vfx-motion', level > 0 && !reduce);
    app.store.set('vfx', level);
  }
  document.addEventListener('pointerdown', (e) => {
    if (!level) return;
    const t = e.target.closest ? e.target.closest(PRESS_TARGETS) : null;
    if (!t || t.disabled) return;
    const id = hashStr(t.id || t.getAttribute('aria-label') || (t.textContent || '').trim().slice(0, 24) || t.className);
    const force = e.pointerType === 'pen' ? clamp((e.pressure || 0.5) * 1.6, 0.2, 2) : 1;
    if (!PB.perf) V.press(e.clientX / innerWidth, e.clientY / innerHeight, id, force);          // a replay that is playing decides its own picture
    if (t.id !== 'stage' && !reduce && alive < 10) {
      const b = document.createElement('i');
      b.className = 'vfx-burst';
      b.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--h:${id % 360}deg;--s:${0.8 + (level / 3) * 0.9}`;
      alive++;
      b.addEventListener('animationend', () => { b.remove(); alive--; }, { once: true });
      document.body.append(b);
    }
  }, true);
  setBloom(level);
  app.vfx = { set: setBloom, get: () => level, levels: BLOOM };

  /* ---- left-handed: the Rise button moves to the other side ---- */
  const lefty = (on) => { document.body.classList.toggle('lefty', on); app.store.set('lefty', on); };
  lefty(!!app.store.get('lefty', false));
  app.lefty = { get: () => document.body.classList.contains('lefty'), set: lefty };

  /* ---- Pro view: everything on one screen, for a bigger display ---- */
  const pro = (on) => { document.body.classList.toggle('pro', on); app.store.set('pro', on); app.refreshBeat && app.refreshBeat(); };
  pro(!!app.store.get('pro', false));
  app.pro = { get: () => document.body.classList.contains('pro'), set: pro };

  /* ---- the timed events: the sequencer's lights, haptics, autopilot ---- */
  let armedTimer = 0;
  V.onEvent = (e) => {
    app.beatEvent && app.beatEvent(e);
    switch (e.type) {
      case 'kick': app.buzz([6]); break;
      case 'drop': app.buzz([40, 30, 80]); break;
      case 'style': app.refreshAll(); break;
      case 'dropArmed': hint('Drop…', Math.max(500, (e.a || 0) * 1000 + 300)); clearTimeout(armedTimer); break;
      default:
    }
  };

  /* ---- a keyboard (a wide screen with a pointer): the same things, quicker ---- */
  let heldKey = null;
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key.toLowerCase();
    if (PB.perf) return;
    if ((k === ' ' || k === 'enter') && e.target.closest && e.target.closest('.dot, [role="button"], a[href], summary')) return;   // a ring step, link or disclosure that has focus keeps its own Space and Enter (the Rise key still works after a button press)
    if (k === ' ') { e.preventDefault(); if (!e.repeat) app.startBuild(e.shiftKey ? 1 : 0, 'key'); return; }
    if (e.repeat) return;
    if (k === 'escape') { app.closeSheet(); app.closeModals && app.closeModals(); }
    else if (k === 'enter' && document.activeElement.tagName !== 'BUTTON') app.togglePlay();
    else if (k === '`') app.setUiHidden(!document.body.classList.contains('ui-hidden'));
    else if (k === '?') app.toggleSettings();
    else if (k === 'd' && e.shiftKey) app.dev.toggle();
    else if (k >= '1' && k <= '3') app.setLight(+k - 1);
    else if (k === ';') app.setStyle(S.style - 1);
    else if (k === "'") app.setStyle(S.style + 1);
    else if (k === '[') app.nudgeTempo(-1);
    else if (k === ']') app.nudgeTempo(1);
    else if (k === 'z' || k === 'x' || k === 'v' || k === 'b') { S.toggleMute({ z: 'kick', x: 'snare', v: 'hat', b: 'bass' }[k]); app.refreshBeat && app.refreshBeat(); }
    else if (A.ready && PIANO.includes(k)) { heldKey = k; A.noteOn(A.now() + 0.005, A.params.root + 12 + PIANO.indexOf(k), 0.8, false); }
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); app.endBuild('key'); } else if (k === heldKey) { heldKey = null; A.noteOff(A.now() + 0.005); }
  });
}
