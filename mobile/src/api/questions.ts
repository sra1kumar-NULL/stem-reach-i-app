import type {
  ListQuestionsQuery,
  ListQuestionsResponse,
  ListRevisionsResponse,
  OkResponse,
  SimilarQuestionsResponse,
  TeacherQuestionDto,
} from '@stemreach/core';

import { ApiError, apiFetch } from '@/api/client';
import type { CreatePayload, PatchPayload } from '@/lib/question-editor';

/** Query values the list screen sends (a typed subset of ListQuestionsQuery). */
export type QuestionFilters = Pick<ListQuestionsQuery, 'section_id' | 'q' | 'type' | 'difficulty' | 'language' | 'status' | 'archived' | 'limit' | 'cursor'>;

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// Small cache so the editor can open a row without a GET /api/questions/:id (the API has none).
const cache = new Map<string, TeacherQuestionDto>();
let listVersion = 0;

export function rememberQuestions(rows: TeacherQuestionDto[]): void {
  for (const r of rows) cache.set(r.id, r);
}
export function cachedQuestion(id: string): TeacherQuestionDto | undefined {
  return cache.get(id);
}
/** Bumped after any write; the list screen reloads on focus when it changed. */
export function questionsVersion(): number {
  return listVersion;
}
function touch(row?: TeacherQuestionDto): void {
  listVersion += 1;
  if (row) cache.set(row.id, row);
}

export async function listQuestions(filters: QuestionFilters): Promise<ListQuestionsResponse> {
  const res = await apiFetch<ListQuestionsResponse>(`/api/questions${qs({ ...filters, limit: filters.limit ?? 30 })}`);
  rememberQuestions(res.questions);
  return res;
}

/** One question by id: cache first, then `GET /api/questions/:id` (deep links / reloads). Null when it does not exist. */
export async function findQuestion(id: string): Promise<TeacherQuestionDto | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const row = await apiFetch<TeacherQuestionDto>(`/api/questions/${id}`);
    touch(row);
    return row;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function createQuestion(body: CreatePayload): Promise<TeacherQuestionDto> {
  const row = await apiFetch<TeacherQuestionDto>('/api/questions', { method: 'POST', body });
  touch(row);
  return row;
}

export async function updateQuestion(id: string, body: PatchPayload | { enabled: boolean }): Promise<TeacherQuestionDto> {
  const row = await apiFetch<TeacherQuestionDto>(`/api/questions/${id}`, { method: 'PATCH', body });
  touch(row);
  return row;
}

export async function deleteQuestion(id: string): Promise<void> {
  await apiFetch<OkResponse>(`/api/questions/${id}`, { method: 'DELETE' });
  cache.delete(id);
  touch();
}

export const findSimilar = (body: { section_id: string; text: string; exclude_id?: string }) =>
  apiFetch<SimilarQuestionsResponse>('/api/questions/similar', { method: 'POST', body });

export const listRevisions = (id: string) => apiFetch<ListRevisionsResponse>(`/api/questions/${id}/revisions`);

export async function restoreRevision(id: string, revisionNo: number): Promise<TeacherQuestionDto> {
  const row = await apiFetch<TeacherQuestionDto>(`/api/questions/${id}/restore`, { method: 'POST', body: { revision_no: revisionNo } });
  touch(row);
  return row;
}
