import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getFeedToday, getMe, submitAnswer } from '@/api/client';
import { QuestionCard } from '@/components/question-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getFeedToday(), getMe()])
      .then(([f, me]) => {
        setFeed(f);
        setStreak(me.streak.current);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'failed to load feed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

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
          Your teacher hasn't activated today's topics yet. Check back after class!
        </ThemedText>
        <ThemedText themeColor="textSecondary">Current streak: {streak} 🔥</ThemedText>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryLabel}>Refresh</Text>
        </Pressable>
        <Pressable onPress={signOut}>
          <ThemedText themeColor="textSecondary">Sign out</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const completed = feed?.progress.completed === true || done;

  useEffect(() => {
    if (completed) {
      router.replace({
        pathname: '/(student)/summary',
        params: {
          correct: String(stats.correct),
          attempted: String(stats.attempted || feed?.progress.answered || 0),
          streak: String(streak),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { top: height > 700 ? 48 : 24 }]} pointerEvents="box-none">
        <ThemedView style={styles.pill}>
          <ThemedText type="smallBold">
            {feed.progress.answered}/{feed.progress.total}
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.pill}>
          <ThemedText type="smallBold">🔥 {streak}</ThemedText>
        </ThemedView>
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
    justifyContent: 'space-between',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center' },
  retryBtn: { backgroundColor: '#3c87f7', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  retryLabel: { color: '#fff', fontWeight: '700' },
});
