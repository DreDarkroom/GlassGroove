// Builds the pieces the original DevelopDrop tests expect (an "SS" object) from the new modules, so those tests keep guarding the same behaviour.
import { createAudio } from '../src/engine/audio.js';
import { createSeq } from '../src/engine/seq.js';
import { createRecorder, encode, decode, validate, stateAt, indexAt, pump, C } from '../src/perf/format.js';
import * as wav from '../src/rec/wav.js';
import * as loopfile from '../src/engine/loopfile.js';

export function load() {
  const audio = createAudio(), events = [];
  const seq = createSeq(audio, { emit: (t, type, a, b) => events.push({ t, type, a, b }) });
  const perf = Object.assign(createRecorder(), { encode, decode, validate, stateAt, indexAt, pump, CODES: C });
  // the original kept these on the sequencer; they are their own module now
  seq.snapshot = (kind) => loopfile.snapshot(seq, audio, kind);
  seq.apply = (j) => loopfile.applySnapshot(seq, audio, j);
  seq.clipToJSON = (part) => loopfile.clipToJSON(seq, audio, part);
  seq.loadClip = (j, o) => loopfile.loadClip(seq, audio, j, o);
  return { audio, seq, events, perf, wav };
}
