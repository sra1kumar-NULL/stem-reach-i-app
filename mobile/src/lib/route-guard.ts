/**
 * Pure route-guard decision, shared by the (student) / (teacher) layouts and the
 * login / signup screens. No React Native imports so it runs under `npm test`.
 *
 * Given who is signed in and the first URL segment, returns the path to redirect
 * to, or null when the screen may render.
 */

export type GuardRole = 'student' | 'teacher';

export interface GuardInput {
  /** True when a Supabase session exists. */
  signedIn: boolean;
  /** Role from /api/me; undefined while it is still loading (or failed to load). */
  role?: GuardRole | null;
  /** A teacher reset this account's password (or the API said so): only /change-password is allowed. */
  mustChange?: boolean;
  /** First URL segment, e.g. "(student)", "login", "profile"; undefined for "/". */
  segment?: string | null;
}

export const LOGIN_PATH = '/login';
export const CHANGE_PASSWORD_PATH = '/change-password';

export function homeFor(role: GuardRole | null | undefined): string {
  return role === 'teacher' ? '/(teacher)' : role === 'student' ? '/(student)' : '/';
}

/** Screens a signed-in user has no business on. */
const PUBLIC_ONLY = new Set(['login', 'signup']);
/** Need a session but are not tied to a role. */
const ANY_ROLE = new Set(['profile']);
const ROLE_AREAS: Record<string, GuardRole> = { '(student)': 'student', '(teacher)': 'teacher' };

/** True when the segment is a role area, i.e. the decision also depends on the role. */
export function isRoleArea(segment?: string | null): boolean {
  return !!segment && segment in ROLE_AREAS;
}

/**
 * Open on purpose: "/" (has its own gate), forgot-password, reset-password (needs the
 * emailed recovery session, not a normal one) and the offline self-study group.
 */
export function routeGuard({ signedIn, role, mustChange, segment }: GuardInput): string | null {
  const seg = segment ?? '';

  if (PUBLIC_ONLY.has(seg)) {
    if (!signedIn) return null;
    return mustChange ? CHANGE_PASSWORD_PATH : homeFor(role);
  }

  if (seg === 'change-password') return signedIn ? null : LOGIN_PATH;

  const area = ROLE_AREAS[seg];
  if (area || ANY_ROLE.has(seg)) {
    if (!signedIn) return LOGIN_PATH;
    if (mustChange) return CHANGE_PASSWORD_PATH;
    // Role unknown yet: wait (the caller shows a spinner) rather than guess.
    if (area && role && role !== area) return homeFor(role);
  }
  return null;
}
