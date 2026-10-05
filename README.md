# Glass Groove

Wipe the fog off a glowing picture and make music with your thumbs. A bass, three drummers and a picture that reacts to everything you touch,
built to be played on a phone with one hand. No sign-up, no ads, nothing leaves your device.

**Play it:** https://dredarkroom.github.io/GlassGroove/ (open it on your phone, tap **Tap to wake the light**, then drag across the picture).
Add it to your home screen for a full-screen app that also opens with no signal.

Glass Groove is a mobile-first rebuild of [DreVelopDrop](https://github.com/DreDarkroom/DreVelopDrop), which grew from [DevelopDrop](https://github.com/DreDarkroom/DevelopDrop).
It keeps their audio and picture engines and replaces everything you touch: a new interface, new colours, plain words, and a different set of priorities.

## Playing it

| You do | It does |
|---|---|
| Drag a finger across the picture | **Wipes the fog.** It smears, squeaks, drips and opens the sound's filter. |
| Hold **Rise**, then let go | The music thins out and climbs while you hold. When you let go, the **drop** lands on the beat. |
| Hold two fingers on the picture | The same as Rise (three fingers: Rise under water). |
| Tap the picture twice | Hide or show the controls. |
| Tap anywhere on the controls | A burst blooms under your finger, and the press feeds the picture. |

The five tabs along the bottom, in the order you will want them:

- **Play**: eight big keys that play the bass in the scale of the current mood (slide across them), an octave shift, and **Autopilot**, which builds and drops by itself.
- **Beat**: pick a part (Kick, Snare, Hats, Bass) and shape it. The drummers are rings of dots that loop at different lengths, so the groove takes a long time to repeat. Tap a dot to turn a hit on or off. Fewer hits, More hits, Shorter loop, Longer loop, Spin, New pattern, Clear; Mute, Only this part, Level.
- **Sound**: a **vibe** is a whole starting point (Slow roll, Minimal, Electro, Rave, Drum & bass, Slow build, Wobble, Empty); the **mood** (Dark, Warm, Bright) sets the notes and the colour; **speed** has a stepper and **Tap**; four big sliders (Brightness, Space, Groove, Volume) and *More sound* (Edge, Length, Dirt, Slide, Wander, Pump); and when the drop lands.
- **Look**: the picture (Tentacles, Dots, Film, Rays, Ink), how much every press blooms, and the picture quality.
- **Keep**: **Record** (Replay, Video, Video + replay, Audio WAV, Audio MP3), **Share a link**, Save beat, Load saved beat, Open a file, and the way into **Takes**.

**Takes** (`takes.html`) is where recordings live, on your device only: play a replay back with its picture, tidy its timing, transpose notes, edit it on a timeline, export it as audio (WAV) or as separate parts (a zip), make a video of it, trim a video, save a frame.

## New in 0.2 (and why)

- **The Back button works like an app.** It closes what is open (settings, a sheet, a surge, hidden controls) one step at a time. With nothing open, the first press pauses the music, saves the beat and asks "Leave?"; *Stay and play* carries on exactly where it was.
- **It keeps playing when you leave.** Switching apps or locking the phone does not stop the music: the scheduler runs in a worker, Autopilot counts bars in the scheduler (not the picture), and a silent media element plus the Media Session give a notification and lock-screen buttons (play, pause, next and previous vibe). **Float** (Play tab) puts a small picture-in-picture player on top of other apps. If the phone interrupts the sound (a call, a notification), it is resumed, and the next touch resumes it for sure. Paused-by-stall recovery: a long stall skips what it missed instead of playing it all at once.
- **Surge.** Tap the picture twice with two fingers (or *Start a surge* in the Play tab). The controls swap for a countdown and a different small set of buttons: Longer, Shorter, Drop now, Cancel, and what lands (same vibe, next vibe, surprise). The rise is 4, 8 or 16 bars, drops by itself on a bar line, and the picture climbs with the sound: the hue turns through the spectrum, it gets lighter as the riser climbs in pitch and more vivid with the loudness of the middle, the kaleidoscope gains folds, and the whole interface takes the picture's colour. A held Rise does a milder version of the same.
- **Trippier presses.** A spinning colour wheel around whatever you touch, keys that ring out, a Rise button that glows on a slow beat and turns through the colours while held. (Bloom in the Look tab turns it down; reduced-motion turns it off.)
- **Feedback from inside the app.** *Keep* and *Settings* have *Send feedback or a suggestion*. It goes to the developer's phone through ntfy.sh, only when you press Send, and waits on the device if you are offline.
- **Works with no signal.** The service worker stores every file (both pages, every module, the MP3 encoder, the icons) the first time it loads; `node tools/build-sw.js` regenerates the list.
- **Fixes:** the Tweak list showed "[object HTMLLabelElement]" instead of sliders; the developer panel could cover the settings; the benchmark now pauses the music while it runs; a stalled scheduler no longer plays a burst of old notes.

Sound and picture are still all synthesised, so nothing else needs to be downloaded for offline use.

## What changed from DreVelopDrop

- **Share a beat as a link.** *Keep → Share a link* writes the beat (about 440 characters) after the `#` in the address, which is never sent to a server. It opens on the other person's device ready to play. Links are validated before anything changes.
- **Tap tempo, Autopilot, bass keys, haptics** (a tick on the kick and a thump on the drop, on Android), **left-handed mode**, a **battery saver** that turns itself on for phones and at 20% battery, the **screen stays on** while it plays.
- **Installable** (a web app manifest and a small service worker): opens full-screen from the home screen and works offline once loaded.
- **Plain words.** "Aperture, Contrast, Burn, Grain, Bath, Bounce, Drift" became Brightness, Edge, Length, Dirt, Space, Groove, Wander. "Safelight, Latent Image, Dodge & Burn, Long Exposure, Rapid Fixer" became Slow roll, Minimal, Electro, Rave, Drum & bass. Buttons say what they do ("Fewer hits", "Spin left", "Export audio (WAV)").
- **Large targets.** Nothing you tap is smaller than 44 px; sliders are 44 px tall with a big thumb; the bass grid shows eight steps at a time with big cells.

### Left out of the phone view on purpose (and where it went)

| Left out | Why | Where it is |
|---|---|---|
| The help card | Replaced by two hints on first use and plain labels | Settings has a keyboard cheat sheet |
| Right-click menus, mouse-wheel levels | No right-click or wheel on a phone | Level sliders in *Beat*; the same actions are buttons |
| The 16-step bass grid in one row | Too small to tap | **Pro view** (Settings) shows all sixteen |
| Battery indicator, clock, "darkroom" mode | Clutter on a small screen | The battery saver still switches itself on |
| Clips, Journey, MIDI | Weaker on a phone, and used by few | Not carried over yet: see the roadmap |
| Quantise as a menu | Jargon | *Sound → When the drop lands* |

On a wide screen with a keyboard (Settings lists the keys) the sheet moves to the side, the dock floats at the bottom, and the keys play the bass.

## Fast, and measured

The audio and picture engines are DreVelopDrop's, which measured (against DevelopDrop 3.2.0, interleaved, offline render time for the same notes) 15 to 29% less CPU for the sound,
and 21% fewer full-screen passes, 82% fewer kaleidoscope pixels and 11 to 85% fewer draw calls per frame for the picture. See that repository's `tools/bench/` for the method and its caveats
(no wall-clock frame-time gain could be shown in a software-rendered test browser). Glass Groove has **developer mode** (Settings) with live numbers, switches and a benchmark.
Nothing here has been measured on a real phone yet.

## Running and testing

```
python -m http.server 5173        # then open http://localhost:5173/
node --test tests/logic.test.js tests/music.test.js tests/takes.test.js tests/share.test.js
```

61 tests: the sequencer and file formats (from DevelopDrop's), Takes' editing functions, and the share links.

```
index.html, takes.html           the two pages
src/ui/                          the interface, one concern per file (sheets, perform, surface, play, beat, sound, look, keep, settings, extras)
src/takes/                       Takes: the library page, the timeline editor (edit.js is pure), offline render, the video trimmer
src/engine/, src/perf/, src/visual/, src/rec/    audio, sequencer, file formats, the picture, recording (shared with DreVelopDrop)
src/share.js                     beats as links
```

## Feedback and re-use

Feedback, suggestions and requests are very welcome: open an issue or get in touch. Glass Groove is still being tinkered with and tested, so ready-made re-use licences are not defined yet.
Until they are, all rights are reserved: please ask permission before re-using any of it, and before any commercial use. Whether and how to license it more openly will be reviewed later.
The vendored LAME encoder keeps its own LGPL licence.
