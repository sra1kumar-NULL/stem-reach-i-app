import type {
  ChapterDto,
  CreateChapterRequest,
  CreateSectionRequest,
  ImportQuestionsRequest,
  ImportQuestionsResponse,
  OkResponse,
  SectionDetailDto,
  UpdateChapterRequest,
  UpdateSectionRequest,
} from '@stemreach/core';

import type { SeedContent } from '@stemreach/core/content';

import { apiFetch } from '@/api/client';
import { syllabusStore } from '@/lib/syllabus-store';

/** Runs a write, then marks the shared syllabus cache stale (also on failure: the server state may have changed). */
async function mutate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    syllabusStore.invalidate();
  }
}

// ── Chapters and topics (sections) ──────────────────────────────────────────

export const createChapter = (body: CreateChapterRequest) =>
  mutate(() => apiFetch<ChapterDto>('/api/chapters', { method: 'POST', body }));
export const updateChapter = (id: string, body: UpdateChapterRequest) =>
  mutate(() => apiFetch<ChapterDto>(`/api/chapters/${id}`, { method: 'PATCH', body }));
/** 409 `not_empty` when the chapter still has questions. */
export const deleteChapter = (id: string) => mutate(() => apiFetch<OkResponse>(`/api/chapters/${id}`, { method: 'DELETE' }));

export const createSection = (body: CreateSectionRequest) =>
  mutate(() => apiFetch<SectionDetailDto>('/api/sections', { method: 'POST', body }));
export const updateSection = (id: string, body: UpdateSectionRequest) =>
  mutate(() => apiFetch<SectionDetailDto>(`/api/sections/${id}`, { method: 'PATCH', body }));
/** 409 `not_empty` when the topic has questions or was ever activated. */
export const deleteSection = (id: string) => mutate(() => apiFetch<OkResponse>(`/api/sections/${id}`, { method: 'DELETE' }));

// ── Bulk import / export ────────────────────────────────────────────────────

/** `rows` are plain objects; the API validates each one individually. */
export const importQuestions = (body: ImportQuestionsRequest) => {
  const run = () => apiFetch<ImportQuestionsResponse>('/api/questions/import', { method: 'POST', body });
  return body.dry_run ? run() : mutate(run);
};

export const exportChapter = (chapterId: string) =>
  apiFetch<SeedContent>(`/api/questions/export?chapter_id=${encodeURIComponent(chapterId)}`);
