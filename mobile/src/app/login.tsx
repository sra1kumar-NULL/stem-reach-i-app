import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, Nord } from '@/constants/theme';
import { useAuth } from '@/state/auth';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useRouteGuard } from '@/hooks/use-route-guard';
import { useTheme } from '@/hooks/use-theme';
import { AuthField } from '@/components/auth-shell';
import { toAuthError } from '@/lib/friendly-error';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

const DECOR: { icon: string; color: string; top?: DimensionValue; left?: DimensionValue; right?: DimensionValue; bottom?: DimensionValue; size: number; rot: string }[] = [
  { icon: 'book-outline', color: Nord.nord9, top: '12%', left: '12%', size: 40, rot: '-15deg' },
  { icon: 'school-outline', color: Nord.nord7, top: '16%', right: '14%', size: 46, rot: '10deg' },
  { icon: 'star-outline', color: Nord.nord13, bottom: '28%', left: '16%', size: 34, rot: '0deg' },
  { icon: 'flask-outline', color: Nord.nord15, bottom: '34%', right: '18%', size: 38, rot: '12deg' },
];

export default function LoginScreen() {
  const { signIn, notice, clearNotice } = useAuth();
  const { redirect } = useRouteGuard();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const [bounced, setBounced] = useState<number | null>(null);
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }),
    ]).start();
  }, [pop]);

  useEffect(() => {
    if (reduceMotion) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2500, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2500, useNativeDriver: true }),
      ]),
    ).start();
  }, [reduceMotion, float]);

  useEffect(() => {
    if (bounced == null) return;
    bounce.setValue(0);
    Animated.spring(bounce, { toValue: 1, useNativeDriver: true, friction: 4, tension: 90 }).start();
  }, [bounced, bounce]);

  const router = useRouter();

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }
    setBusy(true);
    setError(null);
    clearNotice();
    try {
      await signIn(email.trim(), password);
      router.replace('/'); // Ensure this navigates to the home screen
    } catch (e) {
      // signIn() already throws friendly copy; anything else goes through the same helper.
      setError(e instanceof Error && e.message ? e.message : toAuthError(e, 'Sign in failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (redirect) return <Redirect href={redirect} />;

  return (
    <LinearGradient colors={[theme.background, theme.backgroundElement]} style={{ flex: 1 }}>
      {DECOR.map((d, i) => (
        <Pressable
          key={i}
          onPress={() => setBounced(i)}
          style={[styles.decorTouch, { top: d.top, left: d.left, right: d.right, bottom: d.bottom }]}
          // Decorative: hidden from screen readers.
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[
              styles.decor,
              styles.decorNoPointer,
              {
                transform: [
                  { rotate: d.rot },
                  { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 === 0 ? -10 : 10] }) },
                  {
                    scale: bounced === i
                      ? bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] })
                      : 1,
                  },
                ],
              },
            ]}
          >
            <Ionicons name={d.icon as keyof typeof Ionicons.glyphMap} size={d.size} color={d.color} style={{ opacity: 0.85 }} />
          </Animated.View>
        </Pressable>
      ))}

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
          <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            <Box className="items-center mb-1">
              <Ionicons name="rocket" size={52} color={theme.textSecondary} />
            </Box>
          </Animated.View>
          <Heading className="text-center text-3xl" style={{ fontFamily: Fonts.rounded }}>
            Daily Revision
          </Heading>

          <Box className="bg-card rounded-2xl p-5 gap-3">
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
            />
            <AuthField
              label="Password"
              password
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />

            {notice && !error && (
              <Text accessibilityRole="alert" className="text-center text-warn-text text-sm" style={{ fontFamily: Fonts.sans }}>
                {notice}
              </Text>
            )}
            {error && (
              <Text accessibilityRole="alert" className="text-center text-danger-text text-sm" style={{ fontFamily: Fonts.sans }}>
                {error}
              </Text>
            )}

            <Button variant="default" size="lg" className="rounded-xl mt-1" onPress={submit} disabled={busy} accessibilityState={{ busy }}>
              {busy ? (
                <ActivityIndicator color={Nord.nord6} />
              ) : (
                <ButtonText style={{ fontFamily: Fonts.sans }}>Sign in</ButtonText>
              )}
            </Button>
            <Pressable
              onPress={() => router.push('/forgot-password')}
              className="min-h-11 items-center justify-center py-1"
              accessibilityRole="link"
              accessibilityLabel="Forgot password? Get help signing in"
            >
              <Text className="text-primary-text text-sm font-bold underline" style={{ fontFamily: Fonts.sans }}>
                Forgot password?
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/signup')}
              className="min-h-11 items-center justify-center py-1.5"
              accessibilityRole="link"
              accessibilityLabel="New here? Create an account"
            >
              <Text className="text-primary-text text-sm font-bold" style={{ fontFamily: Fonts.sans }}>
                New here? Create an account
              </Text>
            </Pressable>
          </Box>

          <Button
            variant="outline"
            size="lg"
            className="min-h-11 rounded-xl mt-2"
            onPress={() => router.push('/(self-study)')}
            accessibilityRole="link"
            accessibilityLabel="Study offline, no account needed"
          >
            <ButtonText style={{ fontFamily: Fonts.sans }}>Study offline (no account)</ButtonText>
          </Button>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = {
  safe: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  decorTouch: { position: 'absolute' },
  decor: { opacity: 0.9 },
  decorNoPointer: { pointerEvents: 'none' },
} as const;
