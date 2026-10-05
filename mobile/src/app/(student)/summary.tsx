import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getFeedToday, getMe } from '@/api/client';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Type } from '@/constants/theme';
import type { MeResponse } from '@stemreach/core';

const AnimatedUIText = Animated.createAnimatedComponent(UIText);

export default function SummaryScreen() {
  const { correct = '0', attempted = '0' } = useLocalSearchParams<{ correct: string; attempted: string }>();
  const [me, setMe] = useState<MeResponse | null>(null);
  // Only show a win the server agrees with: today's feed must report `completed`.
  // 'checking' → spinner, 'ok' → summary, 'leave' → back to the feed.
  const [gate, setGate] = useState<'checking' | 'ok' | 'leave'>('checking');
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getMe().then(setMe).catch(() => undefined);
  }, []);

  // URL params only carry this session's score; on a web refresh or a hand-typed
  // URL they may be missing or junk — degrade to the no-score copy, never "0/0".
  const a = Number(attempted);
  const c = Number(correct);
  const hasSession = Number.isFinite(a) && Number.isFinite(c) && a > 0 && c >= 0 && c <= a;
  const pct = hasSession ? Math.round((c / a) * 100) : 0;
  const hero = hasSession ? (pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪') : '🎊';

  useEffect(() => {
    let alive = true;
    getFeedToday()
      .then((feed) => alive && setGate(feed.progress.completed ? 'ok' : 'leave'))
      // Feed unreachable (offline right after finishing): trust the in-session score, never a hand-typed URL.
      .catch(() => alive && setGate(hasSession ? 'ok' : 'leave'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gate !== 'ok') return;
    Animated.sequence([
      Animated.delay(150),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }),
    ]).start();
  }, [pop, gate]);

  if (gate === 'leave') return <Redirect href="/" />;
  if (gate === 'checking') {
    return (
      <Box className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" accessibilityLabel="Loading" />
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <AnimatedUIText accessible={false} style={[styles.hero, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }] }]}>
          {hero}
        </AnimatedUIText>

        <Heading className="text-center text-3xl" style={Type.heading}>
          You&apos;re done for today!
        </Heading>

        <Box className="bg-card items-center p-8 rounded-3xl gap-2 self-stretch">
          <Animated.View
            accessible={hasSession}
            accessibilityLabel={hasSession ? `${c} out of ${a} correct` : undefined}
            style={{
              opacity: pop,
              transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }}
          >
            {hasSession ? (
              <>
                <UIText accessible={false} className="text-6xl font-extrabold text-foreground" style={Type.headingBold}>
                  {c}
                  <UIText accessible={false} className="text-4xl font-bold text-muted-foreground" style={Type.heading}>
                    /{a}
                  </UIText>
                </UIText>
                <UIText className="text-muted-foreground text-center" style={Type.body}>
                  correct this session · {pct}%
                </UIText>
              </>
            ) : (
              <UIText className="text-xl font-bold text-foreground text-center" style={Type.heading}>
                You made it through today&apos;s set — every card counts. 🧠
              </UIText>
            )}
            {me != null && (
              <UIText className="mt-3 text-xl font-bold text-foreground text-center" style={Type.heading}>
                Streak: {me.streak.current} 🔥
              </UIText>
            )}
            {me != null && (me.srs.due_tomorrow > 0 || me.srs.due_today > 0) && (
              <UIText className="mt-2 text-sm text-muted-foreground text-center" style={Type.body}>
                {me.srs.due_today > 0
                  ? `${me.srs.due_today} card(s) still waiting today${me.srs.due_tomorrow > 0 ? ` · ${me.srs.due_tomorrow} due tomorrow` : ''}`
                  : `${me.srs.due_tomorrow} card(s) due tomorrow — smart review keeps them fresh 🧠`}
              </UIText>
            )}
          </Animated.View>
        </Box>

        <UIText className="text-sm text-muted-foreground text-center" style={Type.body}>
          Come back tomorrow for a fresh set! 🌟
        </UIText>

        <Button variant="default" size="lg" className="min-h-11 rounded-2xl self-stretch" onPress={() => router.replace('/')}>
          <ButtonText style={Type.bodyBold}>Back to home</ButtonText>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 rounded-2xl self-stretch"
          onPress={() => router.push('/(self-study)')}
          accessibilityRole="button"
          accessibilityLabel="Review my decks in self-study"
        >
          <ButtonText style={Type.bodyBold}>Review my decks</ButtonText>
        </Button>
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  hero: { fontSize: 72 },
});