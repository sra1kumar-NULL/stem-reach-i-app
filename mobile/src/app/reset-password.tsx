import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { AuthField, AuthShell } from '@/components/auth-shell';
import { useToast } from '@/components/toast';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Fonts, Nord } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseRecoveryError, validateNewPassword } from '@/lib/auth-links';
import { initialUrlHash, useAuth } from '@/state/auth';

/** How long to wait for Supabase to turn the emailed link into a session before calling it invalid. */
const SESSION_WAIT_MS = 4000;

/**
 * Landing page of the password-reset email (web). Supabase's client exchanges the
 * link for a recovery session; this screen then lets the user choose a new
 * password, signs them out, and sends them to the login screen.
 */
export default function ResetPasswordScreen() {
  const { session, loading, updatePassword, signOut } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const linkError = parseRecoveryError(initialUrlHash);
  const [timedOut, setTimedOut] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || session || linkError) return;
    const t = setTimeout(() => setTimedOut(true), SESSION_WAIT_MS);
    return () => clearTimeout(t);
  }, [loading, session, linkError]);

  const submit = async () => {
    if (busy) return;
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      await signOut();
      showToast('Password updated. Please sign in with your new password.', 'success');
      router.replace('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update your password. Please try again.");
      setBusy(false);
    }
  };

  // 1) The link itself was bad or expired.
  // 2) No session appeared after waiting (opened without a link, or already used).
  if (linkError || (!loading && !session && timedOut)) {
    return (
      <AuthShell title="Link not valid" icon="alert-circle" subtitle={linkError ?? 'This reset link is missing, expired, or already used.'}>
        <Button variant="default" size="lg" className="rounded-xl" onPress={() => router.replace('/forgot-password')}>
          <ButtonText style={{ fontFamily: Fonts.sans }}>Request a new link</ButtonText>
        </Button>
        <Pressable onPress={() => router.replace('/login')} className="min-h-11 items-center justify-center py-1.5" accessibilityRole="link">
          <Text className="text-primary-text text-sm font-bold" style={{ fontFamily: Fonts.sans }}>
            Back to sign in
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  if (loading || !session) {
    return (
      <AuthShell title="Checking your link…" icon="mail-open">
        <ActivityIndicator accessibilityLabel="Checking your reset link" color={theme.textSecondary} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters." icon="key">
      <AuthField
        label="New password"
        hint="At least 8 characters"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="new password"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <AuthField
        label="Type it again"
        password
        value={confirm}
        onChangeText={setConfirm}
        placeholder="confirm new password"
        accessibilityLabel="Confirm new password"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      {error && (
        <Text accessibilityRole="alert" className="text-center text-danger-text text-sm" style={{ fontFamily: Fonts.sans }}>
          {error}
        </Text>
      )}

      <Button variant="default" size="lg" className="rounded-xl mt-1" onPress={submit} disabled={busy} accessibilityState={{ disabled: busy, busy }}>
        {busy ? <ActivityIndicator color={Nord.nord6} /> : <ButtonText style={{ fontFamily: Fonts.sans }}>Update password</ButtonText>}
      </Button>
    </AuthShell>
  );
}
