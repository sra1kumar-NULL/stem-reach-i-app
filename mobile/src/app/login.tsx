import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/state/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }),
    ]).start();
  }, [pop]);

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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
          <Animated.Text style={[styles.emoji, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
            🚀
          </Animated.Text>
          <ThemedText type="title" style={styles.title}>
            Daily Revision
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            STEMRI · MES School Lakkere
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor="#888"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor="#888"
              secureTextEntry
              style={styles.input}
            />

            {error && (
              <ThemedText themeColor="textSecondary" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonLabel}>Sign in</ThemedText>}
            </Pressable>
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Demo: teacher@stemri.local · s1@stemri.local … s5@stemri.local — password Stemri@2026
          </ThemedText>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  emoji: { fontSize: 56, textAlign: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  card: { borderRadius: 20, padding: 20, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
  error: { textAlign: 'center' },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { textAlign: 'center', marginTop: 8 },
});
