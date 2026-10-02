import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signup } from '@/api/client';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, Nord, Type } from '@/constants/theme';
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
    <LinearGradient colors={[theme.background, theme.backgroundElement]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Animated.View style={[styles.head, { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <Heading className="text-3xl" style={Type.heading}>
                Create account
              </Heading>
            </Animated.View>

            <Box className="bg-card rounded-3xl p-5 gap-3">
              <Box className="flex-row gap-2.5 mb-1">
                <Pressable
                  style={({ pressed }) => [styles.roleBtn, role === 'student' && styles.roleActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setRole('student')}
                >
                  <Ionicons name="school-outline" size={18} color={role === 'student' ? Nord.nord6 : theme.textSecondary} />
                  <UIText className={`font-semibold ${role === 'student' ? 'text-primary-foreground' : 'text-muted-foreground'}`} style={Type.bodySemi}>
                    Student
                  </UIText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.roleBtn, role === 'teacher' && styles.roleActive, pressed && { opacity: 0.8 }]}
                  onPress={() => setRole('teacher')}
                >
                  <Ionicons name="person-outline" size={18} color={role === 'teacher' ? Nord.nord6 : theme.textSecondary} />
                  <UIText className={`font-semibold ${role === 'teacher' ? 'text-primary-foreground' : 'text-muted-foreground'}`} style={Type.bodySemi}>
                    Teacher
                  </UIText>
                </Pressable>
              </Box>

              <Input className="border border-border rounded-xl bg-background">
                <InputField
                  value={name}
                  onChangeText={setName}
                  placeholder="full name"
                  placeholderTextColor={theme.textSecondary}
                  className="px-4 py-3 text-base"
                  style={{ color: theme.text, fontFamily: Fonts.sans }}
                />
              </Input>
              <Input className="border border-border rounded-xl bg-background">
                <InputField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  className="px-4 py-3 text-base"
                  style={{ color: theme.text, fontFamily: Fonts.sans }}
                />
              </Input>
              <Input className="border border-border rounded-xl bg-background">
                <InputField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="password (min 8 chars)"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  className="px-4 py-3 text-base"
                  style={{ color: theme.text, fontFamily: Fonts.sans }}
                />
              </Input>
              {role === 'student' && (
                <Input className="border border-border rounded-xl bg-background">
                  <InputField
                    value={classSection}
                    onChangeText={setClassSection}
                    placeholder="class section (e.g. 10A)"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="characters"
                    className="px-4 py-3 text-base"
                    style={{ color: theme.text, fontFamily: Fonts.sans }}
                  />
                </Input>
              )}

              {error && (
                <UIText className="text-center text-danger-text text-sm" style={Type.body}>
                  {error}
                </UIText>
              )}

              <Button variant="default" size="lg" className="rounded-xl mt-1" onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator color={theme.textSecondary} /> : <ButtonText style={Type.bodyBold}>Create account</ButtonText>}
              </Button>
            </Box>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = {
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
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
} as const;
