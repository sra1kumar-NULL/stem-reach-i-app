/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AVATAR_FG, AVATAR_PALETTE, avatarColor, classAccuracy, contrast, participationRows, pctOrDash, revisedLabel } from './reports.ts';

test('pctOrDash shows "-" without answers', () => {
  assert.equal(pctOrDash(0, 0), '-');
  assert.equal(pctOrDash(0, 3), '0%');
  assert.equal(pctOrDash(0.756, 4), '76%');
});

test('classAccuracy ignores students with no answers', () => {
  assert.deepEqual(classAccuracy([]), { value: 0, answered: 0 });
  assert.deepEqual(classAccuracy([{ avg_accuracy: 0, questions_answered: 0 }]), { value: 0, answered: 0 });
  const r = classAccuracy([
    { avg_accuracy: 1, questions_answered: 2 },
    { avg_accuracy: 0.5, questions_answered: 2 },
    { avg_accuracy: 0, questions_answered: 0 },
  ]);
  assert.equal(r.value, 0.75);
  assert.equal(r.answered, 4);
});

test('participation rows: pending first, alphabetical within groups', () => {
  const rows = participationRows({
    done: [
      { id: 'd2', name: 'Zed', answered: 3, completed: false },
      { id: 'd1', name: 'Asha', answered: 15, completed: true },
    ],
    pending: [
      { id: 'p2', name: 'Meera' },
      { id: 'p1', name: 'Bala' },
    ],
  });
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'p2', 'd1', 'd2']);
  assert.equal(revisedLabel(rows[0], 15), 'Not started yet');
  assert.equal(revisedLabel(rows[3], 15), 'Revised 3/15');
  assert.equal(revisedLabel(rows[3], null), 'Revised 3');
  assert.equal(revisedLabel(rows[3], 2), 'Revised 3');
  assert.equal(revisedLabel(rows[2], 15), 'Revised 15, all done');
});

test('avatar colour is stable and every fill keeps >= 4.5:1 with the initial', () => {
  assert.equal(avatarColor('abc'), avatarColor('abc'));
  for (const c of AVATAR_PALETTE) assert.ok(contrast(AVATAR_FG, c) >= 4.5, c);
});
