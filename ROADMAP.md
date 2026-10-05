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

## Developer and debugging modes, and watching resources

Developer mode exists today (Settings, or `?dev=1`): live frame time by section, audio nodes and sounds a second, scheduler lead, memory, switches for each costly part, a benchmark and a log.
What it does not do yet, in order of how much it would help on a phone:

- **A phone-sized panel.** Today's panel is a desktop-style overlay. Make it a bottom sheet with big switches, and a *Copy report* button that puts the numbers, the device and the settings on the clipboard, so a test on a phone can be pasted into a message.
- **Audio health first.** Dropouts and glitches matter more than frame rate for a music app: count underruns (a late scheduler tick, `AudioContext` `baseLatency` and `outputLatency`, and the render-capacity numbers where the browser gives them), and flag them in the log with what was happening (a Rise, a drop, a recording).
- **Frame rate and long frames.** Frames a second, the worst frame in the last ten seconds, and a count of long tasks (`PerformanceObserver`). Show a small trace, not just a number, so a stutter at the drop is visible.
- **Battery and heat, where the browser allows.** The Battery API (level, charging, and drain a minute) works on Chrome for Android but not on iPhone. Where it is missing, say so instead of showing zero. Heat is not exposed to web pages, so the proxy is a falling frame rate or rising scheduler lag after several minutes: a **soak test** mode that runs Autopilot for 10 to 30 minutes and logs those against battery, to show whether the phone is struggling.
- **Memory.** Heap size where `performance.memory` or `measureUserAgentSpecificMemory` exist, plus our own counts (decoded recordings, canvas sizes, live audio nodes) so a leak shows up as a number that only goes up.
- **GPU.** Web pages cannot read GPU load. The honest substitutes: picture cost per frame (canvas passes and pixels, which are counted exactly), the renderer name from `WEBGL_debug_renderer_info` to know what hardware is running, and the quality switches that trade picture for speed. No fake "GPU %" gauge.
- **Automatic quality.** Use those numbers: if the frame rate stays low or the scheduler lead shrinks, lower the picture quality a step and say so, and bring it back when there is room.
- **Saved test runs.** Keep the last few soak and benchmark runs on the device with the device model, so changes between versions can be compared, with the measurement caveats written next to the numbers.
- **Opt-in only.** Nothing is sent anywhere. A report leaves the device only when a person copies it.

## Hands-free use

Autopilot is meant for when your hands are busy, so it needs to be dependable: keep the screen awake and recover if the audio is interrupted (a phone call, switching apps), show a clear *Autopilot is running* state, a large Stop, and lock-screen controls (Media Session) so playback can be paused without finding the page.

## Principles

- One hand, one thumb: nothing important is out of reach, nothing tappable is small.
- Words say what a thing does.
- Nothing leaves the device unless a person sends it.
- Every file or link that comes in is validated before anything changes.
- A speed-up has to be measured, and the measurement has to be written down, including when it did not show up.
