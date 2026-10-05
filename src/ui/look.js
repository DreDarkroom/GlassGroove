/* Glass Groove: the Look tab: which picture, how much every press blooms, and how hard the picture is allowed to work. */
import { $, h } from '../util.js';
import { toast } from './dom.js';

const SCENES = ['Tentacles', 'Dots', 'Film', 'Rays', 'Ink'];
const BLOOM = ['Off', 'Soft', 'Wild', 'Max'];
const QUALITY = [['Auto', 'auto'], ['High', 'high'], ['Medium', 'medium'], ['Low', 'low']];

export function buildLook(app) {
  const { S, V } = app, pane = $('#pane-look');
  const group = (label, items, get, set) => {
    const box = h('div', { class: 'chips', role: 'group', 'aria-label': label });
    const paint = () => { [...box.children].forEach((b, i) => b.setAttribute('aria-pressed', String(items[i][1] === get()))); };
    items.forEach(([t, v]) => box.append(h('button', { type: 'button', class: 'chip', onclick: () => { set(v); paint(); } }, t)));
    paint();
    return { box, paint };
  };
  const scenes = group('Picture', SCENES.map((t, i) => [t, i]), () => S.scene, (i) => { S.scene = i; V.setScene(i); });
  const bloom = group('Bloom', BLOOM.map((t, i) => [t, i]), () => app.vfx.get(), (i) => { app.vfx.set(i); toast(i ? `Bloom: ${BLOOM[i].toLowerCase()}` : 'Bloom is off', 1600); });
  const quality = group('Picture quality', QUALITY, () => V.stats.mode, (m) => { V.setQuality(m); app.store.set('quality', m); });

  pane.append(
    h('h2', { text: 'Look' }),
    h('h3', { text: 'Picture' }), scenes.box,
    h('h3', { text: 'Bloom' }), h('p', { class: 'fine', text: 'Every press, on a button or on the picture, blooms and feeds the picture. Turn it down if it is too much.' }), bloom.box,
    h('h3', { text: 'Quality' }), h('p', { class: 'fine', text: 'Auto steps down by itself if your phone struggles.' }), quality.box,
  );
  app.onTab.look = () => { scenes.paint(); bloom.paint(); quality.paint(); };
}
