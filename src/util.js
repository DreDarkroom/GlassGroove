/* Glass Groove: small helpers shared by everything. No DOM at import time, so Node tests can load it. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (d) => Math.pow(10, d / 20);
export const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
export const pad2 = (n) => String(n).padStart(2, '0');

export const stamp = (d = new Date()) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
export const fmtBytes = (n) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};

/** A small stable 32-bit hash of a string (FNV-1a): used to turn a control's name into a shape and a colour. */
export const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Save a Blob (or text) as a download. */
export function download(data, name, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** localStorage that never throws (private windows, blocked storage) and keeps everything under one prefix. */
export const store = {
  prefix: 'wipelight.',
  get(k, fallback = null) { try { const v = localStorage.getItem(this.prefix + k); return v == null ? fallback : JSON.parse(v); } catch (err) { return fallback; } },
  set(k, v) { try { localStorage.setItem(this.prefix + k, JSON.stringify(v)); return true; } catch (err) { return false; } },
};

/** Mouse-wheel units to "notches" (a trackpad sends many small ones that add up to the same). */
export const notches = (e) => clamp(((e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1)) / 100, -3, 3);

/** A tiny element builder: h('button', { class: 'chip', onclick: fn, 'aria-label': 'x' }, 'text', childElement). Falsy props are skipped; `true` sets a bare attribute. */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(2)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

const ICONS = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  keys: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/>',
  beat: '<circle cx="6.5" cy="6.5" r="2"/><circle cx="12" cy="6.5" r="2" fill="currentColor"/><circle cx="17.5" cy="6.5" r="2"/><circle cx="6.5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2"/><circle cx="17.5" cy="12" r="2" fill="currentColor"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="12" cy="17.5" r="2" fill="currentColor"/><circle cx="17.5" cy="17.5" r="2"/>',
  sound: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="#0b1020"/><circle cx="15" cy="12" r="2.2" fill="#0b1020"/><circle cx="8" cy="17" r="2.2" fill="#0b1020"/>',
  look: '<path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z"/><path d="M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  keep: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
};
/** A small line icon (24 x 24, uses the current text colour). */
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'icon');
  s.innerHTML = ICONS[name] || '';
  return s;
}
