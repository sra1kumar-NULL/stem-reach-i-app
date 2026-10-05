// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allRemainingSkipped,
  canSkip,
  createQueue,
  isComplete,
  markAnswered,
  MAX_SKIPS,
  nextIndex,
  positionLabel,
  remainingCount,
  skipCard,
  skippedRemaining,
} from './feed-queue.ts';

test('empty queue is complete, nothing to skip or advance to', () => {
  const q = createQueue([]);
  assert.equal(isComplete(q), true);
  assert.equal(canSkip(q, 'a'), false);
  assert.equal(nextIndex(q, 0), -1);
  assert.equal(allRemainingSkipped(q), false);
});

test('duplicate ids are collapsed', () => {
  assert.deepEqual(createQueue(['a', 'b', 'a']).order, ['a', 'b']);
});

test('skip moves the card to the end and counts it', () => {
  const q = skipCard(createQueue(['a', 'b', 'c']), 'a');
  assert.deepEqual(q.order, ['b', 'c', 'a']);
  assert.equal(q.skips.a, 1);
  assert.equal(skippedRemaining(q), 1);
});

test('skipping the last remaining card is a no-op (nothing to move on to)', () => {
  const only = createQueue(['a']);
  assert.equal(canSkip(only, 'a'), false);
  assert.equal(skipCard(only, 'a'), only);

  // last in order, but earlier ones already answered
  let q = createQueue(['a', 'b', 'c']);
  q = markAnswered(markAnswered(q, 'a'), 'b');
  assert.equal(canSkip(q, 'c'), false);
  assert.deepEqual(skipCard(q, 'c').order, ['a', 'b', 'c']);
});

test('skip is capped per card', () => {
  let q = createQueue(['a', 'b']);
  // a, b, a, b: each card is skipped exactly MAX_SKIPS times
  for (let i = 0; i < MAX_SKIPS * 2; i++) {
    assert.equal(canSkip(q, q.order[0]), true);
    q = skipCard(q, q.order[0]);
  }
  assert.equal(q.skips.a, MAX_SKIPS);
  assert.equal(q.skips.b, MAX_SKIPS);
  assert.equal(canSkip(q, 'a'), false);
  assert.equal(canSkip(q, 'b'), false);
  assert.equal(skipCard(q, 'a'), q);
});

test('ordering over several skips', () => {
  let q = createQueue(['a', 'b', 'c', 'd']);
  q = skipCard(q, 'a'); // b c d a
  q = skipCard(q, 'b'); // c d a b
  assert.deepEqual(q.order, ['c', 'd', 'a', 'b']);
  q = markAnswered(q, 'c');
  assert.equal(nextIndex(q, 0), 1);
  q = markAnswered(q, 'd');
  assert.equal(nextIndex(q, 1), 2);
  assert.equal(allRemainingSkipped(q), true);
  assert.equal(remainingCount(q), 2);
});

test('all skipped out: never empties, finishing needs answers', () => {
  let q = createQueue(['a', 'b']);
  for (let i = 0; i < 4; i++) q = skipCard(q, q.order[0]);
  assert.equal(allRemainingSkipped(q), true);
  assert.equal(skippedRemaining(q), 2);
  assert.equal(isComplete(q), false);
  q = markAnswered(q, 'a');
  assert.equal(isComplete(q), false);
  q = markAnswered(q, 'b');
  assert.equal(isComplete(q), true);
  assert.equal(nextIndex(q, 0), -1);
});

test('answered cards cannot be skipped; unknown ids are ignored', () => {
  let q = createQueue(['a', 'b']);
  q = markAnswered(q, 'a');
  assert.equal(canSkip(q, 'a'), false);
  assert.equal(markAnswered(q, 'zzz'), q);
  assert.equal(skipCard(q, 'zzz'), q);
});

test('nextIndex wraps to an earlier unanswered card when none follow', () => {
  let q = createQueue(['a', 'b', 'c']);
  q = markAnswered(markAnswered(q, 'b'), 'c');
  assert.equal(nextIndex(q, 2), 0);
});

test('positionLabel agrees with the header counter and handles extra reviews', () => {
  assert.equal(positionLabel(1, 15), 'Question 1 of 15');
  assert.equal(positionLabel(15, 15), 'Question 15 of 15');
  assert.equal(positionLabel(16, 15), 'Extra practice');
  assert.equal(positionLabel(0, 15), 'Question 1 of 15');
  assert.equal(positionLabel(1, 0), 'Extra practice');
});
