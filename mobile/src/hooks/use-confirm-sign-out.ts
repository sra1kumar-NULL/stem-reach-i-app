/**
 * Confirmation-sheet sign-out flow shared by every screen with a Sign out
 * control: `openConfirm` shows the sheet, `confirmSignOut` fires the auth
 * layer's never-rejecting `signOut()`, then lands the user on /login — the
 * auth gate in app/index.tsx only guards the '/' route, so a mounted
 * student/teacher screen would otherwise stay up with a null session — and
 * closes the sheet in `.finally` (setState on an unmounted hook is a no-op).
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/state/auth';

export function useConfirmSignOut() {
  const { signOut, signingOut } = useAuth();
  const router = useRouter();
  const [confirmOut, setConfirmOut] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on every mount so a StrictMode remount doesn't leave it false.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const openConfirm = useCallback(() => setConfirmOut(true), []);
  const closeConfirm = useCallback(() => setConfirmOut(false), []);
  const confirmSignOut = useCallback(() => {
    void signOut()
      .then(() => {
        // signOut() resolves only once the session is gone (it never rejects).
        if (mountedRef.current) router.replace('/login');
      })
      .finally(() => setConfirmOut(false));
  }, [signOut, router]);

  return { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut };
}
