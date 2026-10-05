/* Glass Groove: sharing a beat as a link. The beat (a small JSON snapshot) is compressed and written after the # in the address, so it travels in a message
   and goes nowhere else: the # part of an address is never sent to a server. Pure apart from CompressionStream, which Node and every current browser have. */
import { CONFIG, isOurs } from './config.js';

const toB64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4)), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const MAX = 20000;                                                  // a shared beat is a kilobyte or two; refuse anything absurd

/** snapshot -> the text that goes after "#b=". Parameter numbers are rounded to keep the link short. */
export async function encodeBeat(snapshot) {
  const slim = JSON.parse(JSON.stringify(snapshot, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)));
  return toB64u(await pipe(new TextEncoder().encode(JSON.stringify(slim)), new CompressionStream('gzip')));
}

/** The text after "#b=" -> a snapshot object, or an Error with a plain reason. The caller still validates it as a loop before it changes anything. */
export async function decodeBeat(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > MAX) throw new Error('that link is not a beat');
  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(await pipe(fromB64u(text), new DecompressionStream('gzip')))); } catch (err) { throw new Error('that link is damaged'); }
  if (!doc || typeof doc !== 'object' || !isOurs(doc) || doc.kind !== 'loop') throw new Error('that link is not a beat');
  return doc;
}

/** A full address for a beat, relative to where the page is now. */
export async function beatUrl(snapshot, base) {
  const u = new URL(base);
  u.hash = 'b=' + (await encodeBeat(snapshot));
  return u.toString();
}

export const beatFromHash = (hash) => { const m = /^#?b=([A-Za-z0-9_-]+)$/.exec(hash || ''); return m ? m[1] : null; };
export { CONFIG };
