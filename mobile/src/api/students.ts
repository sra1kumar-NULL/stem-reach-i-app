import type { ListStudentsResponse, OkResponse, ResetStudentPasswordResponse } from '@stemreach/core';

import { apiFetch } from '@/api/client';

export const listStudents = (opts: { q?: string; classSection?: string } = {}) => {
  const qs = new URLSearchParams(
    Object.entries({ q: opts.q ?? '', class_section: opts.classSection ?? '' }).filter(([, v]) => v),
  ).toString();
  return apiFetch<ListStudentsResponse>(`/api/students${qs ? `?${qs}` : ''}`);
};

/** Omit `temporaryPassword` to have the API generate one. The result holds the password: show it once, never store it. */
export const resetStudentPassword = (id: string, temporaryPassword?: string) =>
  apiFetch<ResetStudentPasswordResponse>(`/api/students/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: temporaryPassword ? { temporary_password: temporaryPassword } : {},
  });

/** Sets the caller's own password and clears the must-change flag. */
export const changePassword = (newPassword: string) =>
  apiFetch<OkResponse>('/api/me/change-password', { method: 'POST', body: { new_password: newPassword } });
