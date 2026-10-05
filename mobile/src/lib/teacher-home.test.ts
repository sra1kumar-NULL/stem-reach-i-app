/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  actionLabel,
  barHint,
  canSubmit,
  dateFromIso,
  liveQuestions,
  reconcileSelection,
  buildGroups,
  chapterSelection,
  defaultCollapsed,
  sameSelection,
  selectionTotals,
  statusLine,
  toggleChapterSelection,
  topicA11yLabel,
  topicTitle,
} from './teacher-home.ts';

const syllabus = {
  chapters: [
    {
      id: 'c1',
      name: 'Magnetic Effects of Electric Current',
      subject: 'physics',
      sections: [
        { id: 's1', section_no: '12.1', name: 'Magnetic Field and Field Lines', enabled_question_count: 10 },
        { id: 's2', section_no: '12.2', name: 'Force on a Conductor', enabled_question_count: 1 },
      ],
    },
    { id: 'c2', name: 'Empty', subject: 'chemistry', sections: [] },
  ],
};
const groups = buildGroups(syllabus);

test('topic title is the topic name, not the chapter', () => {
  assert.equal(groups[0].topics[0].no, '12.1');
  assert.equal(topicTitle(groups[0].topics[0]), 'Magnetic Field and Field Lines');
  assert.equal(topicTitle({ no: '3.1', name: '  ' }), '3.1');
  assert.equal(
    topicA11yLabel(groups[0].name, groups[0].topics[1]),
    '12.2 Force on a Conductor, Magnetic Effects of Electric Current, 1 live question',
  );
});

test('totals and chapter selection', () => {
  assert.deepEqual(selectionTotals(groups, new Set(['s1', 's2', 'zzz'])), { topics: 2, questions: 11 });
  assert.deepEqual(selectionTotals(groups, new Set()), { topics: 0, questions: 0 });
  assert.equal(chapterSelection(groups[0], new Set(['s1'])).state, 'mixed');
  assert.equal(chapterSelection(groups[0], new Set(['s1'])).summary, '1 of 2 topics selected');
  assert.equal(chapterSelection(groups[0], new Set(['s1', 's2'])).state, true);
  assert.equal(chapterSelection(groups[0], new Set()).state, false);
  assert.equal(chapterSelection(groups[1], new Set()).state, false);
  assert.equal(chapterSelection(groups[1], new Set()).summary, '0 of 0 topics selected');
});

test('select-all / clear toggle', () => {
  const all = toggleChapterSelection(groups[0], new Set(['s1']));
  assert.deepEqual([...all].sort(), ['s1', 's2']);
  const none = toggleChapterSelection(groups[0], all);
  assert.equal(none.size, 0);
  assert.deepEqual([...toggleChapterSelection(groups[0], new Set(['other']))].sort(), ['other', 's1', 's2']);
});

test('status, labels, comparison', () => {
  assert.equal(statusLine(0, 0), 'Nothing activated yet');
  assert.equal(statusLine(3, 49), '3 topics activated today · 49 live questions');
  assert.equal(statusLine(1, 1), '1 topic activated today · 1 live question');
  assert.equal(actionLabel(true), "Update today's topics");
  assert.equal(actionLabel(false), 'Activate for students');
  assert.equal(sameSelection(new Set(['a', 'b']), new Set(['b', 'a'])), true);
  assert.equal(sameSelection(new Set(['a']), new Set(['a', 'b'])), false);
  assert.equal(defaultCollapsed(3), false);
  assert.equal(defaultCollapsed(4), true);
});

test('sticky bar: disabled until the selection differs, hints, live counts', () => {
  assert.equal(canSubmit(0, true, false), false);
  assert.equal(canSubmit(2, false, false), false);
  assert.equal(canSubmit(2, true, true), false);
  assert.equal(canSubmit(2, true, false), true);
  assert.equal(barHint(0, false, false), 'Pick topics to activate');
  assert.equal(barHint(2, true, false), 'Matches what students see');
  assert.equal(barHint(2, true, true), 'Not saved yet');
  assert.equal(barHint(2, false, true), 'Not activated yet');
  assert.equal(liveQuestions(1), '1 live question');
  assert.equal(liveQuestions(0), '0 live questions');
  assert.equal(chapterSelection(groups[0], new Set(['s1'])).short, '1 of 2 selected');
});

test('totals equal the sum of per-topic live counts', () => {
  const t = selectionTotals(groups, new Set(['s1', 's2']));
  assert.equal(t.questions, groups[0].topics.reduce((n, x) => n + x.count, 0));
});

test('reconcileSelection keeps edits, follows untouched selection, drops removed topics', () => {
  const s = (...a: string[]) => new Set(a);
  assert.deepEqual([...reconcileSelection(s('a'), s('a'), s('a', 'b'), s('a', 'b'))].sort(), ['a', 'b']);
  assert.deepEqual([...reconcileSelection(s('a', 'c'), s('a'), s('a', 'b'), s('a', 'b', 'c'))].sort(), ['a', 'c']);
  assert.deepEqual([...reconcileSelection(s('a', 'gone'), s('a'), s('a'), s('a'))], ['a']);
});

test('dateFromIso is the same calendar day', () => {
  const d = dateFromIso('2026-10-04');
  assert.equal(d.getDate(), 4);
  assert.equal(d.getMonth(), 9);
});
