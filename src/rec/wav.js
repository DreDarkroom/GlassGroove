/* Glass Groove: WAV writing. Pure functions (no browser APIs) so they can be tested in Node.
   24-bit PCM is lossless for everything this instrument makes; the header is written first with placeholder sizes and patched when the recording
   ends, so a long set can be streamed to disk without holding it in memory. */
export const MAX_DATA_BYTES = 0xffffffff - 44 - 8;       // RIFF sizes are 32-bit: about 4 GB per file

/** 44-byte PCM WAV header. */
export function header(sampleRate, channels, bits, dataBytes) {
  const b = new DataView(new ArrayBuffer(44)), blockAlign = channels * (bits / 8);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); b.setUint32(4, Math.min(0xffffffff, 36 + dataBytes), true); str(8, 'WAVE'); str(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, channels, true); b.setUint32(24, sampleRate, true);
  b.setUint32(28, sampleRate * blockAlign, true); b.setUint16(32, blockAlign, true); b.setUint16(34, bits, true);
  str(36, 'data'); b.setUint32(40, Math.min(0xffffffff, dataBytes), true);
  return new Uint8Array(b.buffer);
}

/** Interleave two float channels (-1..1) into little-endian 24-bit PCM. Clips instead of wrapping. */
export function pcm24(left, right) {
  const n = left.length, out = new Uint8Array(n * 6);
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      let v = (c ? right : left)[i];
      v = v > 1 ? 1 : v < -1 ? -1 : v;
      const s = Math.round(v < 0 ? v * 8388608 : v * 8388607);
      out[o++] = s & 255; out[o++] = (s >> 8) & 255; out[o++] = (s >> 16) & 255;
    }
  }
  return out;
}

/** A whole rendered buffer (two channels) as a finished 24-bit WAV file. */
export function wavFile(sampleRate, left, right) {
  const data = pcm24(left, right), out = new Uint8Array(44 + data.length);
  out.set(header(sampleRate, 2, 24, data.length), 0);
  out.set(data, 44);
  return out;
}
