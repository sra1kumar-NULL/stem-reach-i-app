/** Pure helpers for the teacher "Today's revision" screen (no React, no I/O). */

export interface TopicRow {
  id: string;
  /** Section number, e.g. "12.1". */
  no: string;
  /** Topic name, e.g. "Magnetic Field and Field Lines". */
  name: string;
  count: number;
}

export interface ChapterGroup {
  id: string;
  name: string;
  subject: string;
  topics: TopicRow[];
}

interface SyllabusLike {
  chapters: {
    id: string;
    name: string;
    subject: string;
    sections: { id: string; section_no: string; name: string; enabled_question_count: number }[];
  }[];
}

export function buildGroups(syllabus: SyllabusLike | null): ChapterGroup[] {
  return (syllabus?.chapters ?? []).map((ch) => ({
    id: ch.id,
    name: ch.name,
    subject: ch.subject,
    topics: ch.sections.map((s) => ({ id: s.id, no: s.section_no, name: s.name, count: s.enabled_question_count })),
  }));
}

/**
 * "N live" counts what students can actually receive (enabled AND published), which is what the API's
 * `enabled_question_count` / activation `question_count` mean since round 3.
 */
export const liveQuestions = (n: number) => `${n} live ${n === 1 ? 'question' : 'questions'}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The topic card title is the topic name (falls back to the number if a name is blank). */
export function topicTitle(t: Pick<TopicRow, 'no' | 'name'>): string {
  return t.name.trim() || t.no;
}

export function topicA11yLabel(chapterName: string, t: TopicRow): string {
  return `${t.no} ${topicTitle(t)}, ${chapterName}, ${liveQuestions(t.count)}`;
}

export function selectionTotals(groups: ChapterGroup[], selected: ReadonlySet<string>) {
  let topics = 0;
  let questions = 0;
  for (const g of groups) {
    for (const t of g.topics) {
      if (selected.has(t.id)) {
        topics += 1;
        questions += t.count;
      }
    }
  }
  return { topics, questions };
}

export function chapterSelection(group: ChapterGroup, selected: ReadonlySet<string>) {
  const on = group.topics.filter((t) => selected.has(t.id)).length;
  const total = group.topics.length;
  const state: boolean | 'mixed' = total > 0 && on === total ? true : on > 0 ? 'mixed' : false;
  return { on, total, state, summary: `${on} of ${plural(total, 'topic')} selected`, short: `${on} of ${total} selected` };
}

/** Next selection after the chapter select-all / clear toggle. */
export function toggleChapterSelection(group: ChapterGroup, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const allOn = group.topics.length > 0 && group.topics.every((t) => next.has(t.id));
  for (const t of group.topics) {
    if (allOn) next.delete(t.id);
    else next.add(t.id);
  }
  return next;
}

export function sameSelection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** One-line status under the header. */
export function statusLine(activeTopics: number, activeQuestions: number): string {
  if (activeTopics === 0) return 'Nothing activated yet';
  return `${plural(activeTopics, 'topic')} activated today · ${liveQuestions(activeQuestions)}`;
}

/** "Sunday, 4 October" from a local Date. */
export function headerDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function actionLabel(hasActivation: boolean): string {
  return hasActivation ? "Update today's topics" : 'Activate for students';
}

/** Short state hint under the sticky-bar count (the button itself is disabled in the first two cases). */
export function barHint(topics: number, hasActivation: boolean, changed: boolean): string {
  if (topics === 0) return hasActivation ? 'Pick at least one topic' : 'Pick topics to activate';
  if (!changed) return 'Matches what students see';
  return hasActivation ? 'Not saved yet' : 'Not activated yet';
}

/** The sticky button is enabled only when there is something to send. */
export function canSubmit(topics: number, changed: boolean, busy: boolean): boolean {
  return !busy && topics > 0 && changed;
}

/** `YYYY-MM-DD` to a local Date at noon (no UTC shift). */
export function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Next selection after a background reload: if the teacher has not touched the selection (it still equals
 * the previously active set) follow the new active set; otherwise keep their edits, minus topics that
 * no longer exist.
 */
export function reconcileSelection(
  selected: ReadonlySet<string>,
  prevActive: ReadonlySet<string>,
  nextActive: ReadonlySet<string>,
  existing: ReadonlySet<string>,
): Set<string> {
  if (sameSelection(selected, prevActive)) return new Set(nextActive);
  return new Set([...selected].filter((id) => existing.has(id)));
}

/** Collapse chapters by default only when there are many of them. */
export const COLLAPSE_AFTER = 3;
export function defaultCollapsed(chapterCount: number): boolean {
  return chapterCount > COLLAPSE_AFTER;
}
