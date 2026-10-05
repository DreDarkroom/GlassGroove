# Tests

`npm test` runs the module check first (`tools/check-modules.mjs`: every relative import must exist), then the tests with Node's built-in runner (no dependencies):

| File | What it covers |
|---|---|
| `logic.test.js` | The sequencer, the file formats and the recorder (inherited from DevelopDrop / DreVelopDrop) |
| `music.test.js` | Patterns, styles, loops and clips |
| `takes.test.js` | Takes: the editing functions, the library format |
| `share.test.js` | Beats as links: encode, decode, validate |
| `surge.test.js` | Surge: the drop lands on a bar line, can be moved and cancelled; a long stall skips missed ticks without losing bars or doubling the drop |

Browser behaviour (touch gestures, the Back button, audio, the service worker, screen readers) is not covered by these: check it on a phone. The list of what has and has not been verified is in `ROADMAP.md`.
