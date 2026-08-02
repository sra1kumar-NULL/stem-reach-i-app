import Constants from 'expo-constants';
import type {
  ActivationResponse,
  FeedResponse,
  MeResponse,
  ParticipationReport,
  PerformanceReport,
  SubmissionResponse,
  SyllabusResponse,
} from '@stemreach/core';

/** Resolves the API base URL: EXPO_PUBLIC_API_URL → Expo dev-server host → localhost. */
export function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;

  return 'http://localhost:3000';
}

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? 'http_error', body?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function checkApiHealth(baseUrl = getApiBaseUrl()): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/healthz`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

// ── Typed endpoints (contracts from @stemreach/core) ─────────────────────────

export const getFeedToday = () => apiFetch<FeedResponse>('/api/feed/today');
export const getMe = () => apiFetch<MeResponse>('/api/me');
export const submitAnswer = (body: { question_id: string; daily_set_id: string; selected_option?: number; self_eval?: 'got_it' | 'need_practice' }) =>
  apiFetch<SubmissionResponse>('/api/submissions', { method: 'POST', body });

export const getSyllabus = () => apiFetch<SyllabusResponse>('/api/syllabus');
export const getActivations = (date?: string) => apiFetch<ActivationResponse>(`/api/activations${date ? `?date=${date}` : ''}`);
export const activate = (body: { date?: string; section_ids: string[] }) =>
  apiFetch<ActivationResponse>('/api/activations', { method: 'POST', body });
export const getParticipation = (date: string, classSection?: string) =>
  apiFetch<ParticipationReport>(`/api/reports/participation?date=${date}${classSection ? `&class_section=${classSection}` : ''}`);
export const getPerformance = (from?: string, to?: string, sectionId?: string) =>
  apiFetch<PerformanceReport>(
    `/api/reports/performance?${new URLSearchParams(
      Object.entries({ from: from ?? '', to: to ?? '', section_id: sectionId ?? '' }).filter(([, v]) => v),
    ).toString()}`,
  );
