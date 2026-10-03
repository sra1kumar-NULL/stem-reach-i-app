import type {
  ActivationRangeResponse,
  CalendarDayResponse,
  CalendarMonthResponse,
  PlanActivationsRequest,
} from '@stemreach/core';

import { apiFetch } from '@/api/client';

/** `month` is `YYYY-MM`. Only days with data are returned. */
export const getCalendarMonth = (month: string) =>
  apiFetch<CalendarMonthResponse>(`/api/calendar?month=${encodeURIComponent(month)}`);

export const getCalendarDay = (date: string) =>
  apiFetch<CalendarDayResponse>(`/api/calendar/day?date=${encodeURIComponent(date)}`);

/** Max 62 days per call (server-enforced). */
export const getActivationRange = (from: string, to: string) =>
  apiFetch<ActivationRangeResponse>(
    `/api/activations/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

/** Dates must be today or later (school timezone); replaces existing activations on those dates. */
export const planActivations = (body: PlanActivationsRequest) =>
  apiFetch<ActivationRangeResponse>('/api/activations/plan', { method: 'POST', body });
