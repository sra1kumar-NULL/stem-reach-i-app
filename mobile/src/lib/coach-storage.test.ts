// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  coachKey,
  getSwipeCount,
  type KeyValueStore,
  markCoachSeen,
  recordSwipe,
  resetCoachSession,
  shouldShowCoach,
  shouldShowSwipeCue,
  SWIPE_CUE_LIMIT,
  swipesKey,
} from './coach-storage.ts';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

const broken: KeyValueStore = {
  getItem: async () => {
    throw new Error('storage unavailable');
  },
  setItem: async () => {
    throw new Error('storage unavailable');
  },
};

beforeEach(() => resetCoachSession());

test('keys are namespaced per user', () => {
  assert.equal(coachKey('u1'), 'coach_v1:u1');
  assert.equal(swipesKey('u1'), 'feed_swipes_v1:u1');
});

test('coach shows on first load, then never again (persisted)', async () => {
  const store = memoryStore();
  assert.equal(await shouldShowCoach(store, 'u1'), true);
  await markCoachSeen(store, 'u1');
  assert.equal(store.data.get('coach_v1:u1'), '1');
  assert.equal(await shouldShowCoach(store, 'u1'), false);
  // a fresh session still sees the stored flag
  resetCoachSession();
  assert.equal(await shouldShowCoach(store, 'u1'), false);
});

test('coach is per user', async () => {
  const store = memoryStore();
  await markCoachSeen(store, 'u1');
  assert.equal(await shouldShowCoach(store, 'u2'), true);
});

test('storage failure: shows once per session, not repeatedly', async () => {
  assert.equal(await shouldShowCoach(broken, 'u1'), true);
  await markCoachSeen(broken, 'u1'); // must not throw
  assert.equal(await shouldShowCoach(broken, 'u1'), false);
});

test('swipe cue stops after the limit and persists the count', async () => {
  const store = memoryStore();
  for (let i = 0; i < SWIPE_CUE_LIMIT; i++) {
    assert.equal(await shouldShowSwipeCue(store, 'u1'), true);
    await recordSwipe(store, 'u1');
  }
  assert.equal(await getSwipeCount(store, 'u1'), SWIPE_CUE_LIMIT);
  assert.equal(await shouldShowSwipeCue(store, 'u1'), false);
  assert.equal(store.data.get('feed_swipes_v1:u1'), String(SWIPE_CUE_LIMIT));
});

test('swipe cue fails safe when storage throws (in-memory count still limits it)', async () => {
  for (let i = 0; i < SWIPE_CUE_LIMIT; i++) await recordSwipe(broken, 'u1');
  assert.equal(await shouldShowSwipeCue(broken, 'u1'), false);
});

test('garbage stored count is treated as zero', async () => {
  const store = memoryStore();
  store.data.set('feed_swipes_v1:u1', 'banana');
  assert.equal(await getSwipeCount(store, 'u1'), 0);
  store.data.set('feed_swipes_v1:u1', '-3');
  assert.equal(await getSwipeCount(store, 'u1'), 0);
});
