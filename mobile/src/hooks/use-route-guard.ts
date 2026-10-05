import type { Href } from 'expo-router';
import { useSegments } from 'expo-router';

import { isRoleArea, routeGuard, type GuardRole } from '@/lib/route-guard';
import { useAuth } from '@/state/auth';

export interface RouteGuardResult {
  /** Where to send the user, or null when the screen may render. */
  redirect: Href | null;
  /** The decision needs data that has not arrived yet (session restore / role): show a spinner. */
  pending: boolean;
}

/** Applies `routeGuard` to the current URL using the auth state. */
export function useRouteGuard(): RouteGuardResult {
  const { session, me, loading, meStatus, mustChangePassword } = useAuth();
  const segments = useSegments() as string[];
  const segment = segments[0];
  const role = (me?.profile.role as GuardRole | undefined) ?? undefined;

  if (loading) {
    // Public screens render at once (no flash of a spinner on /login); protected ones wait.
    return { redirect: null, pending: segment !== 'login' && segment !== 'signup' };
  }
  const redirect = routeGuard({ signedIn: !!session, role, mustChange: mustChangePassword, segment });
  if (redirect) return { redirect: redirect as Href, pending: false };
  // Signed in, inside a role area, profile still loading: wait instead of guessing the role.
  const waitingForRole = !!session && !role && isRoleArea(segment) && (meStatus === 'idle' || meStatus === 'loading');
  return { redirect: null, pending: waitingForRole };
}
