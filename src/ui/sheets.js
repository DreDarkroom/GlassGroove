/* Glass Groove: the dock and its sheets. Five tabs along the bottom (thumb height); one sheet slides up above them. Tap the tab again to put it away. */
import { $, $$, icon } from '../util.js';

const TABS = ['play', 'beat', 'sound', 'look', 'keep'];

export function buildSheets(app) {
  const sheet = $('#sheet'), dock = $('#dock');
  let current = null;
  const refresh = {};                                              // each tab says how to repaint itself when it is opened
  app.onTab = refresh;

  for (const b of $$('button', dock)) { b.querySelector('.i').append(icon(b.dataset.tab)); b.setAttribute('aria-selected', 'false'); b.setAttribute('aria-controls', 'sheet'); }

  function setHeight() { document.documentElement.style.setProperty('--sheet-h', sheet.hidden ? '0px' : `${sheet.offsetHeight}px`); }
  new ResizeObserver(setHeight).observe(sheet);

  function open(name) {
    if (!TABS.includes(name)) return;
    const fresh = current == null;
    current = name;
    sheet.hidden = false;
    if (fresh) app.nav.push('sheet', close);
    for (const t of TABS) $(`#pane-${t}`).hidden = t !== name;
    for (const b of $$('button', dock)) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    if (refresh[name]) refresh[name]();
    sheet.scrollTop = 0;
    setHeight();
  }

  function close() {
    current = null;
    app.nav.release('sheet');
    sheet.hidden = true;
    for (const b of $$('button', dock)) b.setAttribute('aria-selected', 'false');
    setHeight();
  }

  dock.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (current === b.dataset.tab) close(); else open(b.dataset.tab);
  });
  $('#grab').addEventListener('click', close);
  Object.assign(app, { openTab: open, closeSheet: close, currentTab: () => current });
}
