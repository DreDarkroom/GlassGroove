# Wipelight: roadmap

## Shipped in 0.1

A new mobile-first interface over DreVelopDrop's engines: the dock and sheets, the Rise button, wipe and drip, the Beat editor (rings and an 8-step bass grid), vibes and moods, bass keys, Autopilot, tap tempo,
share links, record, Takes (replay editor, WAV and parts export, video trim), haptics, left-handed, battery saver, installable and offline, Pro view and developer mode.

## Next

- **Test it on real phones.** Frame rate, heat and battery on a mid-range Android and an iPhone, and tune the picture quality and the audio buffer from what is found. Nothing in this repository has been measured on a phone yet.
- **Bring back what was left out, as things that fit a phone:** a *Loop* button that captures the last four bars and layers it (clips, but one tap); a *Journey* slider that eases the speed and the picture up over a time you choose; MIDI in Pro view.
- **A tour that is not a wall of text:** four highlighted moments the first time you open each tab.
- **Wipe in more ways:** a finger leaves a coloured trail; two colours in the picture (mood plus a second hue from the press history); pinch to zoom the kaleidoscope's folds.
- **Share more than a beat:** a replay as a link (a few KB), and a short looping video of the picture for messages.
- **Takes on a phone:** drag handles on the timeline, waveform and loudness for exported audio, a one-tap *Trim* for videos with no re-encode (WebCodecs).
- **Two phones:** pair them by QR code (WebRTC) so one plays the picture and the other the controls.
- **Sound on phones:** move the heavy parts of the mix to an AudioWorklet.

## Principles

- One hand, one thumb: nothing important is out of reach, nothing tappable is small.
- Words say what a thing does.
- Nothing leaves the device unless a person sends it.
- Every file or link that comes in is validated before anything changes.
- A speed-up has to be measured, and the measurement has to be written down, including when it did not show up.
