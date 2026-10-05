// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { homeFor, isRoleArea, routeGuard } from './route-guard.ts';

test('signed-out visitors to protected areas go to /login', () => {
  for (const segment of ['(student)', '(teacher)', 'profile']) {
    assert.equal(routeGuard({ signedIn: false, segment }), '/login', segment);
  }
});

test('open routes never redirect', () => {
  for (const segment of [undefined, null, '', '(self-study)', 'forgot-password', 'reset-password', 'login', 'signup', 'unknown']) {
    assert.equal(routeGuard({ signedIn: false, segment }), null, String(segment));
  }
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: '(self-study)' }), null);
  assert.equal(routeGuard({ signedIn: true, role: 'teacher', segment: 'reset-password' }), null);
  assert.equal(routeGuard({ signedIn: true, role: 'student', mustChange: true, segment: '(self-study)' }), null);
});

test('wrong role is sent to its own home', () => {
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: '(teacher)' }), '/(student)');
  assert.equal(routeGuard({ signedIn: true, role: 'teacher', segment: '(student)' }), '/(teacher)');
});

test('right role and role-less screens render', () => {
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: '(student)' }), null);
  assert.equal(routeGuard({ signedIn: true, role: 'teacher', segment: '(teacher)' }), null);
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: 'profile' }), null);
  assert.equal(routeGuard({ signedIn: true, role: 'teacher', segment: 'profile' }), null);
});

test('unknown role never redirects a signed-in user between areas', () => {
  assert.equal(routeGuard({ signedIn: true, role: undefined, segment: '(teacher)' }), null);
  assert.equal(routeGuard({ signedIn: true, role: null, segment: '(student)' }), null);
});

test('signed-in users on /login or /signup go home', () => {
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: 'login' }), '/(student)');
  assert.equal(routeGuard({ signedIn: true, role: 'teacher', segment: 'signup' }), '/(teacher)');
  assert.equal(routeGuard({ signedIn: true, role: undefined, segment: 'login' }), '/');
});

test('must-change-password wins over everything protected', () => {
  for (const segment of ['(student)', '(teacher)', 'profile', 'login', 'signup']) {
    assert.equal(routeGuard({ signedIn: true, role: 'student', mustChange: true, segment }), '/change-password', segment);
  }
  assert.equal(routeGuard({ signedIn: true, mustChange: true, segment: 'change-password' }), null);
});

test('change-password needs a session', () => {
  assert.equal(routeGuard({ signedIn: false, segment: 'change-password' }), '/login');
  assert.equal(routeGuard({ signedIn: true, role: 'student', segment: 'change-password' }), null);
});

test('mustChange is ignored when signed out', () => {
  assert.equal(routeGuard({ signedIn: false, mustChange: true, segment: '(student)' }), '/login');
});

test('helpers', () => {
  assert.equal(homeFor('teacher'), '/(teacher)');
  assert.equal(homeFor('student'), '/(student)');
  assert.equal(homeFor(undefined), '/');
  assert.equal(isRoleArea('(student)'), true);
  assert.equal(isRoleArea('profile'), false);
  assert.equal(isRoleArea(undefined), false);
});
