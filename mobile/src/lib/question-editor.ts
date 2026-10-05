/**
 * Pure logic behind the teacher question editor: form state, validation that mirrors the
 * Zod limits in @stemreach/core (AuthoredQuestion), payload building, cursor-aware symbol
 * insertion and server-error mapping. No React, no network — covered by question-editor.test.ts.
 */

// Mirror of AuthoredQuestion limits in core/src/contracts.ts. Keep in sync.
export const LIMITS = { text: 500, option: 200, answer: 1000, explanation: 1000 } as const;
export const SIMILAR_MIN_CHARS = 8;

export type QType = 'mcq' | 'flashcard';
export type Diff = 'easy' | 'medium' | 'hard';
export type Lang = 'en' | 'kn';
export type QStatus = 'draft' | 'published';
export type Options4 = [string, string, string, string];

export interface EditorForm {
  section_id: string;
  type: QType;
  difficulty: Diff;
  language: Lang;
  status: QStatus;
  text: string;
  options: Options4;
  /** Index of the correct option. null = not chosen (or not reported by the server). */
  correct: number | null;
  answer: string;
  explanation: string;
}

/** Subset of TeacherQuestionDto the editor reads (the server may also send `correct_option`). */
export interface QuestionLike {
  section_id: string;
  type: QType;
  language: Lang;
  difficulty: Diff;
  question_text: string;
  options: string[] | null;
  answer: string | null;
  explanation: string | null;
  status?: QStatus;
  correct?: number | null;
  correct_option?: number | null;
}

export type FieldKey = 'text' | 'opt0' | 'opt1' | 'opt2' | 'opt3' | 'answer' | 'explanation';

export interface FormErrors {
  section_id?: string;
  text?: string;
  options?: (string | undefined)[];
  correct?: string;
  answer?: string;
  explanation?: string;
}

export function emptyForm(defaults: Partial<EditorForm> = {}): EditorForm {
  return {
    section_id: '',
    type: 'mcq',
    difficulty: 'medium',
    language: 'en',
    status: 'published',
    text: '',
    options: ['', '', '', ''],
    correct: null,
    answer: '',
    explanation: '',
    ...defaults,
  };
}

export function formFromQuestion(q: QuestionLike): EditorForm {
  const opts = q.options ?? [];
  const correct = q.correct ?? q.correct_option ?? null;
  return {
    section_id: q.section_id,
    type: q.type,
    difficulty: q.difficulty,
    language: q.language,
    status: q.status ?? 'published',
    text: q.question_text,
    options: [opts[0] ?? '', opts[1] ?? '', opts[2] ?? '', opts[3] ?? ''],
    correct: q.type === 'mcq' ? correct : null,
    answer: q.answer ?? '',
    explanation: q.explanation ?? '',
  };
}

/** Settings "Save & add another" keeps; the content is cleared. */
export function nextFormKeepingSettings(f: EditorForm): EditorForm {
  return emptyForm({ section_id: f.section_id, difficulty: f.difficulty, language: f.language, status: f.status, type: f.type });
}

/** A copy for "Duplicate" / "corrected copy": same content, always a draft. */
export function duplicateForm(f: EditorForm): EditorForm {
  return { ...f, options: [...f.options] as Options4, status: 'draft' };
}

export function validateForm(f: EditorForm, opts: { correctUnknownOk?: boolean } = {}): FormErrors {
  const e: FormErrors = {};
  if (!f.section_id) e.section_id = 'Choose a topic for this question.';
  const text = f.text.trim();
  if (!text) e.text = 'Write the question.';
  else if (text.length > LIMITS.text) e.text = `Keep it to ${LIMITS.text} characters (now ${text.length}).`;

  if (f.type === 'mcq') {
    const oe: (string | undefined)[] = [];
    f.options.forEach((o, i) => {
      const v = o.trim();
      if (!v) oe[i] = 'Fill in this option.';
      else if (v.length > LIMITS.option) oe[i] = `Keep it to ${LIMITS.option} characters (now ${v.length}).`;
    });
    if (oe.some(Boolean)) e.options = oe;
    if (f.correct == null && !opts.correctUnknownOk) e.correct = 'Mark which option is correct.';
    else if (f.correct != null && !f.options[f.correct]?.trim()) e.correct = 'The correct option cannot be empty.';
  } else {
    const a = f.answer.trim();
    if (!a) e.answer = 'Write the answer shown on the back of the card.';
    else if (a.length > LIMITS.answer) e.answer = `Keep it to ${LIMITS.answer} characters (now ${a.length}).`;
  }

  const ex = f.explanation.trim();
  if (!ex) e.explanation = 'Add a short explanation students see after answering.';
  else if (ex.length > LIMITS.explanation) e.explanation = `Keep it to ${LIMITS.explanation} characters (now ${ex.length}).`;
  return e;
}

export function hasErrors(e: FormErrors): boolean {
  return Boolean(e.section_id || e.text || e.options?.some(Boolean) || e.correct || e.answer || e.explanation);
}

/** First field with an error, in on-screen order — used to focus/scroll after a failed save. */
export function firstErrorField(e: FormErrors): FieldKey | 'correct' | 'section_id' | null {
  if (e.section_id) return 'section_id';
  if (e.text) return 'text';
  const oi = e.options ? e.options.findIndex(Boolean) : -1;
  if (oi >= 0) return `opt${oi}` as FieldKey;
  if (e.correct) return 'correct';
  if (e.answer) return 'answer';
  if (e.explanation) return 'explanation';
  return null;
}

export interface CreatePayload {
  section_id: string;
  type: QType;
  difficulty: Diff;
  language: Lang;
  status: QStatus;
  text: string;
  explanation: string;
  options?: string[];
  correct?: number;
  answer?: string;
}

/** POST /api/questions body. MCQ never carries `answer`; flashcard never carries options/correct. */
export function buildCreatePayload(f: EditorForm): CreatePayload {
  const base = {
    section_id: f.section_id,
    type: f.type,
    difficulty: f.difficulty,
    language: f.language,
    status: f.status,
    text: f.text.trim(),
    explanation: f.explanation.trim(),
  };
  if (f.type === 'mcq') return { ...base, options: f.options.map((o) => o.trim()), correct: f.correct ?? 0 };
  return { ...base, answer: f.answer.trim() };
}

export type PatchPayload = Partial<CreatePayload>;

const same = (a: string, b: string) => a.trim() === b.trim();

/** PATCH /api/questions/:id body — only the fields that differ from the loaded question. Empty object = nothing to save. */
export function buildPatchPayload(original: EditorForm, f: EditorForm): PatchPayload {
  const p: PatchPayload = {};
  if (f.section_id !== original.section_id) p.section_id = f.section_id;
  if (f.difficulty !== original.difficulty) p.difficulty = f.difficulty;
  if (f.language !== original.language) p.language = f.language;
  if (f.status !== original.status) p.status = f.status;
  if (!same(f.text, original.text)) p.text = f.text.trim();
  if (!same(f.explanation, original.explanation)) p.explanation = f.explanation.trim();

  const typeChanged = f.type !== original.type;
  if (typeChanged) p.type = f.type;
  if (f.type === 'mcq') {
    const optsChanged = f.options.some((o, i) => !same(o, original.options[i] ?? ''));
    // Switching to MCQ must ship the whole MCQ shape: the server validates the merged row.
    if (typeChanged || optsChanged) p.options = f.options.map((o) => o.trim());
    if ((typeChanged || f.correct !== original.correct) && f.correct != null) p.correct = f.correct;
  } else if (typeChanged || !same(f.answer, original.answer)) {
    p.answer = f.answer.trim();
  }
  return p;
}

export function isDirty(original: EditorForm, f: EditorForm): boolean {
  return Object.keys(buildPatchPayload(original, f)).length > 0;
}

/** Lock rule: once students have answered, type / options / correct cannot change. */
export function isLocked(submissionCount: number | undefined): boolean {
  return (submissionCount ?? 0) > 0;
}

/** Sets option text for an index, returning a new tuple. */
export function setOption(options: Options4, index: number, value: string): Options4 {
  const next = [...options] as Options4;
  next[index] = value;
  return next;
}

export interface Selection {
  start: number;
  end: number;
}

/** Inserts `symbol` at the cursor (replacing a selection) and returns the new value + caret. */
export function insertAtSelection(value: string, sel: Selection | null | undefined, symbol: string): { value: string; selection: Selection } {
  const clamp = (n: number) => Math.min(Math.max(0, n), value.length);
  const s = sel ? clamp(Math.min(sel.start, sel.end)) : value.length;
  const e = sel ? clamp(Math.max(sel.start, sel.end)) : value.length;
  const next = value.slice(0, s) + symbol + value.slice(e);
  const caret = s + symbol.length;
  return { value: next, selection: { start: caret, end: caret } };
}

export function fieldLimit(key: FieldKey): number {
  if (key === 'text') return LIMITS.text;
  if (key === 'answer') return LIMITS.answer;
  if (key === 'explanation') return LIMITS.explanation;
  return LIMITS.option;
}

export const IN_USE_MESSAGE = 'Students have already answered this - archive it and create a corrected copy.';

export interface ServerFieldError {
  field: FieldKey | 'correct' | 'section_id' | 'general';
  message: string;
  inUse?: boolean;
}

/** Puts a server 400/409 message on the field it is about. */
export function mapServerError(status: number, code: string, message: string): ServerFieldError {
  if (code === 'question_in_use') return { field: 'general', inUse: true, message: IN_USE_MESSAGE };
  const m = message.toLowerCase();
  if (status === 409) {
    return { field: 'text', message: message || 'A question with this text already exists in this topic.' };
  }
  if (status === 400) {
    if (/section|topic/.test(m)) return { field: 'section_id', message };
    if (/option/.test(m)) return { field: 'opt0', message };
    if (/correct/.test(m)) return { field: 'correct', message };
    if (/answer/.test(m)) return { field: 'answer', message };
    if (/explanation/.test(m)) return { field: 'explanation', message };
    if (/text|question/.test(m)) return { field: 'text', message };
  }
  return { field: 'general', message };
}

export interface PreviewResult {
  is_correct: boolean;
  correct_option: number | null;
  explanation: string | null;
  progress: { answered: number; total: number; completed: boolean };
}

/** Grading for the preview card: no network, same verdict rules as the server. */
export function previewVerdict(
  form: Pick<EditorForm, 'type' | 'correct' | 'explanation'>,
  answer: { selected_option?: number; self_eval?: string },
): PreviewResult {
  const isCorrect =
    form.type === 'mcq'
      ? answer.selected_option != null && answer.selected_option === form.correct
      : ['got_it', 'good', 'easy'].includes(answer.self_eval ?? '');
  return {
    is_correct: isCorrect,
    correct_option: form.type === 'mcq' ? form.correct : null,
    explanation: form.explanation.trim() || null,
    progress: { answered: 1, total: 1, completed: true },
  };
}

// ── hand-off between screens (Duplicate / corrected copy) ───────────────────

let prefill: EditorForm | null = null;
export function setPrefill(f: EditorForm | null): void {
  prefill = f;
}
export function takePrefill(): EditorForm | null {
  const f = prefill;
  prefill = null;
  return f;
}

/** Short date-time label for revision timestamps. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Wording for a topic's/chapter's question counts. `total` is every question; `live` is what students
 * can receive (enabled AND published). The difference is drafts and archived questions.
 */
export function formatQuestionCounts(total: number, live: number): string {
  if (total <= 0) return 'No questions yet';
  const liveN = Math.max(0, Math.min(live, total));
  const hidden = total - liveN;
  return `${liveN} live${hidden > 0 ? ` (${hidden} hidden)` : ''}`;
}

/** Helper under a disabled Delete button. */
export function deleteBlockedHint(questionCount: number): string {
  return `Move or delete its ${questionCount} ${questionCount === 1 ? 'question' : 'questions'} first`;
}
