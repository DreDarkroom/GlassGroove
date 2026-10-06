/**
 * A history stack logic for managing opened UI layers.
 * Needs no DOM, purely manages the stack array and popstate integration logic.
 */

export function createStack() {
  const stack = [];
  let skip = 0;
  
  const self = {
    get skip() { return skip; },
    get stack() { return stack; },
    
    depth: (state) => (state && state.d) || 0,
    
    push(name, close, canPushState, currentDepth) {
      if (stack.some((l) => l.name === name)) return false;
      const hist = canPushState();
      stack.push({ name, close, d: hist ? currentDepth() : Infinity, hist });
      return true;
    },
    
    release(name, currentDepth, backFn) {
      const i = stack.findIndex((l) => l.name === name);
      if (i < 0) return false;
      const [l] = stack.splice(i, 1);
      if (l.hist && i === stack.length && currentDepth() === l.d) {
        skip++;
        if (!backFn()) skip--;
      }
      return true;
    },
    
    open: (name) => stack.some((l) => l.name === name),
    
    popstate(state, askLeave) {
      if (skip > 0) { skip--; return; }
      const s = state || {};
      if (s.gg === 'root') return askLeave();
      const d = s.d || 1;
      while (stack.length && stack[stack.length - 1].hist && stack[stack.length - 1].d > d) {
        stack.pop().close();
      }
    }
  };
  
  return self;
}
