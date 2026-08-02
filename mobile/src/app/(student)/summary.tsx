import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMe } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/state/auth';

export default function SummaryScreen() {
  const { correct = '0', attempted = '0', streak = '0' } = useLocalSearchParams<{ correct: string; attempted: string; streak: string }>();
  const { signOut } = useAuth();
  const [lifetime, setLifetime] = useState<{ answered: number; accuracy: number } | null>(null);

  const a = Number(attempted);
  const c = Number(correct);

  useEffect(() => {
    if (a > 0) return;
    getMe()
      .then((me) => setLifetime({ answered: me.totals.questions_answered, accuracy: me.totals.accuracy }))
      .catch(() => undefined);
  }, [a]);

  const shownCorrect = a > 0 ? c : lifetime ? Math.round(lifetime.answered * lifetime.accuracy) : 0;
  const shownAttempted = a > 0 ? a : lifetime?.answered ?? 0;
  const pct = shownAttempted > 0 ? Math.round((shownCorrect / shownAttempted) * 100) : 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedText type="title" style={styles.title}>
          Daily Revision Complete 🎉
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.score}>{shownCorrect}/{shownAttempted}</ThemedText>
          <ThemedText themeColor="textSecondary">correct this session ({pct}%)</ThemedText>
          <ThemedText style={styles.streak}>Streak: {streak} 🔥</ThemedText>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Come back tomorrow for a fresh set!
        </ThemedText>

        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonLabel}>Back to home</Text>
        </Pressable>
        <Pressable onPress={signOut}>
          <ThemedText themeColor="textSecondary" style={styles.signout}>
            Sign out
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  title: { textAlign: 'center' },
  card: { alignItems: 'center', padding: 32, borderRadius: 24, gap: 8 },
  score: { fontSize: 64, fontWeight: '800' },
  streak: { marginTop: 12, fontSize: 20, fontWeight: '700' },
  note: { textAlign: 'center' },
  button: { backgroundColor: '#3c87f7', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center' },
  buttonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signout: { textAlign: 'center' },
});
