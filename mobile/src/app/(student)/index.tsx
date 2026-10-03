import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFeedToday, getMe, submitAnswer } from '@/api/client';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { QuestionCard } from '@/components/question-card';
import { ThemeToggle } from '@/components/theme-toggle';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Type } from '@/constants/theme';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import type { FeedResponse, SelfEval } from '@stemreach/core';

export default function FeedScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Page height = the feed container's measured height, not the window's: the
  // window includes status/nav bars, so fixed window-height pages were clipped.
  const [pageHeight, setPageHeight] = useState(0);
  const height = pageHeight > 0 ? pageHeight : windowHeight;
  /** Header sits below the status bar / notch; pages reserve room for it. */
  const headerTop = insets.top + 8;
  const pageTopPad = headerTop + 64;
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();
  const theme = useTheme();
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
      .catch((e) => setError(toFriendlyError(e, 'Could not load today\'s revision.')))
      .finally(() => setLoading(false));
  }, []);

  // Reviews are uncapped (up to MAX_QUEUE) while `total` is the per-section
  // target, so `answered` can legitimately exceed it (e.g. 18/15). The header
  // tracks target progress — clamp the numerator and the bar at `total`.
  const shownAnswered = (feed?.progress.answered ?? 0) + stats.attempted;
  const progressPct = feed && feed.progress.total > 0 ? Math.min(shownAnswered / feed.progress.total, 1) : 0;

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
    async (questionId: string, body: { selected_option?: number; self_eval?: SelfEval }) => {
      if (!feed?.set) throw new Error('no active set');
      return submitAnswer({ question_id: questionId, daily_set_id: feed.set.id, ...body });
    },
    [feed],
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

  // Only the in-session finish routes to the summary. A feed that is already
  // complete on load renders the "Done for today" state below instead —
  // redirecting there made summary's "Back to home" (→ / → feed → summary)
  // loop forever, and showed a fabricated "0/N · 0%" score on reopen.
  useEffect(() => {
    if (!done) return;
    router.replace({
      pathname: '/(student)/summary',
      params: { correct: String(stats.correct), attempted: String(stats.attempted) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (loading) {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={Accents.primary} />
      </Box>
    );
  }

  // Theme / offline self-study / sign out: shared by the empty and error states
  // so a student is never stuck on a screen with only Retry.
  const escapeHatches = (
    <>
      <View style={styles.emptyActions}>
        <ThemeToggle />
        <Pressable
          onPress={() => router.push('/(self-study)')}
          style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Self study"
        >
          <Ionicons name="library-outline" size={14} color={theme.textSecondary} />
          <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
            Study
          </UIText>
        </Pressable>
        <Pressable
          onPress={openConfirm}
          style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={14} color={theme.textSecondary} />
          <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
            Sign out
          </UIText>
        </Pressable>
      </View>
      <ConfirmSheet
        visible={confirmOut}
        title="Sign out?"
        message="You'll need to sign in again to continue."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={confirmSignOut}
        onCancel={closeConfirm}
      />
    </>
  );

  if (error) {
    return (
      <ErrorState fill message={error} onRetry={load}>
        {escapeHatches}
      </ErrorState>
    );
  }

  if (feed?.progress.completed && !done) {
    return (
      <Box className="flex-1 items-center justify-center p-8 gap-4 bg-background">
        <Text style={{ fontSize: 56 }} accessible={false}>
          🎊
        </Text>
        <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
          Done for today!
        </Heading>
        <UIText className="text-muted-foreground text-center" style={Type.body}>
          You finished today&apos;s revision. Come back tomorrow for a fresh set, or review your own decks now.
        </UIText>
        <UIText className="text-muted-foreground" style={Type.bodySemi}>
          Current streak: {streak} 🔥
        </UIText>
        <Button
          variant="default"
          className="min-h-11 rounded-xl"
          onPress={() => router.push('/(self-study)')}
          accessibilityRole="button"
        >
          <ButtonText style={Type.bodyBold}>Review my decks</ButtonText>
        </Button>
        <Button variant="outline" className="min-h-11 rounded-xl" onPress={load} accessibilityRole="button">
          <ButtonText style={Type.bodyBold}>Refresh</ButtonText>
        </Button>
        {escapeHatches}
      </Box>
    );
  }

  if (!feed || feed.empty) {
    return (
      <Box className="flex-1 items-center justify-center p-8 gap-4 bg-background">
        <Text style={{ fontSize: 56 }}>📭</Text>
        <Heading className="text-center text-2xl" style={Type.heading}>
          No revision yet today
        </Heading>
        <UIText className="text-muted-foreground text-center" style={Type.body}>
          Your teacher hasn&apos;t activated today&apos;s topics yet. Check back later!
        </UIText>
        <UIText className="text-muted-foreground" style={Type.bodySemi}>
          Current streak: {streak} 🔥
        </UIText>
        <Button variant="default" className="rounded-xl" onPress={load}>
          <ButtonText style={Type.bodyBold}>Refresh</ButtonText>
        </Button>
        {escapeHatches}
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-background" onLayout={(e) => setPageHeight(Math.round(e.nativeEvent.layout.height))}>
      <View style={[styles.header, styles.headerNoPointer, { top: headerTop }]}>
        <Box className="flex-1 bg-card rounded-2xl px-3.5 py-2.5 gap-2">
          <View style={styles.progressRow}>
            <View style={styles.progressLabel}>
              <Ionicons name="flash" size={14} color={Accents.primary} />
              <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold}>
                {Math.min(shownAnswered, feed.progress.total)}/{feed.progress.total}
              </UIText>
            </View>
            <View style={styles.progressLabel}>
              <Ionicons name="flame" size={14} color={Accents.warn} />
              <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold}>
                {streak}
              </UIText>
            </View>
          </View>
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth }]} />
          </View>
        </Box>
        <ThemeToggle />
        <Pressable
          onPress={() => router.push('/(self-study)')}
          style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Self study"
        >
          <Ionicons name="library-outline" size={14} color={theme.textSecondary} />
          <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
            Study
          </UIText>
        </Pressable>
        <Pressable
          onPress={openConfirm}
          style={({ pressed }) => [styles.signoutBtn, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={18} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={feed.questions}
        keyExtractor={(q) => q.id}
        renderItem={({ item, index }) => (
          <View style={{ height, paddingTop: pageTopPad, paddingBottom: insets.bottom }}>
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

      <ConfirmSheet
        visible={confirmOut}
        title="Sign out?"
        message="You'll need to sign in again to continue."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={confirmSignOut}
        onCancel={closeConfirm}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerNoPointer: { pointerEvents: 'box-none' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Accents.primary },
  signoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Accents.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10 },
  signoutPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Accents.border, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
});