/* Glass Groove: the few DOM helpers the interface shares. */
import { $ } from '../util.js';

let toastTimer = 0;
/** A small message that fades by itself. */
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let hintTimer = 0;
/** A quiet line under the top bar (a teaching hint), which goes away on its own. */
export function hint(msg, ms = 4200) {
  const el = $('#hint');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** A range input that paints its own filled track (the stylesheet reads --fill). */
export function paintRange(input) {
  const lo = +input.min || 0, hi = +input.max || 1;
  input.style.setProperty('--fill', `${((+input.value - lo) / (hi - lo)) * 100}%`);
}

/** Make a dialog behave: it is marked modal, Tab stays inside it, and closing it puts focus back where it was. Call the function it returns when the dialog closes. */
export function modal(box) {
  const opener = document.activeElement;
  box.setAttribute('aria-modal', 'true');
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  box.addEventListener('keydown', onKey);
  return () => { box.removeEventListener('keydown', onKey); if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true }); };
}
