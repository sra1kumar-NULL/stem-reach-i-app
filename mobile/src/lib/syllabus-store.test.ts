/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SyllabusResponse } from '@stemreach/core';

import { runSignOutCleanups } from './session-cleanup.ts';
import { createSyllabusStore, syllabusStore } from './syllabus-store.ts';

const tree = (n: number) => ({ chapters: [], n }) as unknown as SyllabusResponse;

test('concurrent gets share one request and the result is cached', async () => {
  const store = createSyllabusStore(() => 0);
  let calls = 0;
  const fetcher = async () => tree(++calls);
  const [a, b] = await Promise.all([store.get(fetcher), store.get(fetcher)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await store.get(fetcher);
  assert.equal(calls, 1);
});

test('invalidate forces a refetch; force skips the cache; ttl expires it', async () => {
  let t = 0;
  const store = createSyllabusStore(() => t, 1000);
  let calls = 0;
  const fetcher = async () => tree(++calls);
  await store.get(fetcher);
  store.invalidate();
  await store.get(fetcher);
  assert.equal(calls, 2);
  await store.get(fetcher, { force: true });
  assert.equal(calls, 3);
  t = 1500;
  await store.get(fetcher);
  assert.equal(calls, 4);
});

test('a response that was in flight during invalidate is not cached as fresh', async () => {
  const store = createSyllabusStore(() => 0);
  let release!: () => void;
  const slow = () => new Promise<SyllabusResponse>((res) => (release = () => res(tree(1))));
  const p = store.get(slow);
  store.invalidate();
  release();
  await p;
  let calls = 0;
  await store.get(async () => tree(++calls));
  assert.equal(calls, 1);
});

test('failures are not cached and clear on sign-out drops the tree', async () => {
  const store = createSyllabusStore(() => 0);
  await assert.rejects(store.get(async () => Promise.reject(new Error('x'))));
  assert.equal(store.peek(), null);
  await store.get(async () => tree(1));
  assert.ok(store.peek());

  await syllabusStore.get(async () => tree(2));
  assert.ok(syllabusStore.peek());
  runSignOutCleanups();
  assert.equal(syllabusStore.peek(), null);
});
