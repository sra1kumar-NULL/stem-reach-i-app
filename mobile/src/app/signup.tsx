import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signup } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth';

export default function SignupScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classSection, setClassSection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }).start();
  }, [pop]);

  const submit = async () => {
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    if (role === 'student' && !classSection.trim()) {
      setError('Enter your class section (e.g. 10A)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup({
        full_name: name.trim(),
        email: email.trim(),
        password,
        role,
        class_section: role === 'student' ? classSection.trim() : undefined,
      });
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[theme.background, theme.backgroundElement]} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Animated.View style={[styles.head, { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
                <Ionicons name="chevron-back" size={22} color={Accents.primary} />
              </Pressable>
              <ThemedText type="title" style={styles.title}>
                Create account
              </ThemedText>
            </Animated.View>

            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.roleRow}>
                <Pressable
                  style={({ pressed }) => [styles.roleBtn, role === 'student' && styles.roleActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setRole('student')}
                >
                  <Ionicons name="school-outline" size={18} color={role === 'student' ? Nord.nord6 : Nord.nord4} />
                  <Text style={[styles.roleText, role === 'student' && styles.roleTextActive]}>Student</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.roleBtn, role === 'teacher' && styles.roleActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setRole('teacher')}
                >
                  <Ionicons name="person-outline" size={18} color={role === 'teacher' ? Nord.nord6 : Nord.nord4} />
                  <Text style={[styles.roleText, role === 'teacher' && styles.roleTextActive]}>Teacher</Text>
                </Pressable>
              </View>

              <TextInput value={name} onChangeText={setName} placeholder="full name" placeholderTextColor={Nord.nord3} style={styles.input} />
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
              <TextInput value={password} onChangeText={setPassword} placeholder="password (min 8 chars)" placeholderTextColor={Nord.nord3} secureTextEntry style={styles.input} />
              {role === 'student' && (
                <TextInput value={classSection} onChangeText={setClassSection} placeholder="class section (e.g. 10A)" placeholderTextColor={Nord.nord3} autoCapitalize="characters" style={styles.input} />
              )}

              {error && (
                <ThemedText themeColor="textSecondary" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator color={Nord.nord6} /> : <Text style={styles.buttonLabel}>Create account</Text>}
              </Pressable>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 32, lineHeight: 38, flexShrink: 1 },
  card: { borderRadius: 20, padding: 20, gap: 12 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 12,
    paddingVertical: 12,
  },
  roleActive: { backgroundColor: Accents.primary, borderColor: Accents.primary },
  roleText: { color: Nord.nord4, fontWeight: '600' },
  roleTextActive: { color: Nord.nord6, fontWeight: '700' },
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
});