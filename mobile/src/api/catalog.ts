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

// ── Chapters and topics (sections) ──────────────────────────────────────────

export const createChapter = (body: CreateChapterRequest) =>
  apiFetch<ChapterDto>('/api/chapters', { method: 'POST', body });
export const updateChapter = (id: string, body: UpdateChapterRequest) =>
  apiFetch<ChapterDto>(`/api/chapters/${id}`, { method: 'PATCH', body });
/** 409 `not_empty` when the chapter still has questions. */
export const deleteChapter = (id: string) => apiFetch<OkResponse>(`/api/chapters/${id}`, { method: 'DELETE' });

export const createSection = (body: CreateSectionRequest) =>
  apiFetch<SectionDetailDto>('/api/sections', { method: 'POST', body });
export const updateSection = (id: string, body: UpdateSectionRequest) =>
  apiFetch<SectionDetailDto>(`/api/sections/${id}`, { method: 'PATCH', body });
/** 409 `not_empty` when the topic has questions or was ever activated. */
export const deleteSection = (id: string) => apiFetch<OkResponse>(`/api/sections/${id}`, { method: 'DELETE' });

// ── Bulk import / export ────────────────────────────────────────────────────

/** `rows` are plain objects; the API validates each one individually. */
export const importQuestions = (body: ImportQuestionsRequest) =>
  apiFetch<ImportQuestionsResponse>('/api/questions/import', { method: 'POST', body });

export const exportChapter = (chapterId: string) =>
  apiFetch<SeedContent>(`/api/questions/export?chapter_id=${encodeURIComponent(chapterId)}`);
