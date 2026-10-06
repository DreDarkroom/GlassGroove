import test from 'node:test';
import assert from 'node:assert/strict';
import { createStack } from '../src/ui/stack.js';

/* In the app the first layer sits at history depth 2 (0 is the page we came from, 1 is the app itself), the next at 3, and so on. */

test('a layer can be pushed, found, and released; releasing the innermost one asks the browser to go back once', () => {
  const S = createStack();
  assert.equal(S.open('layer1'), false);
  S.push('layer1', () => {}, () => true, () => 2);
  assert.equal(S.open('layer1'), true);
  let backs = 0;
  S.release('layer1', () => 2, () => { backs++; return true; });
  assert.equal(S.open('layer1'), false);
  assert.equal(backs, 1);
  assert.equal(S.skip, 1, 'the popstate that follows is one to ignore');
  S.popstate({ d: 1 }, () => assert.fail('must not ask to leave'));
  assert.equal(S.skip, 0);
});

test('Back closes the innermost layer only, then asks to leave at the root', () => {
  const S = createStack();
  let closed = [];
  S.push('a', () => closed.push('a'), () => true, () => 2);
  S.push('b', () => closed.push('b'), () => true, () => 3);
  S.popstate({ d: 2 }, () => assert.fail('not yet'));
  assert.deepEqual(closed, ['b']);
  assert.equal(S.open('a'), true);
  S.popstate({ d: 1 }, () => {});
  assert.deepEqual(closed, ['b', 'a']);
  let left = false;
  S.popstate({ gg: 'root' }, () => { left = true; });
  assert.equal(left, true);
});

test('a layer the browser would not give a history step to is never closed by Back, and releasing it does not go back', () => {
  const S = createStack();
  let closed = 0, backs = 0;
  S.push('x', () => { closed++; }, () => false, () => 5);                  // pushState refused
  S.popstate({ d: 1 }, () => {});
  assert.equal(closed, 0);
  S.release('x', () => 5, () => { backs++; return true; });
  assert.equal(backs, 0);
});

test('a duplicate push is ignored, and a failed history.back() does not leave a stray skip', () => {
  const S = createStack();
  assert.equal(S.push('a', () => {}, () => true, () => 2), true);
  assert.equal(S.push('a', () => {}, () => true, () => 3), false);
  S.release('a', () => 2, () => false);
  assert.equal(S.skip, 0);
});
