/* Glass Groove: moods and vibes. Plain data.
   A vibe is a complete starting point (tempo, drum kit, patterns, rings, sound, mood, picture): original patterns, named for what they feel like. */

/** The mood you play in decides the musical mode, and tints the picture and the controls. */
export const LIGHTS = [
  { id: 'dark', name: 'Dark', mode: 'minor', scale: [0, 2, 3, 5, 7, 8, 10], tint: [150, 112, 255] },
  { id: 'warm', name: 'Warm', mode: 'dorian', scale: [0, 2, 3, 5, 7, 9, 10], tint: [255, 122, 108] },
  { id: 'bright', name: 'Bright', mode: 'lydian', scale: [0, 2, 4, 6, 7, 9, 11], tint: [64, 240, 208] },
];

/** Evenly spread `hits` across `len` steps, then rotate. */
export function euclid(hits, len, rot) {
  const out = new Array(len).fill(false);
  for (let i = 0; i < len; i++) if (Math.floor(((i + 1) * hits) / len) !== Math.floor((i * hits) / len)) out[(i + rot) % len] = true;
  return out;
}

const R = (len, hits, rot) => ({ len, steps: euclid(hits, len, rot) });
const O = (len, on) => ({ len, steps: Array.from({ length: len }, (_, i) => on.includes(i)) });
const SND = (cutoff, reso, decay, drive, glide, space) => ({ cutoff, reso, decay, drive, glide, space });
const EMPTY = new Array(16).fill(-1);

export const STYLES = [
  { name: 'Slow roll', note: 'Rolling and hypnotic. The one to start with.', tempo: 119, swing: 0.22, kit: 'safelight', light: 0, scene: 0, drift: 0.4,
    bass: [0, -1, 0, 2, -1, 4, -1, 3, 0, -1, 5, -1, 4, 2, -1, 7], kick: R(16, 4, 1), snare: R(12, 2, 3), hat: R(14, 7, 0), sound: SND(0.42, 0.4, 0.38, 0.22, 0.18, 0.3) },
  { name: 'Minimal', note: 'Sparse bass and dry clicks that drift against each other.', tempo: 122, swing: 0.05, kit: 'minimal', light: 1, scene: 1, drift: 0.55,
    bass: [0, -1, -1, -1, 4, -1, -1, 2, -1, -1, -1, -1, 5, -1, 3, -1], kick: R(16, 5, 0), snare: R(12, 3, 2), hat: R(14, 9, 0), sound: SND(0.5, 0.3, 0.2, 0.1, 0.05, 0.2) },
  { name: 'Electro', note: 'Four on the floor, claps on two and four, offbeat hats.', tempo: 126, swing: 0.12, kit: 'electro', light: 0, scene: 2, drift: 0.3,
    bass: [0, 0, -1, 7, 0, -1, 7, 0, 0, -1, 5, 0, -1, 7, 3, -1], kick: R(16, 4, 1), snare: R(16, 2, 5), hat: R(16, 4, 3), sound: SND(0.55, 0.45, 0.25, 0.3, 0.08, 0.25) },
  { name: 'Rave', note: 'A pumping arpeggio, a big kick, open hats.', tempo: 134, swing: 0, kit: 'rave', light: 2, scene: 3, drift: 0.4,
    bass: [0, 4, 7, 4, 0, 4, 7, 4, 2, 5, 7, 5, 2, 5, 7, 5], kick: R(16, 4, 1), snare: R(16, 2, 5), hat: R(16, 8, 1), sound: SND(0.6, 0.5, 0.3, 0.3, 0.1, 0.35) },
  { name: 'Drum & bass', note: 'Fast: 174 bpm, two-step kick, rolling bass.', tempo: 174, swing: 0, kit: 'dnb', light: 0, scene: 1, drift: 0.35, dnb: true,
    bass: [0, -1, 0, -1, -1, 0, -1, 3, 0, -1, 0, -1, -1, 5, -1, 3], kick: O(16, [0, 10]), snare: O(16, [4, 12]), hat: R(16, 13, 0), sound: SND(0.35, 0.5, 0.2, 0.35, 0.02, 0.2) },
  { name: 'Slow build', note: 'Starts with only a kick and hats. Bring the rest in yourself.', tempo: 104, swing: 0.18, kit: 'safelight', light: 0, scene: 0, drift: 0.3,
    bass: [0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 2, -1, -1, -1], kick: R(16, 4, 1), snare: R(12, 2, 3), hat: R(14, 7, 0), sound: SND(0.4, 0.35, 0.4, 0.15, 0.2, 0.35), mute: { snare: true, bass: true } },
  { name: 'Wobble', note: 'Wet and wobbly: a slow groove with a bass that slides.', tempo: 112, swing: 0.3, kit: 'safelight', light: 0, scene: 4, drift: 0.5,
    bass: [0, -1, -1, 2, -1, 0, -1, -1, 3, -1, 2, -1, -1, 0, -1, 4], kick: R(16, 3, 0), snare: R(12, 2, 4), hat: R(14, 6, 1), sound: SND(0.38, 0.55, 0.5, 0.18, 0.5, 0.5) },
  { name: 'Empty', note: 'Nothing playing: write your own.', tempo: 119, swing: 0.15, kit: 'safelight', light: 0, scene: 0, drift: 0.4,
    bass: EMPTY.slice(), kick: O(16, []), snare: O(16, []), hat: O(16, []), sound: SND(0.42, 0.4, 0.38, 0.22, 0.18, 0.3) },
];
