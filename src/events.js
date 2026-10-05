/* Wipelight: two tiny channels that replace the original's shared global array.

   `timed`: things that happen at an audio-clock time (a kick, a step, a drop). The sequencer pushes them when it schedules a sound,
   and the picture releases them when they are HEARD, so lights and sounds stay together. A moving head index means draining is O(1) per event
   (the original shifted an array, which moves every element each time).

   `bus`: plain publish / subscribe for everything else (the interface listening for a style change, the studio listening for a recording). */
const q = [];
let head = 0;
const KEEP = 400;

export const timed = {
  push(t, type, a, b) {
    q.push({ t, type, a, b });
    if (q.length - head > KEEP) head = q.length - KEEP;
  },
  drain(now, fn) {
    while (head < q.length && q[head].t <= now) fn(q[head++]);
    if (head > 2048) { q.splice(0, head); head = 0; }
  },
  clear() { q.length = 0; head = 0; },
  get length() { return q.length - head; },
};

const subs = new Map();
export const bus = {
  on(type, fn) { (subs.get(type) || subs.set(type, new Set()).get(type)).add(fn); return () => bus.off(type, fn); },
  off(type, fn) { const s = subs.get(type); if (s) s.delete(fn); },
  emit(type, ...args) { const s = subs.get(type); if (s) for (const fn of s) fn(...args); },
};
