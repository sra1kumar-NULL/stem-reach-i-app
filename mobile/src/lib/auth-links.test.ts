// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cooldownRemaining,
  DEFAULT_WEB_URL,
  isValidEmail,
  parseRecoveryError,
  resetRedirectUrl,
  validateNewPassword,
} from './auth-links.ts';

test('resetRedirectUrl: web uses its own origin, native uses the hosted app', () => {
  assert.equal(resetRedirectUrl({ isWeb: true, origin: 'http://localhost:8081' }), 'http://localhost:8081/reset-password');
  assert.equal(resetRedirectUrl({ isWeb: false }), `${DEFAULT_WEB_URL}/reset-password`);
  assert.equal(resetRedirectUrl({ isWeb: false, webUrl: 'https://example.com/' }), 'https://example.com/reset-password');
  assert.equal(resetRedirectUrl({ isWeb: true }), `${DEFAULT_WEB_URL}/reset-password`, 'web without an origin falls back');
});

test('isValidEmail', () => {
  assert.equal(isValidEmail(' a@b.co '), true);
  assert.equal(isValidEmail('nope'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
});

test('validateNewPassword: length then match', () => {
  assert.match(validateNewPassword('short', 'short') ?? '', /at least 8/);
  assert.match(validateNewPassword('longenough1', 'different1') ?? '', /match/);
  assert.equal(validateNewPassword('longenough1', 'longenough1'), null);
});

test('parseRecoveryError: expired, invalid, and absent', () => {
  assert.match(
    parseRecoveryError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid') ?? '',
    /expired/,
  );
  assert.match(parseRecoveryError('#error=access_denied') ?? '', /not valid/);
  assert.match(parseRecoveryError('?error=server_error&error_code=unexpected_failure') ?? '', /not valid/);
  assert.equal(parseRecoveryError(''), null);
  assert.equal(parseRecoveryError('#access_token=abc&type=recovery'), null, 'a good recovery link is not an error');
});

test('cooldownRemaining counts down and never goes negative', () => {
  assert.equal(cooldownRemaining(null, 1000), 0);
  assert.equal(cooldownRemaining(0, 0), 60);
  assert.equal(cooldownRemaining(0, 30_500), 30);
  assert.equal(cooldownRemaining(0, 60_000), 0);
  assert.equal(cooldownRemaining(0, 90_000), 0);
});
