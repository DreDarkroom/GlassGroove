/* Glass Groove: feedback and suggestions. A short form that posts a note to the developer's phone through ntfy (a free push service). Nothing is sent until Send is pressed;
   a note written offline waits on the device and goes when there is a connection. The message is plain text: a kind, the words, and (only if ticked) the app version and screen size. */
import { $, h } from '../util.js';
import { CONFIG } from '../config.js';
import { toast, modal } from './dom.js';

const KINDS = [['Idea', 'bulb'], ['Problem', 'warning'], ['Request', 'sparkles'], ['Love it', 'heart']];
const MAX = 600, QUEUE = 'feedbackQueue';

export function buildFeedback(app) {
  let kind = 'Idea', lastSent = 0, box = null;

  async function post(note) {
    const r = await fetch(`https://ntfy.sh/${CONFIG.feedbackTopic}`, {
      method: 'POST', body: note.text,
      headers: { Title: `${CONFIG.name}: ${note.kind}`.replace(/[^ -~]/g, '?'), Tags: (KINDS.find((k) => k[0] === note.kind) || KINDS[0])[1], Priority: '3' },
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
  }
  let flushing = false;
  async function flush() {
    if (flushing || !navigator.onLine) return;                                  // one flush at a time: two at once would send the same note twice
    const q = app.store.get(QUEUE, []);
    if (!Array.isArray(q) || !q.length) return;
    flushing = true;
    let sent = 0;
    try {
      for (const n of q.slice()) {
        if (!n || typeof n.text !== 'string' || typeof n.kind !== 'string') { q.shift(); continue; }       // a damaged entry is dropped
        try { await post(n); q.shift(); sent++; app.store.set(QUEUE, q); } catch (err) { break; }          // stop at the first failure: keep the order, try again later
      }
      app.store.set(QUEUE, q);
    } finally { flushing = false; }
    if (sent) toast('Your saved feedback was sent. Thank you.', 4000);
  }
  addEventListener('online', flush);
  setTimeout(flush, 4000);

  function open() {
    if (box) return;
    const area = h('textarea', { rows: 5, maxlength: MAX, placeholder: 'An idea, something that went wrong, something you would love to see…', 'aria-label': 'Your feedback' });
    const count = h('small', { class: 'fine', text: `0 / ${MAX}` });
    area.addEventListener('input', () => { count.textContent = `${area.value.length} / ${MAX}`; });
    const info = h('input', { type: 'checkbox', checked: true });
    const chips = KINDS.map(([k]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(k === kind), onclick: () => { kind = k; chips.forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === k))); } }, k));
    const send = h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Send');
    let releaseModal = null;
    const close = () => { if (!box) return; box.remove(); box = null; app.nav.release('feedback'); if (releaseModal) releaseModal(); };
    async function submit() {
      const text = area.value.trim();
      if (text.length < 3) return toast('Write a few words first.');
      if (Date.now() - lastSent < 20000) return toast('One moment before sending another.');
      const extra = info.checked ? `\n\n${CONFIG.name} ${CONFIG.version} · ${innerWidth}x${innerHeight} · ${app.isEco() ? 'battery saver' : 'full'} · ${S_name()}` : '';
      const note = { kind, text: text + extra };
      lastSent = Date.now(); send.disabled = true;
      try { if (!navigator.onLine) throw new Error('offline'); await post(note); toast('Sent to my phone. Thank you!', 4000); }
      catch (err) { app.store.set(QUEUE, app.store.get(QUEUE, []).concat(note).slice(-10)); toast('Saved. It will be sent when you are back online.', 5000); }
      close();
    }
    const S_name = () => { try { return app.S.styles[app.S.style].name; } catch (err) { return ''; } };
    box = h('section', { id: 'feedback', class: 'modal', role: 'dialog', 'aria-label': 'Send feedback' },
      h('h2', null, 'Feedback', h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Close', onclick: close }, '×')),
      h('p', { class: 'fine', text: 'Ideas, problems and requests all go straight to my phone. I read every one.' }),
      h('div', { class: 'chips' }, chips), area, count,
      h('label', { class: 'switch' }, h('span', null, 'Include the app version and screen size', h('small', { text: 'Helps me fix a problem. No name, no account, nothing else.' })), info),
      h('p', { class: 'fine quiet', text: 'It is sent through ntfy.sh, a free notification service, so please keep personal details out of it.' }),
      h('div', { class: 'row', style: 'margin-top:10px' }, send));
    document.body.append(box);
    releaseModal = modal(box);
    app.nav.push('feedback', close);
    area.focus();
  }
  app.feedback = { open };
}
