/**
 * Pure parser for the teacher bulk-import screen.
 *
 * Accepts pasted/picked text in three shapes and turns it into rows shaped
 * like core's `ImportQuestionRow`:
 *   1. JSON array of row objects,
 *   2. JSON `SeedContent` ({ chapter, sections: [{ section_no, questions }] }),
 *   3. CSV / TSV with a header row (see CSV_COLUMNS).
 *
 * The API stays the authority (it re-validates every row with Zod); this module
 * mirrors the Zod limits so the teacher sees mistakes before any request.
 * No imports — it runs under `node --test` and in the app bundle alike.
 */

/** Mirrors `IMPORT_MAX_ROWS` in core/src/contracts.ts. */
export const IMPORT_MAX_ROWS = 200;

export const CSV_COLUMNS = [
  'type',
  'difficulty',
  'language',
  'text',
  'option1',
  'option2',
  'option3',
  'option4',
  'correct',
  'answer',
  'explanation',
  'chapter_no',
  'section_no',
] as const;

export interface ImportRow {
  type: 'mcq' | 'flashcard';
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: 'en' | 'kn';
  text: string;
  options?: string[];
  /** 0-3 */
  correct?: number;
  answer?: string;
  explanation: string;
  chapter_no?: number;
  section_no?: string;
}

export interface ImportProblem {
  /** 1-based row number among the data rows (CSV header excluded). 0 = whole input. */
  row: number;
  message: string;
}

export interface ParseResult {
  format: 'json' | 'csv' | 'tsv' | 'none';
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Set when nothing usable could be read (empty input, bad JSON, too many rows…). */
  fatal?: string;
}

export interface ParseOptions {
  /** A default topic is chosen, so rows need no chapter_no/section_no. */
  hasDefaultTarget?: boolean;
}

// ── CSV / TSV ───────────────────────────────────────────────────────────────

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** RFC 4180 style parser: quoted cells, "" escapes, newlines inside quotes, CRLF/CR/LF. Throws on an unclosed quote. */
export function parseDelimited(input: string, delimiter: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false; // distinguishes an empty trailing line from an empty cell
  const endCell = () => {
    row.push(cell);
    cell = '';
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      cell += ch;
      cellStarted = true;
    }
  }
  if (inQuotes) throw new Error('A quoted cell is never closed (missing ").');
  if (cellStarted || cell !== '' || row.length > 0) endRow();
  return rows;
}

export function csvEscape(value: string, delimiter = ','): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][], delimiter = ','): string {
  return rows.map((r) => r.map((c) => csvEscape(c, delimiter)).join(delimiter)).join('\n');
}

/** Header row + two example rows (an MCQ with a comma/newline-safe cell, and a Kannada flashcard). */
export function csvTemplate(): string {
  return `${toCsv([
    [...CSV_COLUMNS],
    [
      'mcq', 'easy', 'en', 'Which gas do plants take in for photosynthesis, mainly?',
      'Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen', 'B', '',
      'Plants take in carbon dioxide and, using light, make glucose.', '1', '1.1',
    ],
    [
      'flashcard', 'medium', 'kn', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೇನು?',
      '', '', '', '', '', 'ಸಸ್ಯಗಳು ಬೆಳಕಿನಿಂದ ಆಹಾರ ತಯಾರಿಸುವ ಕ್ರಿಯೆ',
      'Photosynthesis is how plants make food using light.', '1', '1.1',
    ],
  ])}\n`;
}

// ── Row normalisation and validation ────────────────────────────────────────

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = typeof v === 'string' ? v.trim() : String(v).trim();
  return s === '' ? undefined : s;
};

/** 1-4 or A-D (CSV convention) → 0-3, or undefined if invalid. */
export function parseCorrect(value: unknown, zeroBased = false): number | undefined {
  if (typeof value === 'number') {
    const n = zeroBased ? value : value - 1;
    return Number.isInteger(value) && n >= 0 && n <= 3 ? n : undefined;
  }
  const s = str(value);
  if (!s) return undefined;
  const upper = s.toUpperCase();
  if (/^[A-D]$/.test(upper)) return upper.charCodeAt(0) - 65;
  if (/^[1-4]$/.test(s)) return Number(s) - 1;
  return undefined;
}

/** Turns one raw cell/object into an ImportRow or a list of human-readable errors. */
export function normalizeRow(raw: Raw, opts: ParseOptions = {}): { row?: ImportRow; errors: string[] } {
  const errors: string[] = [];

  const text = str(raw.text ?? raw.question_text);
  const explanation = str(raw.explanation);
  const answer = str(raw.answer);

  let options: string[] | undefined;
  if (Array.isArray(raw.options)) {
    options = raw.options.map((o) => (str(o) ?? ''));
  } else {
    const cells = [raw.option1, raw.option2, raw.option3, raw.option4].map(str);
    if (cells.some((c) => c !== undefined)) options = cells.map((c) => c ?? '');
  }

  const hasCorrect = raw.correct !== undefined && str(raw.correct) !== undefined;
  const typeRaw = str(raw.type)?.toLowerCase();
  let type: ImportRow['type'];
  if (typeRaw === undefined) type = options || hasCorrect ? 'mcq' : 'flashcard';
  else if (typeRaw === 'mcq' || typeRaw === 'flashcard') type = typeRaw;
  else {
    errors.push(`type "${typeRaw}" must be mcq or flashcard`);
    type = options ? 'mcq' : 'flashcard';
  }

  const diffRaw = str(raw.difficulty)?.toLowerCase();
  if (diffRaw !== undefined && !['easy', 'medium', 'hard'].includes(diffRaw)) {
    errors.push(`difficulty "${diffRaw}" must be easy, medium or hard`);
  }
  const langRaw = str(raw.language)?.toLowerCase();
  if (langRaw !== undefined && !['en', 'kn'].includes(langRaw)) {
    errors.push(`language "${langRaw}" must be en or kn`);
  }

  if (!text) errors.push('text is required');
  else if (text.length > 500) errors.push(`text is ${text.length} characters (max 500)`);
  if (!explanation) errors.push('explanation is required');
  else if (explanation.length > 1000) errors.push(`explanation is ${explanation.length} characters (max 1000)`);

  let correct: number | undefined;
  if (type === 'mcq') {
    if (!options || options.length !== 4 || options.some((o) => o === '')) {
      errors.push('an mcq needs exactly 4 non-empty options');
    } else {
      const long = options.findIndex((o) => o.length > 200);
      if (long >= 0) errors.push(`option ${long + 1} is longer than 200 characters`);
    }
    if (!hasCorrect) errors.push('correct is required for an mcq (1-4 or A-D)');
    else {
      correct = parseCorrect(raw.correct, typeof raw.correct === 'number');
      if (correct === undefined) errors.push(`correct "${String(raw.correct)}" must be 1-4 or A-D`);
    }
  } else {
    if (!answer) errors.push('answer is required for a flashcard');
    if (options && options.some((o) => o !== '')) errors.push('a flashcard must not have options');
    if (hasCorrect) errors.push('a flashcard must not have a correct option');
  }
  if (answer && answer.length > 1000) errors.push(`answer is ${answer.length} characters (max 1000)`);

  const chapterRaw = str(raw.chapter_no);
  const sectionNo = str(raw.section_no);
  let chapterNo: number | undefined;
  if (chapterRaw !== undefined) {
    if (!/^\d+$/.test(chapterRaw)) errors.push(`chapter_no "${chapterRaw}" must be a whole number`);
    else chapterNo = Number(chapterRaw);
  }
  const hasRowTarget = chapterNo !== undefined && sectionNo !== undefined;
  if ((chapterNo === undefined) !== (sectionNo === undefined)) {
    errors.push('chapter_no and section_no must be given together');
  } else if (!hasRowTarget && !opts.hasDefaultTarget) {
    errors.push('no topic: fill chapter_no and section_no, or choose a default topic');
  }

  if (errors.length > 0) return { errors };

  const row: ImportRow = { type, text: text!, explanation: explanation! };
  if (diffRaw) row.difficulty = diffRaw as ImportRow['difficulty'];
  if (langRaw) row.language = langRaw as ImportRow['language'];
  if (type === 'mcq') {
    row.options = options;
    row.correct = correct;
    if (answer) row.answer = answer;
  } else {
    row.answer = answer;
  }
  if (hasRowTarget) {
    row.chapter_no = chapterNo;
    row.section_no = sectionNo;
  }
  return { row, errors };
}

// ── Entry point ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finish(format: ParseResult['format'], raws: { raw: Raw; label?: Raw }[], opts: ParseOptions): ParseResult {
  if (raws.length === 0) return { format, rows: [], problems: [], fatal: 'No questions found in the pasted text.' };
  if (raws.length > IMPORT_MAX_ROWS) {
    return {
      format,
      rows: [],
      problems: [],
      fatal: `Too many rows: ${raws.length}. Import at most ${IMPORT_MAX_ROWS} questions at a time; split the file.`,
    };
  }
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  raws.forEach(({ raw }, i) => {
    const res = normalizeRow(raw, opts);
    if (res.row) rows.push(res.row);
    for (const message of res.errors) problems.push({ row: i + 1, message });
  });
  return { format, rows, problems };
}

function parseJson(text: string, opts: ParseOptions): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? ` (${e.message})` : '';
    return { format: 'json', rows: [], problems: [], fatal: `That is not valid JSON${detail}.` };
  }
  if (Array.isArray(data)) {
    const raws: { raw: Raw }[] = [];
    const problems: ImportProblem[] = [];
    data.forEach((item, i) => {
      if (isRecord(item)) raws.push({ raw: item });
      else {
        raws.push({ raw: {} });
        problems.push({ row: i + 1, message: 'row must be an object' });
      }
    });
    const res = finish('json', raws, opts);
    // `{}` placeholders produce their own noise; drop it for non-object rows.
    const bad = new Set(problems.map((p) => p.row));
    res.problems = [...problems, ...res.problems.filter((p) => !bad.has(p.row))].sort((a, b) => a.row - b.row);
    return res;
  }
  if (isRecord(data) && isRecord(data.chapter) && Array.isArray(data.sections)) {
    const chapterNo = (data.chapter as Raw).ncert_no;
    const raws: { raw: Raw }[] = [];
    for (const sec of data.sections) {
      if (!isRecord(sec) || !Array.isArray(sec.questions)) continue;
      for (const q of sec.questions) {
        if (isRecord(q)) raws.push({ raw: { ...q, chapter_no: chapterNo, section_no: sec.section_no } });
      }
    }
    return finish('json', raws, opts);
  }
  if (isRecord(data) && Array.isArray(data.rows)) {
    return finish('json', (data.rows as unknown[]).filter(isRecord).map((raw) => ({ raw })), opts);
  }
  return {
    format: 'json',
    rows: [],
    problems: [],
    fatal: 'Expected a JSON array of questions or a chapter file with "chapter" and "sections".',
  };
}

function parseTable(text: string, opts: ParseOptions): ParseResult {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabs > commas ? '\t' : ',';
  const format = delimiter === '\t' ? 'tsv' : 'csv';

  let table: string[][];
  try {
    table = parseDelimited(text, delimiter);
  } catch (e) {
    return { format, rows: [], problems: [], fatal: e instanceof Error ? e.message : 'Could not read the table.' };
  }
  const header = (table.shift() ?? []).map((h) => h.trim().toLowerCase());
  if (!header.includes('text') && !header.includes('question_text')) {
    return {
      format,
      rows: [],
      problems: [],
      fatal: `The first line must be a header row with a "text" column (${CSV_COLUMNS.join(', ')}).`,
    };
  }
  const raws = table
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const raw: Raw = {};
      header.forEach((h, i) => {
        if (h && cells[i] !== undefined) raw[h] = cells[i];
      });
      return { raw };
    });
  return finish(format, raws, opts);
}

/** Parses pasted/picked text (JSON, CSV or TSV) into import rows plus per-row problems. */
export function parseImport(input: string, opts: ParseOptions = {}): ParseResult {
  const text = stripBom(input).trim();
  if (!text) return { format: 'none', rows: [], problems: [], fatal: 'Paste some questions first.' };
  if (text.startsWith('[') || text.startsWith('{')) return parseJson(text, opts);
  return parseTable(text, opts);
}
