import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMe, markAuthInitialized, setAccessToken } from '@/api/client';
import { toFriendlyError } from '@/lib/friendly-error';
import { resetRedirectUrl } from '@/lib/auth-links';
import type { MeResponse } from '@stemreach/core';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Hard cap on how long `signOut()` waits for the remote logout — after this the
 * local session is cleared anyway so the user always lands on the login screen. */
const SIGN_OUT_TIMEOUT_MS = 4000;

/** URL fragment as it was when the page loaded (web only). Supabase puts recovery-link errors
 * there and may clear it during client init, so it is captured before the client is created. */
export const initialUrlHash: string =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash : '';

export const supabase: SupabaseClient = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Web only: the password-reset email lands on /reset-password#access_token=…; native never parses URLs.
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

/** Lifecycle of the post-sign-in `getMe()` fetch — `index.tsx` must not treat
 * "still loading" or "temporarily failed" as "not authenticated". */
export type MeStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AuthState {
  session: Session | null;
  me: MeResponse | null;
  loading: boolean;
  meStatus: MeStatus;
  signingOut: boolean;
  retryMe: () => void;
  /** Replaces the cached /api/me (e.g. with the PATCH /api/me response) so every screen sees the change. */
  applyMe: (next: MeResponse) => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Emails a reset link. Resolves the same way whether or not the address has an account. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the current (recovery or normal) session. */
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>('idle');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        // Publish the restored token synchronously so any apiFetch racing this
        // restore (or a screen mounting in the next tick) still gets the header.
        setAccessToken(data.session?.access_token ?? null);
        setLoading(false);
      })
      .catch(() => {
        // Restore failed — treat as signed out rather than spinning forever.
        setLoading(false);
      })
      .finally(() => {
        // Initial restore settled (session or none): release waiting apiFetches.
        markAuthInitialized();
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAccessToken(next?.access_token ?? null);
      if (!next) setMe(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const token = session?.access_token;

  const loadMe = useCallback(async () => {
    if (!token) return;
    setMeStatus('loading');
    try {
      const m = await getMe();
      setMe(m);
      setMeStatus('ready');
    } catch {
      // API unreachable / cold start — keep the session and surface a retry
      // instead of bouncing a signed-in user back to the login form.
      setMe(null);
      setMeStatus('error');
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setMeStatus('idle');
      return;
    }
    setAccessToken(token);
    void loadMe();
  }, [token, loadMe]);

  const applyMe = useCallback((next: MeResponse) => {
    setMe(next);
    setMeStatus('ready');
  }, []);

  const retryMe = useCallback(() => {
    void loadMe();
  }, [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const redirectTo = resetRedirectUrl({
      isWeb: Platform.OS === 'web',
      origin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
      webUrl: process.env.EXPO_PUBLIC_WEB_URL,
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      if (error.status === 429 || /rate limit/i.test(error.message)) {
        throw new Error('Too many reset requests. Please wait a few minutes and try again.');
      }
      throw new Error(toFriendlyError(error, "Couldn't send the reset email. Please try again."));
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(toFriendlyError(error, error.message || "Couldn't update your password. Please try again."));
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      // Cap the remote logout: a hung Supabase call must never freeze the UI.
      // The race attaches handlers to both promises, so a late rejection of the
      // loser is swallowed too — signOut() can never reject.
      await Promise.race([supabase.auth.signOut(), delay(SIGN_OUT_TIMEOUT_MS)]);
    } catch {
      // Remote failure or timeout is swallowed — the user signs out locally anyway.
    } finally {
      // auth-js only removes the persisted AsyncStorage session AFTER the remote
      // /logout settles — and in the installed @supabase/auth-js 2.111.0 even
      // `signOut({ scope: 'local' })` does not skip the network: `_signOut`
      // (src/GoTrueClient.ts) calls `admin.signOut(accessToken, scope)`, which
      // is a real `POST /logout?scope=local` (src/GoTrueAdminApi.ts), and only
      // then runs `_removeSession()`. A hung remote would therefore leave the
      // stored session behind and restore it on the next cold start — so drop
      // the same keys `_removeSession` clears, straight through the storage
      // adapter, with no network involved. Idempotent when the remote call
      // already won, and nothing can resurrect the session afterwards because
      // every session read (`__loadSession`) goes to storage first.
      try {
        // auth-js keeps the key as a protected field (`sb-<project-ref>-auth-token`
        // as defaulted by supabase-js); read it off the live client so it always
        // matches what the client actually wrote.
        const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
        await AsyncStorage.multiRemove([key, `${key}-user`]);
      } catch {
        // Best effort: the in-memory auth state below is cleared regardless.
      }
      setSession(null);
      setMe(null);
      setAccessToken(null);
      // Logged-out state: `index.tsx` redirects on !session before it reads
      // meStatus, and 'idle' is what the no-token effect converges on anyway.
      setMeStatus('idle');
      setSigningOut(false);
    }
  }, []);

  const value = useMemo(
    () => ({ session, me, loading, meStatus, signingOut, retryMe, applyMe, signIn, requestPasswordReset, updatePassword, signOut }),
    [session, me, loading, meStatus, signingOut, retryMe, applyMe, signIn, requestPasswordReset, updatePassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
