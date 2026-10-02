import Constants from 'expo-constants';
import type {
  ActivationResponse,
  FeedResponse,
  MeResponse,
  ParticipationReport,
  PerformanceReport,
  SelfEval,
  SignupResponse,
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

/** Longest `apiFetch` will wait for the initial session restore before proceeding. */
const AUTH_INIT_CAP_MS = 3000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let authInitialized = false;
let resolveAuthInitialized: () => void = () => {};
const authInitialization = new Promise<void>((resolve) => {
  resolveAuthInitialized = resolve;
});

/** Signals that the initial session restore has settled (session or none).
 * Called exactly once by `state/auth.tsx`; idempotent, and it releases any
 * `apiFetch` that is waiting for the token. */
export function markAuthInitialized(): void {
  if (authInitialized) return;
  authInitialized = true;
  resolveAuthInitialized();
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
  // Race gate: a fetch issued before the session restore settles would go out
  // without an Authorization header and get a 401. Wait (bounded) for auth to
  // initialize only while we still have no token. Once initialized, a missing
  // token means signed out — proceed immediately, no deadlock.
  if (!accessToken && !authInitialized) {
    await Promise.race([authInitialization, wait(AUTH_INIT_CAP_MS)]);
  }
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
export const submitAnswer = (body: { question_id: string; daily_set_id: string; selected_option?: number; self_eval?: SelfEval }) =>
  apiFetch<SubmissionResponse>('/api/submissions', { method: 'POST', body });

export const getSyllabus = () => apiFetch<SyllabusResponse>('/api/syllabus');
export const signup = (body: { full_name: string; email: string; password: string; role: 'student' | 'teacher'; class_section?: string }) =>
  apiFetch<SignupResponse>('/api/auth/signup', { method: 'POST', body });
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
