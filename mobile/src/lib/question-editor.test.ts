// Runs under Node's built-in test runner (`npm test`).
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCreatePayload,
  buildPatchPayload,
  duplicateForm,
  emptyForm,
  firstErrorField,
  formFromQuestion,
  hasErrors,
  insertAtSelection,
  isDirty,
  isLocked,
  LIMITS,
  mapServerError,
  nextFormKeepingSettings,
  previewVerdict,
  setOption,
  validateForm,
  type Options4,
} from './question-editor.ts';
import { SYMBOL_GROUPS } from './symbols.ts';

const SEC = '11111111-1111-4111-8111-111111111111';
const mcq = () => ({
  ...emptyForm({ section_id: SEC }),
  text: 'What is the SI unit of force?',
  options: ['Joule', 'Newton', 'Watt', 'Pascal'] as Options4,
  correct: 1,
  explanation: 'F = ma gives kg m/s2 = newton.',
});

test('validate: a complete MCQ has no errors', () => {
  assert.equal(hasErrors(validateForm(mcq())), false);
});

test('validate: empty form flags every required field in screen order', () => {
  const e = validateForm(emptyForm());
  assert.ok(e.section_id && e.text && e.explanation && e.correct);
  assert.deepEqual(e.options?.map(Boolean), [true, true, true, true]);
  assert.equal(firstErrorField(e), 'section_id');
});

test('validate: limits mirror the Zod schema (500 / 200 / 1000 / 1000)', () => {
  assert.deepEqual({ ...LIMITS }, { text: 500, option: 200, answer: 1000, explanation: 1000 });
  const f = mcq();
  f.text = 'x'.repeat(501);
  f.options = ['a'.repeat(201), 'b', 'c', 'd'];
  f.explanation = 'e'.repeat(1001);
  const e = validateForm(f);
  assert.match(e.text ?? '', /500/);
  assert.match(e.options?.[0] ?? '', /200/);
  assert.match(e.explanation ?? '', /1000/);
  assert.equal(validateForm({ ...mcq(), text: 'x'.repeat(500) }).text, undefined);
});

test('validate: whitespace-only text counts as empty; blank option is flagged', () => {
  assert.ok(validateForm({ ...mcq(), text: '   ' }).text);
  const f = mcq();
  f.options = ['Joule', ' ', 'Watt', 'Pascal'];
  const e = validateForm(f);
  assert.ok(e.options?.[1]);
  assert.equal(firstErrorField(e), 'opt1');
});

test('validate: unknown correct is acceptable when editing a server row that hides it', () => {
  const f = { ...mcq(), correct: null };
  assert.ok(validateForm(f).correct);
  assert.equal(validateForm(f, { correctUnknownOk: true }).correct, undefined);
});

test('validate: flashcard needs an answer, ignores options', () => {
  const f = { ...emptyForm({ section_id: SEC, type: 'flashcard' }), text: 'Define work', explanation: 'W = F d' };
  assert.ok(validateForm(f).answer);
  assert.equal(hasErrors(validateForm({ ...f, answer: 'Force times displacement' })), false);
});

test('create payload: MCQ has options+correct and no answer; flashcard the opposite', () => {
  const p = buildCreatePayload({ ...mcq(), answer: 'stale', text: '  trimmed  ' });
  assert.equal(p.text, 'trimmed');
  assert.deepEqual(p.options, ['Joule', 'Newton', 'Watt', 'Pascal']);
  assert.equal(p.correct, 1);
  assert.equal('answer' in p, false);
  assert.equal(p.status, 'published');
  const fc = buildCreatePayload({ ...mcq(), type: 'flashcard', answer: ' Newton ' });
  assert.equal(fc.answer, 'Newton');
  assert.equal('options' in fc, false);
  assert.equal('correct' in fc, false);
});

test('option/correct mapping: formFromQuestion reads options and correct (either key)', () => {
  const base = { section_id: SEC, type: 'mcq' as const, language: 'en' as const, difficulty: 'easy' as const, question_text: 'Q', options: ['a', 'b', 'c', 'd'], answer: null, explanation: 'E' };
  assert.equal(formFromQuestion({ ...base, correct_option: 2 }).correct, 2);
  assert.equal(formFromQuestion({ ...base, correct: 3 }).correct, 3);
  assert.equal(formFromQuestion(base).correct, null);
  const fc = formFromQuestion({ ...base, type: 'flashcard', options: null, answer: 'A', correct_option: 1 });
  assert.equal(fc.correct, null);
  assert.deepEqual(fc.options, ['', '', '', '']);
  assert.equal(fc.status, 'published');
});

test('setOption returns a new tuple and leaves the original alone', () => {
  const o: Options4 = ['a', 'b', 'c', 'd'];
  const n = setOption(o, 2, 'X');
  assert.deepEqual(n, ['a', 'b', 'X', 'd']);
  assert.deepEqual(o, ['a', 'b', 'c', 'd']);
});

test('patch payload: unchanged form is empty and not dirty', () => {
  const o = mcq();
  assert.deepEqual(buildPatchPayload(o, { ...o }), {});
  assert.equal(isDirty(o, { ...o }), false);
});

test('patch payload: only changed fields are sent', () => {
  const o = mcq();
  assert.deepEqual(buildPatchPayload(o, { ...o, difficulty: 'hard' }), { difficulty: 'hard' });
  assert.deepEqual(buildPatchPayload(o, { ...o, explanation: 'New why' }), { explanation: 'New why' });
  assert.deepEqual(buildPatchPayload(o, { ...o, status: 'draft', language: 'kn' }), { status: 'draft', language: 'kn' });
  // whitespace-only difference is not a change
  assert.deepEqual(buildPatchPayload(o, { ...o, text: o.text + '  ' }), {});
});

test('patch payload: changing one option sends the whole options array, not correct', () => {
  const o = mcq();
  const p = buildPatchPayload(o, { ...o, options: setOption(o.options, 0, 'Erg') });
  assert.deepEqual(p, { options: ['Erg', 'Newton', 'Watt', 'Pascal'] });
  assert.deepEqual(buildPatchPayload(o, { ...o, correct: 3 }), { correct: 3 });
});

test('patch payload: type switch ships the full target shape', () => {
  const o = mcq();
  const toFc = buildPatchPayload(o, { ...o, type: 'flashcard', answer: 'Newton' });
  assert.deepEqual(toFc, { type: 'flashcard', answer: 'Newton' });
  const fc = { ...o, type: 'flashcard' as const, answer: 'Newton', correct: null };
  const toMcq = buildPatchPayload(fc, { ...fc, type: 'mcq', correct: 0, options: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(toMcq, { type: 'mcq', options: ['a', 'b', 'c', 'd'], correct: 0 });
});

test('patch payload: picking a correct option when the server hid it counts as a change', () => {
  const o = { ...mcq(), correct: null };
  assert.deepEqual(buildPatchPayload(o, { ...o, correct: 2 }), { correct: 2 });
});

test('save & add another keeps section, difficulty, language, status, type; clears content', () => {
  const f = { ...mcq(), difficulty: 'hard' as const, language: 'kn' as const, status: 'draft' as const };
  const n = nextFormKeepingSettings(f);
  assert.equal(n.section_id, SEC);
  assert.equal(n.difficulty, 'hard');
  assert.equal(n.language, 'kn');
  assert.equal(n.status, 'draft');
  assert.equal(n.text, '');
  assert.deepEqual(n.options, ['', '', '', '']);
  assert.equal(n.correct, null);
});

test('duplicate keeps content, becomes a draft, and does not alias options', () => {
  const f = mcq();
  const d = duplicateForm(f);
  assert.equal(d.status, 'draft');
  assert.equal(d.text, f.text);
  d.options[0] = 'changed';
  assert.equal(f.options[0], 'Joule');
});

test('lock rule', () => {
  assert.equal(isLocked(undefined), false);
  assert.equal(isLocked(0), false);
  assert.equal(isLocked(3), true);
});

test('insertAtSelection: inserts at the caret', () => {
  const r = insertAtSelection('x2', { start: 1, end: 1 }, '²');
  assert.equal(r.value, 'x²2');
  assert.deepEqual(r.selection, { start: 2, end: 2 });
});

test('insertAtSelection: replaces a selection, handles reversed and out-of-range selections', () => {
  assert.equal(insertAtSelection('abcdef', { start: 1, end: 4 }, 'Ω').value, 'aΩef');
  assert.equal(insertAtSelection('abcdef', { start: 4, end: 1 }, 'Ω').value, 'aΩef');
  assert.equal(insertAtSelection('ab', { start: 99, end: 99 }, 'π').value, 'abπ');
});

test('insertAtSelection: no selection appends; multi-char symbols move caret by their length', () => {
  const r = insertAtSelection('T = 25', null, '°C');
  assert.equal(r.value, 'T = 25°C');
  assert.deepEqual(r.selection, { start: 8, end: 8 });
  assert.equal(insertAtSelection('', { start: 0, end: 0 }, 'θ').value, 'θ');
});

test('symbol palette covers the required characters and has no duplicate labels', () => {
  const all = SYMBOL_GROUPS.flatMap((g) => g.items.map((i) => i.char));
  for (const c of ['²', '₂', '°', 'Ω', 'µ', 'θ', 'λ', 'π', '×', '÷', '±', '→', '≈', '≤', '≥', '√']) assert.ok(all.includes(c), `missing ${c}`);
  const labels = SYMBOL_GROUPS.flatMap((g) => g.items.map((i) => i.label));
  assert.equal(new Set(labels).size, labels.length);
});

test('mapServerError routes messages to the right field', () => {
  assert.equal(mapServerError(409, 'question_in_use', 'x').inUse, true);
  assert.equal(mapServerError(409, 'conflict', 'already exists').field, 'text');
  assert.equal(mapServerError(400, 'bad_request', 'options must contain 4 items').field, 'opt0');
  assert.equal(mapServerError(400, 'bad_request', 'correct must be 0..3').field, 'correct');
  assert.equal(mapServerError(400, 'bad_request', 'explanation too long').field, 'explanation');
  assert.equal(mapServerError(500, 'x', 'boom').field, 'general');
});

test('previewVerdict: MCQ compares to the marked option; flashcard maps grades', () => {
  const f = { type: 'mcq' as const, correct: 1, explanation: ' why ' };
  assert.equal(previewVerdict(f, { selected_option: 1 }).is_correct, true);
  assert.equal(previewVerdict(f, { selected_option: 0 }).is_correct, false);
  assert.equal(previewVerdict(f, { selected_option: 0 }).correct_option, 1);
  assert.equal(previewVerdict(f, { selected_option: 1 }).explanation, 'why');
  const fc = { type: 'flashcard' as const, correct: null, explanation: '' };
  assert.equal(previewVerdict(fc, { self_eval: 'good' }).is_correct, true);
  assert.equal(previewVerdict(fc, { self_eval: 'again' }).is_correct, false);
  assert.equal(previewVerdict(fc, { self_eval: 'good' }).explanation, null);
});
