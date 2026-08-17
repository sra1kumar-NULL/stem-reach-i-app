import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getFeedToday, getMe, submitAnswer } from '@/api/client';
import { QuestionCard } from '@/components/question-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';
import { useAuth } from '@/state/auth';
import type { FeedResponse, SubmissionResponse } from '@stemreach/core';

export default function FeedScreen() {
  const { height } = useWindowDimensions();
  const { signOut } = useAuth();
  const listRef = useRef<FlatList>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, attempted: 0 });
  const [done, setDone] = useState(false);
  const barWidth = useRef(new Animated.Value(0)).current;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getFeedToday(), getMe()])
      .then(([f, me]) =>  {
        setFeed(f);
        setStreak(me.streak.current);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'failed to load feed'))
      .finally(() => setLoading(false));
  }, []);


  const shownAnswered = (feed?.progress.answered ?? 0) + stats.attempted;
  const progressPct = feed && feed.progress.total > 0 ? shownAnswered / feed.progress.total : 0;

  useEffect(load, [load]);

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progressPct * 100,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [barWidth, progressPct]);

  const sectionLabel = (sectionId: string) =>
    feed?.sections.find((s) => s.id === sectionId)?.name ?? 'Revision';

  const handleSubmit = useCallback(
    async (questionId: string, body: { selected_option?: number; self_eval?: 'got_it' | 'need_practice' }) => {
      if (!feed?.set) throw new Error('no active set');
      return submitAnswer({ question_id: questionId, daily_set_id: feed.set.id, ...body });
    },
    [feed?.set],
  );

  const handleAnswered = useCallback(
    (isCorrect: boolean) => {
      setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), attempted: s.attempted + 1 }));
    },
    [],
  );

  const handleAdvance = useCallback(
    (index: number) => {
      if (!feed) return;
      if (index >= feed.questions.length - 1) {
        setDone(true);
        return;
      }
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    },
    [feed],
  );

  const completed = feed != null && (feed.progress.completed === true || done);

  useEffect(() => {
    if (!completed) return;
    router.replace({
      pathname: '/(student)/summary',
      params: {
        correct: String(stats.correct),
        attempted: String(stats.attempted || feed?.progress.answered || 0),
        streak: String(streak),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">{error}</ThemedText>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      </ThemedView>
    );
  }

  if (!feed || feed.empty) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title" style={styles.emptyTitle}>
          No revision yet today
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          Your teacher hasn't activated today's topics yet. Check back later!
        </ThemedText>
        <ThemedText themeColor="textSecondary">Current streak: {streak} 🔥</ThemedText>
        <Pressable style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]} onPress={load}>
          <Text style={styles.retryLabel}>Refresh</Text>
        </Pressable>
        <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}>
          <Ionicons name="log-out-outline" size={14} color={Nord.nord4} />
          <Text style={styles.signoutPillText}>Sign out</Text>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { top: height > 700 ? 48 : 24 }]} pointerEvents="box-none">
        <ThemedView style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View style={styles.progressLabel}>
              <Ionicons name="flash" size={14} color={Accents.primary} />
              <ThemedText type="smallBold">
                {shownAnswered}/{feed.progress.total}
              </ThemedText>
            </View>
            <View style={styles.progressLabel}>
              <Ionicons name="flame" size={14} color={Accents.warn} />
              <ThemedText type="smallBold">{streak}</ThemedText>
            </View>
          </View>
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth }]} />
          </View>
        </ThemedView>
        <Pressable onPress={() => signOut()} style={({ pressed }) => [styles.signoutBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="log-out-outline" size={18} color={Nord.nord4} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={feed.questions}
        keyExtractor={(q) => q.id}
        renderItem={({ item, index }) => (
          <View style={{ height, paddingTop: height > 700 ? 64 : 40 }}>
            <QuestionCard
              question={item}
              sectionLabel={sectionLabel(item.section_id)}
              questionNo={index + 1}
              total={feed.questions.length}
              onSubmit={handleSubmit}
              onAnswered={handleAnswered}
              onAdvance={() => handleAdvance(index)}
            />
          </View>
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        initialNumToRender={2}
        windowSize={3}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressCard: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Accents.primary },
  signoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Accents.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 52, 64, 0.35)',
  },
  signoutPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Accents.border, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  signoutPillText: { color: Nord.nord4, fontWeight: '600' },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center' },
  retryBtn: { backgroundColor: Accents.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryLabel: { color: Nord.nord6, fontWeight: '700' },
});
