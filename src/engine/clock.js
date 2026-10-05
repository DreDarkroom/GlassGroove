/* Wipelight: the heartbeat. It lives in a Web Worker: browsers slow page timers to ~1/s in hidden or covered windows, but worker timers keep time.
   Built from a Blob so it also works from file://. Falls back to a plain interval if workers are unavailable. */
export function makeClock(onTick) {
  let running = false;
  const fallback = () => { let id = null; return { start: () => { clearInterval(id); id = setInterval(onTick, 30); }, stop: () => clearInterval(id) }; };
  try {
    const url = URL.createObjectURL(new Blob(['let id=null;onmessage=e=>{clearInterval(id);id=null;if(e.data==="start")id=setInterval(()=>postMessage(0),25)}'], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = onTick;
    let fb = null;
    w.onerror = () => { fb = fb || fallback(); if (running) fb.start(); };
    return { start: () => { running = true; if (fb) fb.start(); else w.postMessage('start'); }, stop: () => { running = false; w.postMessage('stop'); if (fb) fb.stop(); } };
  } catch (err) { return fallback(); }
}
