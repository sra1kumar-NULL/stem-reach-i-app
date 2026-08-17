import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMe } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents } from '@/constants/theme';
import { useAuth } from '@/state/auth';

export default function SummaryScreen() {
  const { correct = '0', attempted = '0', streak = '0' } = useLocalSearchParams<{ correct: string; attempted: string; streak: string }>();
  const { signOut } = useAuth();
  const [lifetime, setLifetime] = useState<{ answered: number; accuracy: number } | null>(null);
  const pop = useRef(new Animated.Value(0)).current;

  const a = Number(attempted);
  const c = Number(correct);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(150),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }),
    ]).start();
  }, [pop]);

  useEffect(() => {
    if (a > 0) return;
    getMe()
      .then((me) => setLifetime({ answered: me.totals.questions_answered, accuracy: me.totals.accuracy }))
      .catch(() => undefined);
  }, [a]);

  const shownCorrect = a > 0 ? c : lifetime ? Math.round(lifetime.answered * lifetime.accuracy) : 0;
  const shownAttempted = a > 0 ? a : lifetime?.answered ?? 0;
  const pct = shownAttempted > 0 ? Math.round((shownCorrect / shownAttempted) * 100) : 0;
  const hero = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <Animated.Text style={[styles.hero, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }] }]}>
          {hero}
        </Animated.Text>

        <ThemedText type="title" style={styles.title}>
          Daily Revision Complete!
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.cardWrap}>
          <Animated.View
            style={{
              opacity: pop,
              transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }}
          >
            <ThemedText style={styles.score}>
              {shownCorrect}
              <ThemedText style={styles.scoreTotal}>/{shownAttempted}</ThemedText>
            </ThemedText>
            <ThemedText themeColor="textSecondary">correct this session · {pct}%</ThemedText>
            <ThemedText style={styles.streak}>Streak: {streak} 🔥</ThemedText>
          </Animated.View>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Come back tomorrow for a fresh set! 🌟
        </ThemedText>

        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} onPress={() => router.replace('/')}>
          <Text style={styles.buttonLabel}>Back to home</Text>
        </Pressable>
        <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}>
          <Text style={styles.signoutText}>⏻ Sign out</Text>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  hero: { fontSize: 72 },
  title: { textAlign: 'center', fontSize: 32, lineHeight: 38 },
  cardWrap: { alignItems: 'center', padding: 32, borderRadius: 24, gap: 8, alignSelf: 'stretch' },
  score: { fontSize: 64, fontWeight: '800' },
  scoreTotal: { color: '#666', fontSize: 40, fontWeight: '700' },
  streak: { marginTop: 12, fontSize: 20, fontWeight: '700' },
  note: { textAlign: 'center' },
  button: { backgroundColor: Accents.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center' },
  buttonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signoutPill: { borderWidth: 1, borderColor: '#555', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  signoutText: { color: '#888', fontWeight: '600' },
});
