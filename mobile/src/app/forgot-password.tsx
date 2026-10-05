import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AuthField, AuthShell } from '@/components/auth-shell';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Fonts, Nord } from '@/constants/theme';
import { cooldownRemaining, isValidEmail } from '@/lib/auth-links';
import { EMAIL_RESET_ENABLED } from '@/lib/features';
import { useAuth } from '@/state/auth';

const TEACHER_STEPS = [
  'Tell your teacher you forgot your password.',
  'Your teacher gives you a temporary password.',
  'Sign in with it. You will be asked to choose your own new password.',
];

/**
 * Password help. The default path is the teacher setting a temporary password (Students screen).
 * The "email me a link" form only appears when EMAIL_RESET_ENABLED (needs SMTP configured in Supabase).
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const goLogin = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle={
        EMAIL_RESET_ENABLED
          ? 'Your teacher can set a new one for you, or we can email you a link.'
          : 'Your teacher can set a new one for you.'
      }
      icon="help-buoy"
    >
      <Box className="gap-2">
        <Text className="text-foreground font-bold" style={{ fontFamily: Fonts.sans }}>
          Students
        </Text>
        {TEACHER_STEPS.map((step, i) => (
          <Box key={step} className="flex-row gap-2">
            <Text className="text-primary-text font-bold" style={{ fontFamily: Fonts.sans }}>
              {i + 1}.
            </Text>
            <Text className="flex-1 text-muted-foreground" style={{ fontFamily: Fonts.sans }}>
              {step}
            </Text>
          </Box>
        ))}
        <Text className="mt-2 text-foreground font-bold" style={{ fontFamily: Fonts.sans }}>
          Teachers
        </Text>
        <Text className="text-muted-foreground" style={{ fontFamily: Fonts.sans }}>
          Ask your school admin to reset your password.
        </Text>
      </Box>

      {EMAIL_RESET_ENABLED ? <EmailResetForm /> : null}

      <Button variant="default" size="lg" className="rounded-xl mt-1" onPress={goLogin} accessibilityLabel="Back to sign in">
        <ButtonText style={{ fontFamily: Fonts.sans }}>Back to sign in</ButtonText>
      </Button>
    </AuthShell>
  );
}

/** Email-a-link form (only rendered when email reset is switched on). The success copy is identical for known and unknown addresses. */
function EmailResetForm() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const wait = cooldownRemaining(sentAt, now);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  const submit = async () => {
    if (busy || wait > 0) return;
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      setSentAt(Date.now());
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box className="gap-3 border-t border-border pt-3">
      <Text className="text-foreground font-bold" style={{ fontFamily: Fonts.sans }}>
        Or reset by email
      </Text>
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="email"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />

      {error && (
        <Text accessibilityRole="alert" className="text-center text-danger-text text-sm" style={{ fontFamily: Fonts.sans }}>
          {error}
        </Text>
      )}
      {sent && !error && (
        <Text accessibilityRole="alert" className="text-center text-success-text text-sm" style={{ fontFamily: Fonts.sans }}>
          If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.
        </Text>
      )}

      <Button
        variant="outline"
        size="lg"
        className={`rounded-xl ${wait > 0 ? 'opacity-60' : ''}`}
        onPress={submit}
        disabled={busy || wait > 0}
        accessibilityState={{ disabled: busy || wait > 0, busy }}
      >
        {busy ? (
          <ActivityIndicator color={Nord.nord6} />
        ) : (
          <ButtonText style={{ fontFamily: Fonts.sans }}>
            {wait > 0 ? `Send again in ${wait}s` : sent ? 'Send again' : 'Send reset link'}
          </ButtonText>
        )}
      </Button>
    </Box>
  );
}

