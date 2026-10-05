// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MSG_BAD_LOGIN, MSG_OFFLINE, MSG_SESSION_ENDED, MSG_TIMEOUT, MSG_TOO_MANY, toAuthError, toFriendlyError } from './friendly-error.ts';

class FakeApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

test('offline transport errors', () => {
  assert.equal(toFriendlyError(new TypeError('Failed to fetch')), MSG_OFFLINE);
  assert.equal(toFriendlyError(new Error('Network request failed')), MSG_OFFLINE);
});

test('timeout is never a raw "Aborted"', () => {
  assert.equal(toFriendlyError(new FakeApiError(0, 'timeout', 'x')), MSG_TIMEOUT);
  const abort = new Error('This operation was aborted');
  abort.name = 'AbortError';
  assert.equal(toFriendlyError(abort), MSG_TIMEOUT);
  assert.doesNotMatch(MSG_TIMEOUT, /abort/i);
});

test('401 is a finished session, not a server start-up', () => {
  const msg = toFriendlyError(new FakeApiError(401, 'unauthorized', 'nope'));
  assert.equal(msg, MSG_SESSION_ENDED);
  assert.doesNotMatch(msg, /server|start/i);
});

test('403 password_change_required and forbidden', () => {
  assert.match(toFriendlyError(new FakeApiError(403, 'password_change_required', 'x')), /new password/);
  assert.match(toFriendlyError(new FakeApiError(403, 'forbidden', 'x')), /access/);
  assert.equal(toFriendlyError(new FakeApiError(403, 'invalid_invite_code', 'Wrong invite code')), 'Wrong invite code');
});

test('5xx and passthrough of 4xx', () => {
  assert.match(toFriendlyError(new FakeApiError(503, 'http_error', 'HTTP 503')), /waking up/);
  assert.equal(toFriendlyError(new FakeApiError(400, 'bad', 'Pick a date')), 'Pick a date');
  assert.equal(toFriendlyError(new Error('weird'), 'fallback'), 'fallback');
});

test('auth errors', () => {
  assert.equal(toAuthError({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }), MSG_BAD_LOGIN);
  assert.equal(toAuthError({ message: 'Invalid login credentials' }), MSG_BAD_LOGIN);
  assert.equal(toAuthError({ message: 'email rate limit exceeded', status: 429 }), MSG_TOO_MANY);
  assert.equal(toAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }), MSG_OFFLINE);
  assert.equal(toAuthError(new TypeError('Failed to fetch')), MSG_OFFLINE);
  assert.equal(toAuthError(new Error('boom'), 'fb'), 'fb');
  assert.equal(toAuthError(undefined, 'fb'), 'fb');
});
