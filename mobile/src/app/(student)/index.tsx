import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFeedToday, getMe, submitAnswer } from '@/api/client';
import { CoachOverlay } from '@/components/coach-overlay';
import { ErrorState } from '@/components/error-state';
import { hapticLight } from '@/components/haptics';
import { QuestionCard } from '@/components/question-card';
import { SwipeHint } from '@/components/swipe-hint';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Text as UIText } from '@/components/ui/text';
import { Accents, onAccent, Type } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { markCoachSeen, recordSwipe, shouldShowCoach, shouldShowSwipeCue } from '@/lib/coach-storage';
import {
  allRemainingSkipped,
  canSkip,
  createQueue,
  type FeedQueue,
  isAnswered,
  markAnswered,
  nextIndex,
  positionLabel,
  remainingCount,
  skipCard,
  skippedRemaining,
} from '@/lib/feed-queue';
import { toFriendlyError } from '@/lib/friendly-error';
import type { FeedResponse, QuestionDto, SelfEval } from '@stemreach/core';
import { initials } from '@/lib/profile';

/** Visible strip of the next card under the current one (px at font scale 1). */
const PEEK_BASE = 28;
const HEADER_HEIGHT = 64;
const LOCK_HINT_BASE = 'Answer first';

export default function FeedScreen() {
  const { height: windowHeight, width: windowWidth, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { coach } = useLocalSearchParams<{ coach?: string }>();
  // Page height = the feed container's measured height, not the window's: the
  // window includes status/nav bars, so fixed window-height pages were clipped.
  const [listHeight, setListHeight] = useState(0);
  /** Header sits below the status bar / notch; the list starts under it. */
  const headerTop = insets.top + 8;
  const listTop = headerTop + HEADER_HEIGHT;
  const measured = listHeight > 0 ? listHeight : windowHeight - listTop;
  // Peek scales with the user's font size (28 to 36 px) so it stays visible but never eats the card.
  const peek = Math.round(PEEK_BASE * Math.min(Math.max(fontScale, 1), 1.3));
  const itemHeight = Math.max(measured - peek, 240);
  const compactHeader = windowWidth < 360;
  const theme = useTheme();
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const listRef = useRef<FlatList<string>>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [queue, setQueue] = useState<FeedQueue>(() => createQueue([]));
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, attempted: 0 });
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [cueOn, setCueOn] = useState(false);
  /** Header-counter position of each card answered this session (so its label keeps its own number). */
  const [ordinals, setOrdinals] = useState<Record<string, number>>({});
  const attemptedRef = useRef(0);
  const barWidth = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  // Latest values for listeners that must not re-register on every render.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentRef = useRef(0);
  const programmaticRef = useRef(false);
  const lastBlockRef = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStartY = useRef<number | null>(null);
  const coachCheckedFor = useRef<string | null>(null);

  const questionsById = useMemo(() => {
    const m = new Map<string, QuestionDto>();
    feed?.questions.forEach((q) => m.set(q.id, q));
    return m;
  }, [feed]);
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getFeedToday(), getMe()])
      .then(([f, me]) => {
        setFeed(f);
        setQueue(createQueue(f.questions.map((q) => q.id)));
        setStats({ correct: 0, attempted: 0 });
        setOrdinals({});
        attemptedRef.current = 0;
        setCurrent(0);
        currentRef.current = 0;
        setStreak(me.streak.current);
        setUserId(me.profile.id);
        setFullName(me.profile.full_name);
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
    if (reduceRef.current) {
      barWidth.setValue(progressPct * 100);
      return;
    }
    Animated.timing(barWidth, {
      toValue: progressPct * 100,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [barWidth, progressPct]);

  const feedReady = !!feed && !feed.empty && !(feed.progress.completed && !done);

  // First-run coach: once per user (storage), or whenever opened with ?coach=1.
  useEffect(() => {
    if (!feedReady || !userId || coachCheckedFor.current === userId) return;
    coachCheckedFor.current = userId;
    let alive = true;
    shouldShowCoach(AsyncStorage, userId).then((show) => alive && show && setCoachOpen(true));
    shouldShowSwipeCue(AsyncStorage, userId).then((show) => alive && setCueOn(show));
    return () => {
      alive = false;
    };
  }, [feedReady, userId]);

  useEffect(() => {
    if (coach === '1' && feedReady) setCoachOpen(true);
  }, [coach, feedReady]);

  const closeCoach = useCallback(() => {
    setCoachOpen(false);
    if (userId) void markCoachSeen(AsyncStorage, userId);
    // Clear the param so Profile -> How it works can open it again.
    if (coach) router.setParams({ coach: undefined });
  }, [userId, coach]);

  const sectionLabel = (sectionId: string) =>
    feed?.sections.find((s) => s.id === sectionId)?.name ?? 'Revision';

  const handleSubmit = useCallback(
    async (questionId: string, body: { selected_option?: number; self_eval?: SelfEval }) => {
      if (!feed?.set) throw new Error('no active set');
      return submitAnswer({ question_id: questionId, daily_set_id: feed.set.id, ...body });
    },
    [feed],
  );

  const baseAnswered = feed?.progress.answered ?? 0;
  const handleAnswered = useCallback(
    (id: string, isCorrect: boolean) => {
      attemptedRef.current += 1;
      const ordinal = baseAnswered + attemptedRef.current;
      setOrdinals((o) => ({ ...o, [id]: ordinal }));
      setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), attempted: s.attempted + 1 }));
      setQueue((q) => markAnswered(q, id));
    },
    [baseAnswered],
  );

  /** Programmatic scroll (Next button, auto-advance, keyboard): not counted as a swipe. */
  const goTo = useCallback((index: number) => {
    programmaticRef.current = true;
    setTimeout(() => {
      programmaticRef.current = false;
    }, 900);
    listRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleAdvance = useCallback(
    (id: string) => {
      const q = queueRef.current;
      const from = q.order.indexOf(id);
      const target = nextIndex(q, from);
      if (target === -1) {
        setDone(true);
        return;
      }
      goTo(target);
    },
    [goTo],
  );

  const handleSkip = useCallback((id: string) => {
    if (!canSkip(queueRef.current, id)) return;
    hapticLight();
    setQueue((q) => skipCard(q, id));
    // showToast also announces for screen readers; the explicit announce covers the case it is muted.
    showToast('Skipped - it comes back at the end', 'info');
    AccessibilityInfo.announceForAccessibility('Skipped. It will come back at the end.');
  }, [showToast]);

  const currentId = queue.order[current];
  const locked = currentId != null && !isAnswered(queue, currentId);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const currentCanSkip = currentId != null && canSkip(queue, currentId);
  const currentCanSkipRef = useRef(currentCanSkip);
  currentCanSkipRef.current = currentCanSkip;

  /** A swipe/scroll/arrow press while the card is unanswered: shake, tick, say why. */
  const blocked = useCallback(() => {
    const now = Date.now();
    if (now - lastBlockRef.current < 900) return;
    lastBlockRef.current = now;
    hapticLight();
    if (!reduceRef.current) Animated.sequence([
      Animated.timing(shake, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
    const text = currentCanSkipRef.current ? `${LOCK_HINT_BASE} - or tap Skip` : LOCK_HINT_BASE;
    setHint(text);
    AccessibilityInfo.announceForAccessibility(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2400);
  }, [shake]);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartY.current = e.nativeEvent.pageY;
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    if (!lockedRef.current || touchStartY.current == null) return;
    if (touchStartY.current - e.nativeEvent.pageY > 14) {
      touchStartY.current = null;
      blocked();
    }
  };

  // Web keyboard and wheel: ArrowDown/PageDown advance; both respect the lock.
  const coachOpenRef = useRef(coachOpen);
  coachOpenRef.current = coachOpen;
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e) => {
    if (coachOpenRef.current) return;
    const forward = e.key === 'ArrowDown' || e.key === 'PageDown';
    const backward = e.key === 'ArrowUp' || e.key === 'PageUp';
    if (!forward && !backward) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    if (lockedRef.current) {
      blocked();
      return;
    }
    const to = currentRef.current + (forward ? 1 : -1);
    if (to >= 0 && to < queueRef.current.order.length) goTo(to);
  };
  const wheelRef = useRef<(e: WheelEvent) => void>(() => undefined);
  wheelRef.current = (e) => {
    if (coachOpenRef.current || !lockedRef.current || Math.abs(e.deltaY) < 8) return;
    blocked();
  };
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return;
      const onKey = (e: KeyboardEvent) => keyRef.current(e);
      const onWheel = (e: WheelEvent) => wheelRef.current(e);
      window.addEventListener('keydown', onKey);
      window.addEventListener('wheel', onWheel, { passive: true });
      return () => {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('wheel', onWheel);
      };
    }, []),
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.max(0, Math.round(e.nativeEvent.contentOffset.y / itemHeight));
      if (idx === currentRef.current) return;
      const forward = idx > currentRef.current;
      currentRef.current = idx;
      setCurrent(idx);
      // Count real swipes only (not Next-button scrolls) toward the cue limit.
      if (forward && !programmaticRef.current && userId) {
        void recordSwipe(AsyncStorage, userId).then(() => shouldShowSwipeCue(AsyncStorage, userId)).then(setCueOn);
      }
    },
    [itemHeight, userId],
  );

  // Only the in-session finish routes to the summary. A feed that is already
  // complete on load renders the "Done for today" state below instead —
  // redirecting there made summary's "Back to home" (→ / → feed → summary)
  // loop forever, and showed a fabricated "0/N · 0%" score on reopen.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!done) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace({
      pathname: '/(student)/summary',
      params: { correct: String(stats.correct), attempted: String(stats.attempted) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (loading) {
    return <LoadingScreen label="Loading today's questions" />;
  }

  const openProfile = () => router.push('/profile' as Href);
  const openStudy = () => router.push('/(self-study)');

  // Offline self-study / profile (theme and sign out live there): shared by the
  // empty and error states so a student is never stuck on a screen with only Retry.
  const escapeHatches = (
    <View style={styles.emptyActions}>
      <Pressable
        onPress={openStudy}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="My decks"
      >
        <Ionicons name="library-outline" size={14} color={theme.textSecondary} />
        <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
          My decks
        </UIText>
      </Pressable>
      <Pressable
        onPress={openProfile}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Profile"
      >
        <Ionicons name="person-circle-outline" size={16} color={theme.textSecondary} />
        <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
          Profile
        </UIText>
      </Pressable>
    </View>
  );

  /** Secondary action on the Done / empty states: a text link, not a second button. */
  const refreshLink = (
    <Pressable
      onPress={load}
      style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Refresh"
    >
      <UIText className="text-primary-text" style={[Type.bodyBold, styles.textLinkLabel]}>
        Refresh
      </UIText>
    </Pressable>
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
          {"You’re done for today!"}
        </Heading>
        <UIText className="text-muted-foreground text-center" style={Type.body}>
          You finished today&apos;s revision. Come back tomorrow for a fresh set, or review your own decks now.
        </UIText>
        <UIText className="text-muted-foreground" style={Type.bodySemi}>
          {streak >= 1 ? `Current streak: ${streak} 🔥` : '0 day streak — come back tomorrow!'}
        </UIText>
        <Button variant="default" className="min-h-11 rounded-xl" onPress={openStudy} accessibilityRole="button" accessibilityLabel="Review my decks">
          <ButtonText style={Type.bodyBold}>Review my decks</ButtonText>
        </Button>
        {refreshLink}
      </Box>
    );
  }

  if (!feed || feed.empty) {
    return (
      <Box className="flex-1 items-center justify-center p-8 gap-4 bg-background">
        <Text style={{ fontSize: 56 }} accessible={false}>
          📭
        </Text>
        <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
          No revision yet today
        </Heading>
        <UIText className="text-muted-foreground text-center" style={Type.body}>
          Your teacher hasn&apos;t activated today&apos;s topics yet. Check back later!
        </UIText>
        <UIText className="text-muted-foreground" style={Type.bodySemi}>
          {streak >= 1 ? `Current streak: ${streak} 🔥` : '0 day streak — start your streak today!'}
        </UIText>
        <Button variant="default" className="min-h-11 rounded-xl" onPress={openStudy} accessibilityRole="button" accessibilityLabel="Review my decks">
          <ButtonText style={Type.bodyBold}>Review my decks</ButtonText>
        </Button>
        {refreshLink}
      </Box>
    );
  }

  const shownCount = Math.min(shownAnswered, feed.progress.total);
  const skippedNote =
    allRemainingSkipped(queue) && skippedRemaining(queue) > 0
      ? `${skippedRemaining(queue)} skipped - answer them to finish`
      : undefined;
  // SWIPE_CUE_COPY is platform-specific: "Swipe up" on phones, the keyboard cue only on web.
  const showCue = cueOn && !locked && !coachOpen && current < queue.order.length - 1 && remainingCount(queue) > 0;

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: listTop, paddingBottom: insets.bottom }}>
      <View style={[styles.header, styles.headerNoPointer, { top: headerTop }]}>
        <Box className="flex-1 bg-card rounded-2xl px-3.5 py-2.5 gap-2" style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View
              style={styles.progressLabel}
              accessible
              accessibilityLabel={`Progress: ${shownCount} of ${feed.progress.total} questions answered`}
            >
              <Ionicons name="flash" size={14} color={Accents.primary} />
              <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold} numberOfLines={1}>
                {shownCount}/{feed.progress.total}
              </UIText>
            </View>
            <View
              style={styles.progressLabel}
              accessible
              accessibilityLabel={streak >= 1 ? `Streak: ${streak} ${streak === 1 ? 'day' : 'days'} in a row` : '0 day streak'}
            >
              <Ionicons name="flame" size={14} color={streak >= 1 ? Accents.warn : Accents.border} />
              <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold} numberOfLines={1}>
                {streak}
              </UIText>
            </View>
          </View>
          <View style={styles.barTrack} accessible={false} importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.barFill, { width: barWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </Box>
        <Pressable
          onPress={openStudy}
          style={({ pressed }) => [compactHeader ? styles.studyIcon : styles.pill, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="My decks"
        >
          <Ionicons name="library-outline" size={compactHeader ? 20 : 14} color={theme.textSecondary} />
          {!compactHeader && (
            <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
              My decks
            </UIText>
          )}
        </Pressable>
        <Pressable
          onPress={openProfile}
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Text style={[styles.avatarText, Type.bodyBold, { color: onAccent(Accents.primary) }]} accessible={false}>
            {initials(fullName)}
          </Text>
        </Pressable>
      </View>

      <Animated.View
        style={[styles.listWrap, { transform: [{ translateX: shake }] }]}
        onLayout={(e) => setListHeight(Math.round(e.nativeEvent.layout.height))}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <FlatList
          ref={listRef}
          data={queue.order as string[]}
          extraData={{ current, queue, skippedNote, itemHeight, ordinals, shownAnswered }}
          keyExtractor={(id) => id}
          scrollEnabled={!locked}
          renderItem={({ item: id, index }) => {
            const question = questionsById.get(id);
            if (!question) return null;
            // Only the current card takes taps or is announced; the peeking next
            // card must never steal touches (hidden buttons swallowed taps on Android).
            const active = index === current;
            return (
              <View
                style={[{ height: itemHeight, paddingBottom: 10 }, !active && styles.inactive]}
                accessibilityElementsHidden={!active}
                importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              >
                <QuestionCard
                  question={question}
                  sectionLabel={sectionLabel(question.section_id)}
                  questionNo={ordinals[id] ?? shownAnswered + 1}
                  total={feed.progress.total}
                  positionLabel={positionLabel(ordinals[id] ?? shownAnswered + 1, feed.progress.total)}
                  isLast={remainingCount(queue) === 0}
                  onSubmit={handleSubmit}
                  onAnswered={(ok) => handleAnswered(id, ok)}
                  onAdvance={() => handleAdvance(id)}
                  onSkip={canSkip(queue, id) ? () => handleSkip(id) : undefined}
                  skipNote={skippedNote}
                />
              </View>
            );
          }}
          snapToInterval={itemHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
          // Room so the last card can sit at the top like the others, with no peek under it.
          ListFooterComponent={<View style={{ height: peek }} />}
          initialNumToRender={2}
          windowSize={5}
        />

        {showCue && <SwipeHint bottom={2} />}

        {hint != null && (
          <View pointerEvents="none" style={styles.hintWrap}>
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.hint, { backgroundColor: theme.backgroundElement, borderColor: Accents.border }]}
            >
              <UIText className="text-foreground" style={[Type.bodySemi, styles.hintText]}>
                {hint}
              </UIText>
            </View>
          </View>
        )}
      </Animated.View>

      <CoachOverlay visible={coachOpen} onClose={closeCoach} topOffset={listTop} />
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
    gap: 8,
  },
  headerNoPointer: { pointerEvents: 'box-none' },
  progressCard: { minWidth: 0 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  progressLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Accents.primary },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Accents.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15 },
  studyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Accents.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrap: { flex: 1 },
  inactive: { pointerEvents: 'none' },
  hintWrap: { position: 'absolute', top: 8, left: 16, right: 16, alignItems: 'center', zIndex: 6 },
  hint: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  hintText: { fontSize: 14 },
  textLink: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  textLinkLabel: { textDecorationLine: 'underline' },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10 },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
