// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { onSignOut, runSignOutCleanups } from './session-cleanup.ts';

test('cleanups run on sign-out, a throwing one does not block the rest, unsubscribe works', () => {
  const calls: string[] = [];
  const offA = onSignOut(() => calls.push('a'));
  onSignOut(() => {
    throw new Error('boom');
  });
  onSignOut(() => calls.push('c'));
  runSignOutCleanups();
  assert.deepEqual(calls, ['a', 'c']);
  offA();
  runSignOutCleanups();
  assert.deepEqual(calls, ['a', 'c', 'c']);
});
