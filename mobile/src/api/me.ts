import type { MeResponse, UpdateMeRequest } from '@stemreach/core';

import { apiFetch } from '@/api/client';

/**
 * PATCH /api/me — name and/or question language only (the API rejects any other
 * key). Resolves with the refreshed MeResponse so callers can drop it straight
 * into auth state.
 */
export const updateMe = (body: UpdateMeRequest) => apiFetch<MeResponse>('/api/me', { method: 'PATCH', body });
