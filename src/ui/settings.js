/* Wipelight: Settings. Plain sentences, switches you can hit with a thumb. Pro view and Developer mode live here and nowhere else. */
import { $, h } from '../util.js';
import { CONFIG } from '../config.js';
import { toast } from './dom.js';

export function buildSettings(app) {
  const box = $('#settings');
  let open = false;

  const sw = (title, sub, get, set, disabled) => {
    const inp = h('input', { type: 'checkbox', checked: get() ? true : null, disabled: disabled ? true : null });
    inp.addEventListener('change', () => set(inp.checked));
    return h('label', { class: 'switch' }, h('span', null, title, h('small', { text: sub })), inp);
  };

  function build() {
    box.replaceChildren(
      h('h2', null, 'Settings', h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Close settings', onclick: () => toggle(false) }, '×')),
      sw('Battery saver', 'A smaller picture and no reverb room. Cooler and kinder to the battery. Starts on for phones.', () => app.eco.get(), (on) => app.eco.set(on)),
      sw('Keep the screen on', 'While the music is playing.', () => app.keepAwake.get(), (on) => app.keepAwake.set(on)),
      sw('Buzz on the beat', app.haptics.available ? 'A little vibration on the kick and the drop.' : 'This device or browser does not allow vibration.', () => app.haptics.get(), (on) => app.haptics.set(on), !app.haptics.available),
      sw('Left-handed', 'Moves the Rise button to the right.', () => app.lefty.get(), (on) => app.lefty.set(on)),
      sw('Pro view', 'For a bigger screen: all sixteen bass steps at once.', () => app.pro.get(), (on) => app.pro.set(on)),
      sw('Developer mode', 'Live numbers, switches and a benchmark. (Shift + D on a keyboard.)', () => app.dev.on, (on) => app.dev.toggle(on)),
      h('h3', { text: 'On a keyboard' }),
      h('p', { class: 'fine', text: 'Space: hold to rise, let go to drop. A W S E D F T G Y H U J K O L P: play the bass. 1 2 3: mood. ; and \': vibe. [ and ]: speed. Z X V B: mute kick, snare, hats, bass. Enter: pause. `: hide the controls.' }),
      h('h3', { text: 'About' }),
      h('p', { class: 'fine' }, `Wipelight ${CONFIG.version}. Everything stays on your device. `, h('a', { href: CONFIG.repoUrl, rel: 'noopener', text: 'Source' }), '.'),
      h('p', { class: 'fine quiet', text: 'Feedback, suggestions and requests are welcome. Wipelight is still being tinkered with and tested, so its re-use and licensing terms are not settled yet. If you would like to reuse any of it, or use it commercially, please ask first.' }),
      h('button', { type: 'button', class: 'btn danger', style: 'margin-top:8px', onclick: () => { if (confirm('Forget every setting and saved beat on this device? Your recordings in Takes stay.')) { Object.keys(localStorage).filter((k) => k.startsWith('wipelight.')).forEach((k) => localStorage.removeItem(k)); toast('Forgotten. Reloading…'); setTimeout(() => location.reload(), 600); } } }, 'Forget my settings'),
    );
  }

  function toggle(force) {
    open = force != null ? force : !open;
    box.hidden = !open;
    $('#gear').setAttribute('aria-expanded', String(open));
    if (open) build();
  }
  $('#gear').addEventListener('click', () => toggle());
  Object.assign(app, { toggleSettings: toggle, settingsOpen: () => open, closeModals: () => toggle(false) });
}
