import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, View } from 'react-native';

import { changePassword } from '@/api/students';
import { AuthShell } from '@/components/auth-shell';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { useToast } from '@/components/toast';
import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Fonts, Nord } from '@/constants/theme';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import { useTheme } from '@/hooks/use-theme';
import { validateNewPassword } from '@/lib/auth-links';
import { toFriendlyError } from '@/lib/friendly-error';
import { supabase, useAuth } from '@/state/auth';

/**
 * Forced screen: shown when a teacher reset this account's password
 * (session.user.app_metadata.must_change_password). The API refuses every other
 * route until the new password is saved, so there is no way around it — only
 * "Sign out" leaves. After saving, the Supabase session is refreshed so the flag clears.
 */
export default function ChangePasswordScreen() {
  const { session, loading } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android hardware back must not escape the forced screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  // Flag already cleared (e.g. page reloaded after saving): nothing to force.
  if (session.user.app_metadata?.must_change_password !== true && !busy) return <Redirect href="/" />;

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
      await changePassword(password);
      // Pull a fresh JWT/user so app_metadata.must_change_password is false client-side too.
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session) {
        // Refresh failed (rare): sign in again with the new password rather than stranding the user.
        const email = session.user.email;
        if (!email) throw new Error('refresh failed');
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw new Error('refresh failed');
      }
      showToast('Password updated. Welcome back!', 'success');
      router.replace('/');
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't update your password. Please try again."));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      icon="key"
      subtitle="Your teacher reset your password. Choose a new one that only you know (at least 8 characters)."
    >
      <Input className="border border-border rounded-xl bg-background">
        <InputField
          value={password}
          onChangeText={setPassword}
          placeholder="new password"
          accessibilityLabel="New password"
          autoComplete="new-password"
          textContentType="newPassword"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          className="px-4 py-3 text-base"
          style={{ color: theme.text, fontFamily: Fonts.sans }}
        />
      </Input>
      <Input className="border border-border rounded-xl bg-background">
        <InputField
          value={confirm}
          onChangeText={setConfirm}
          placeholder="confirm new password"
          accessibilityLabel="Confirm new password"
          autoComplete="new-password"
          textContentType="newPassword"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          className="px-4 py-3 text-base"
          style={{ color: theme.text, fontFamily: Fonts.sans }}
        />
      </Input>

      {error && (
        <Text accessibilityRole="alert" className="text-center text-danger-text text-sm" style={{ fontFamily: Fonts.sans }}>
          {error}
        </Text>
      )}

      <Button variant="default" size="lg" className="rounded-xl mt-1" onPress={submit} disabled={busy} accessibilityState={{ disabled: busy, busy }}>
        {busy ? <ActivityIndicator color={Nord.nord6} /> : <ButtonText style={{ fontFamily: Fonts.sans }}>Save new password</ButtonText>}
      </Button>

      <Pressable onPress={openConfirm} disabled={busy} className="min-h-11 items-center justify-center py-1.5" accessibilityRole="button" accessibilityLabel="Sign out">
        <Text className="text-primary-text text-sm font-bold" style={{ fontFamily: Fonts.sans }}>
          Sign out
        </Text>
      </Pressable>

      <ConfirmSheet
        visible={confirmOut}
        title="Sign out?"
        message="You'll need your temporary password to sign in again."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={confirmSignOut}
        onCancel={closeConfirm}
      />
    </AuthShell>
  );
}
