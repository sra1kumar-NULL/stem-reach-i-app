// Runs under Node's built-in test runner (`npm test` → node --experimental-strip-types --test).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  csvEscape,
  csvTemplate,
  IMPORT_MAX_ROWS,
  parseCorrect,
  parseDelimited,
  parseImport,
  toCsv,
} from './question-import.ts';

const HEADER = 'type,difficulty,language,text,option1,option2,option3,option4,correct,answer,explanation,chapter_no,section_no';

test('parseDelimited: quoted commas, escaped quotes and newlines inside cells', () => {
  const rows = parseDelimited('a,"b,c","say ""hi""","line1\nline2"\nx,y,z,w', ',');
  assert.deepEqual(rows, [
    ['a', 'b,c', 'say "hi"', 'line1\nline2'],
    ['x', 'y', 'z', 'w'],
  ]);
});

test('parseDelimited: CRLF, lone CR, BOM, trailing newline and empty cells', () => {
  assert.deepEqual(parseDelimited('﻿a,b\r\nc,\r\n', ','), [['a', 'b'], ['c', '']]);
  assert.deepEqual(parseDelimited('a,b\rc,d', ','), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseDelimited('a\t"b\tc"\n', '\t'), [['a', 'b\tc']]);
  assert.deepEqual(parseDelimited('a,,\n', ','), [['a', '', '']]);
});

test('parseDelimited: unclosed quote throws', () => {
  assert.throws(() => parseDelimited('a,"b\nc', ','), /never closed/);
});

test('csv escape and round trip', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('q"q'), '"q""q"');
  const rows = [['x', 'a,b', 'two\nlines', 'ಕನ್ನಡ']];
  assert.deepEqual(parseDelimited(toCsv(rows), ','), rows);
});

test('parseCorrect maps 1-4 and A-D to 0-3, JSON numbers stay zero based', () => {
  assert.equal(parseCorrect('1'), 0);
  assert.equal(parseCorrect('4'), 3);
  assert.equal(parseCorrect('a'), 0);
  assert.equal(parseCorrect(' D '), 3);
  assert.equal(parseCorrect('0'), undefined);
  assert.equal(parseCorrect('5'), undefined);
  assert.equal(parseCorrect('E'), undefined);
  assert.equal(parseCorrect(0, true), 0);
  assert.equal(parseCorrect(3, true), 3);
  assert.equal(parseCorrect(4, true), undefined);
  assert.equal(parseCorrect(1.5, true), undefined);
});

test('CSV: mcq and flashcard rows with chapter/section columns', () => {
  const csv = [
    HEADER,
    'mcq,easy,en,"What, exactly?",A1,B2,C3,D4,C,,Because.,2,2.1',
    'flashcard,,kn,ಪ್ರಶ್ನೆ?,,,,,,ಉತ್ತರ,ವಿವರಣೆ,2,2.1',
  ].join('\r\n');
  const r = parseImport(csv);
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], {
    type: 'mcq',
    difficulty: 'easy',
    language: 'en',
    text: 'What, exactly?',
    options: ['A1', 'B2', 'C3', 'D4'],
    correct: 2,
    explanation: 'Because.',
    chapter_no: 2,
    section_no: '2.1',
  });
  assert.equal(r.rows[1].text, 'ಪ್ರಶ್ನೆ?');
  assert.equal(r.rows[1].answer, 'ಉತ್ತರ');
  assert.equal(r.rows[1].language, 'kn');
  assert.equal(r.rows[1].options, undefined);
});

test('CSV: BOM, TSV autodetect, missing optional columns and type inference', () => {
  const tsv = '﻿text\toption1\toption2\toption3\toption4\tcorrect\texplanation\tchapter_no\tsection_no\nQ1\ta\tb\tc\td\t2\tbecause\t1\t1.1\nQ2\t\t\t\t\t\twhy\t1\t1.1';
  const r = parseImport(tsv);
  assert.equal(r.format, 'tsv');
  // Q2 has no answer → flashcard without answer → problem
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].type, 'mcq');
  assert.equal(r.rows[0].correct, 1);
  assert.deepEqual(r.problems.map((p) => p.row), [2]);
  assert.match(r.problems[0].message, /answer is required/);
});

test('CSV: newline inside a quoted cell stays one row', () => {
  const csv = `${HEADER}\nflashcard,,,"Line one\nline two",,,,,,"ans, with comma",why,1,1.1\n`;
  const r = parseImport(csv);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].text, 'Line one\nline two');
  assert.equal(r.rows[0].answer, 'ans, with comma');
});

test('CSV: invalid correct, bad type, short options and missing explanation are per-row problems', () => {
  const csv = [
    HEADER,
    'mcq,,,Q1,a,b,c,d,E,,why,1,1.1',
    'essay,,,Q2,,,,,,x,why,1,1.1',
    'mcq,,,Q3,a,b,,d,2,,why,1,1.1',
    'flashcard,,,Q4,,,,,,ans,,1,1.1',
    'flashcard,hardest,fr,Q5,,,,,,ans,why,1,1.1',
  ].join('\n');
  const r = parseImport(csv);
  assert.equal(r.rows.length, 0);
  const byRow = (n: number) => r.problems.filter((p) => p.row === n).map((p) => p.message).join(' | ');
  assert.match(byRow(1), /correct "E" must be 1-4 or A-D/);
  assert.match(byRow(2), /type "essay"/);
  assert.match(byRow(3), /exactly 4 non-empty options/);
  assert.match(byRow(4), /explanation is required/);
  assert.match(byRow(5), /difficulty "hardest"/);
  assert.match(byRow(5), /language "fr"/);
});

test('CSV: missing text column is fatal', () => {
  const r = parseImport('type,explanation\nmcq,why');
  assert.match(r.fatal ?? '', /"text" column/);
});

test('target: rows need chapter_no+section_no unless a default topic is chosen', () => {
  const csv = 'text,answer,explanation\nQ,A,E';
  const without = parseImport(csv);
  assert.equal(without.rows.length, 0);
  assert.match(without.problems[0].message, /no topic/);
  const withDefault = parseImport(csv, { hasDefaultTarget: true });
  assert.equal(withDefault.rows.length, 1);
  assert.equal(withDefault.rows[0].chapter_no, undefined);
  const half = parseImport('text,answer,explanation,chapter_no\nQ,A,E,3', { hasDefaultTarget: true });
  assert.match(half.problems[0].message, /given together/);
});

test('more than 200 rows is a fatal error, exactly 200 is fine', () => {
  const lines = (n: number) =>
    ['text,answer,explanation', ...Array.from({ length: n }, (_, i) => `Q${i},A,E`)].join('\n');
  const over = parseImport(lines(IMPORT_MAX_ROWS + 1), { hasDefaultTarget: true });
  assert.match(over.fatal ?? '', /Too many rows: 201/);
  assert.equal(over.rows.length, 0);
  const ok = parseImport(lines(IMPORT_MAX_ROWS), { hasDefaultTarget: true });
  assert.equal(ok.fatal, undefined);
  assert.equal(ok.rows.length, 200);
});

test('limits mirror the schema (text 500, option 200, answer 1000)', () => {
  const r = parseImport(
    `text,option1,option2,option3,option4,correct,explanation\n${'x'.repeat(501)},a,b,c,${'y'.repeat(201)},1,why`,
    { hasDefaultTarget: true },
  );
  const msgs = r.problems.map((p) => p.message).join(' | ');
  assert.match(msgs, /text is 501 characters/);
  assert.match(msgs, /option 4 is longer than 200/);
});

test('JSON: array of rows with zero-based correct and question_text alias', () => {
  const json = JSON.stringify([
    { type: 'mcq', question_text: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 0, explanation: 'e', chapter_no: 1, section_no: '1.1' },
    { type: 'flashcard', text: 'ಕನ್ನಡ', answer: 'a', explanation: 'e', chapter_no: 1, section_no: '1.1' },
  ]);
  const r = parseImport(json);
  assert.equal(r.format, 'json');
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows[0].correct, 0);
  assert.equal(r.rows[1].text, 'ಕನ್ನಡ');
});

test('JSON: string correct uses the CSV convention; non-object rows are reported once', () => {
  const r = parseImport(
    JSON.stringify([
      { text: 'Q', options: ['a', 'b', 'c', 'd'], correct: 'D', explanation: 'e' },
      'oops',
    ]),
    { hasDefaultTarget: true },
  );
  assert.equal(r.rows[0].correct, 3);
  assert.deepEqual(r.problems, [{ row: 2, message: 'row must be an object' }]);
});

test('JSON: SeedContent shape is flattened with chapter_no and section_no', () => {
  const seed = {
    chapter: { ncert_no: 4, name: 'C', subject: 'physics' },
    sections: [
      { section_no: '4.1', name: 'A', questions: [{ type: 'flashcard', text: 'Q1', answer: 'a', explanation: 'e' }] },
      { section_no: '4.2', name: 'B', questions: [{ type: 'flashcard', text: 'Q2', answer: 'a', explanation: 'e' }] },
    ],
  };
  const r = parseImport(JSON.stringify(seed));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.chapter_no, x.section_no]), [[4, '4.1'], [4, '4.2']]);
});

test('JSON: syntax errors and unknown shapes are fatal with a friendly message', () => {
  assert.match(parseImport('[{"a":').fatal ?? '', /not valid JSON/);
  assert.match(parseImport('{"foo":1}').fatal ?? '', /Expected a JSON array/);
  assert.match(parseImport('   ').fatal ?? '', /Paste some questions/);
  assert.match(parseImport('[]').fatal ?? '', /No questions found/);
});

test('the downloadable template parses cleanly', () => {
  const r = parseImport(csvTemplate());
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].correct, 1);
  assert.equal(r.rows[1].language, 'kn');
  assert.ok(csvTemplate().startsWith('type,difficulty,language,text,option1'));
});
