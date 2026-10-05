// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeProblems, validateConfig } from './config.ts';

const good = { apiUrl: 'https://api.example.com', supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' };

test('dev builds accept anything (fallbacks apply)', () => {
  assert.deepEqual(validateConfig({}, true), []);
  assert.deepEqual(validateConfig({ apiUrl: 'nonsense' }, true), []);
});

test('production build with complete config is fine', () => {
  assert.deepEqual(validateConfig(good, false), []);
});

test('production build reports every missing value by name', () => {
  const names = validateConfig({}, false).map((p) => p.name);
  assert.deepEqual(names, ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']);
});

test('blank strings count as missing', () => {
  assert.equal(validateConfig({ ...good, apiUrl: '   ', supabaseAnonKey: '' }, false).length, 2);
});

test('invalid or localhost URLs are rejected in production', () => {
  assert.match(describeProblems(validateConfig({ ...good, apiUrl: 'api.example.com' }, false))[0]!, /not a valid/);
  assert.match(describeProblems(validateConfig({ ...good, apiUrl: 'http://localhost:3000' }, false))[0]!, /localhost/);
  assert.match(describeProblems(validateConfig({ ...good, apiUrl: 'http://127.0.0.1:3000' }, false))[0]!, /localhost/);
  assert.match(describeProblems(validateConfig({ ...good, supabaseUrl: 'ftp://x' }, false))[0]!, /EXPO_PUBLIC_SUPABASE_URL/);
});
