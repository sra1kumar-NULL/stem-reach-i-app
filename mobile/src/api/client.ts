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

/** Longest a single request may take before the UI gets a `timeout` error (Render free tier cold-starts are slow). */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Callbacks the auth layer registers so `apiFetch` can react to 401 / 403 without importing it (no cycle). */
export interface AuthHooks {
  /** Refreshes the Supabase session; resolves the new access token, or null when it cannot be refreshed. */
  refreshSession: () => Promise<string | null>;
  /** The session is unusable: sign out and show the login screen with a notice. */
  onSessionExpired: () => void;
  /** The API refuses everything until the user picks a new password. */
  onPasswordChangeRequired: () => void;
}
let authHooks: Partial<AuthHooks> = {};
export function registerAuthHooks(hooks: Partial<AuthHooks>): () => void {
  authHooks = hooks;
  return () => {
    if (authHooks === hooks) authHooks = {};
  };
}

let refreshing: Promise<string | null> | null = null;
/** One refresh at a time: parallel 401s share it instead of burning the refresh token twice. */
function refreshOnce(): Promise<string | null> {
  if (!authHooks.refreshSession) return Promise.resolve(null);
  refreshing ??= authHooks.refreshSession().catch(() => null).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: { method?: string; body?: unknown } | undefined, token: string | null): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      throw new ApiError(res.status, body?.error?.code ?? 'http_error', body?.error?.message ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (controller.signal.aborted) throw new ApiError(0, 'timeout', 'The server is waking up - try again.');
    throw e;
  } finally {
    clearTimeout(timer);
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
  const sent = accessToken;
  try {
    return await request<T>(path, init, sent);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401 && sent) {
      // Expired access token: try one refresh, replay once, then give up and sign out.
      // (Skip the replay if another request already swapped the token.)
      const fresh = accessToken && accessToken !== sent ? accessToken : await refreshOnce();
      if (fresh) {
        setAccessToken(fresh);
        try {
          return await request<T>(path, init, fresh);
        } catch (e2) {
          if (e2 instanceof ApiError && e2.status === 401) authHooks.onSessionExpired?.();
          throw e2;
        }
      }
      authHooks.onSessionExpired?.();
    } else if (e.status === 403 && e.code === 'password_change_required') {
      authHooks.onPasswordChangeRequired?.();
    }
    throw e;
  }
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
export const signup = (body: {
  full_name: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
  class_section?: string;
  /** Required by the API for role 'teacher'. */
  teacher_invite_code?: string;
}) =>
  apiFetch<SignupResponse>('/api/auth/signup', { method: 'POST', body });
export const getActivations = (date?: string) => apiFetch<ActivationResponse>(`/api/activations${date ? `?date=${date}` : ''}`);
export const activate = (body: { date?: string; section_ids: string[]; target_cohorts?: string[] }) =>
  apiFetch<ActivationResponse>('/api/activations', { method: 'POST', body });
/** `date` omitted → the server's school-calendar today (APP_TIMEZONE), not the device's UTC day. */
export const getParticipation = (date?: string, classSection?: string) =>
  apiFetch<ParticipationReport>(
    `/api/reports/participation?${new URLSearchParams(
      Object.entries({ date: date ?? '', class_section: classSection ?? '' }).filter(([, v]) => v),
    ).toString()}`,
  );
export const getPerformance = (from?: string, to?: string, sectionId?: string) =>
  apiFetch<PerformanceReport>(
    `/api/reports/performance?${new URLSearchParams(
      Object.entries({ from: from ?? '', to: to ?? '', section_id: sectionId ?? '' }).filter(([, v]) => v),
    ).toString()}`,
  );
