import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';
import { useAuth } from '@/state/auth';
import { useTheme } from '@/hooks/use-theme';

const DECOR: { icon: string; color: string; top?: DimensionValue; left?: DimensionValue; right?: DimensionValue; bottom?: DimensionValue; size: number; rot: string }[] = [
  { icon: 'book-outline', color: Nord.nord9, top: '12%', left: '12%', size: 40, rot: '-15deg' },
  { icon: 'school-outline', color: Nord.nord7, top: '16%', right: '14%', size: 46, rot: '10deg' },
  { icon: 'star-outline', color: Nord.nord13, bottom: '28%', left: '16%', size: 34, rot: '0deg' },
  { icon: 'flask-outline', color: Nord.nord15, bottom: '34%', right: '18%', size: 38, rot: '12deg' },
];

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2500, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2500, useNativeDriver: true }),
      ]),
    ).start();
  }, [pop, float]);

  useEffect(() => {
    if (bounced == null) return;
    bounce.setValue(0);
    Animated.spring(bounce, { toValue: 1, useNativeDriver: true, friction: 4, tension: 90 }).start();
  }, [bounced, bounce]);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[theme.background, theme.backgroundElement]} style={styles.container}>
      {DECOR.map((d, i) => (
        <Pressable
          key={i}
          onPress={() => setBounced(i)}
          style={[styles.decorTouch, { top: d.top, left: d.left, right: d.right, bottom: d.bottom }]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.decor,
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
            <View style={styles.logoWrap}>
              <Ionicons name="rocket" size={52} color={Accents.primary} />
            </View>
          </Animated.View>
          <ThemedText type="title" style={styles.title}>
            Daily Revision
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor={Nord.nord3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor={Nord.nord3}
              secureTextEntry
              style={styles.input}
            />

            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={Nord.nord6} /> : <ThemedText style={styles.buttonLabel}>Sign in</ThemedText>}
            </Pressable>
            <Pressable onPress={() => router.push('/signup')} style={({ pressed }) => [styles.signupLink, pressed && { opacity: 0.6 }]}>
              <Text style={styles.signupText}>New here? Create an account</Text>
            </Pressable>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  decorTouch: { position: 'absolute' },
  decor: { opacity: 0.9 },
  logoWrap: { alignItems: 'center', marginBottom: 4 },
  title: { textAlign: 'center' },
  card: { borderRadius: 20, padding: 20, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Nord.nord6,
  },
  error: { textAlign: 'center' },
  button: {
    backgroundColor: Accents.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { color: Nord.nord6, fontWeight: '700', fontSize: 16 },
  signupLink: { alignItems: 'center', paddingVertical: 6 },
  signupText: { color: Accents.primary, fontWeight: '700', fontSize: 14 },
});
