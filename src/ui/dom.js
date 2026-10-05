/* Wipelight: the few DOM helpers the interface shares. */
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
