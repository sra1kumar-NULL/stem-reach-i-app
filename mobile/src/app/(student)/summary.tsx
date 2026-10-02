import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMe } from '@/api/client';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Type } from '@/constants/theme';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import type { MeResponse } from '@stemreach/core';

export default function SummaryScreen() {
  const { correct = '0', attempted = '0', streak = '0' } = useLocalSearchParams<{ correct: string; attempted: string; streak: string }>();
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();
  const [me, setMe] = useState<MeResponse | null>(null);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getMe().then(setMe).catch(() => undefined);
  }, []);

  const a = Number(attempted);
  const c = Number(correct);
  const hasSession = a > 0;
  const pct = hasSession ? Math.round((c / a) * 100) : 0;
  const hero = hasSession ? (pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪') : '🎊';

  useEffect(() => {
    Animated.sequence([
      Animated.delay(150),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }),
    ]).start();
  }, [pop]);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <Animated.Text style={[styles.hero, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }] }]}>
          {hero}
        </Animated.Text>

        <Heading className="text-center text-3xl" style={Type.heading}>
          Daily Revision Complete!
        </Heading>

        <Box className="bg-card items-center p-8 rounded-3xl gap-2 self-stretch">
          <Animated.View
            style={{
              opacity: pop,
              transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }}
          >
            {hasSession ? (
              <>
                <UIText className="text-6xl font-extrabold text-foreground" style={Type.headingBold}>
                  {c}
                  <UIText className="text-4xl font-bold text-muted-foreground" style={Type.heading}>
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
            <UIText className="mt-3 text-xl font-bold text-foreground text-center" style={Type.heading}>
              Streak: {streak} 🔥
            </UIText>
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

        <Button variant="default" size="lg" className="rounded-2xl self-stretch" onPress={() => router.replace('/')}>
          <ButtonText style={Type.bodyBold}>Back to home</ButtonText>
        </Button>
        <Pressable
          onPress={openConfirm}
          style={({ pressed }) => [styles.signoutPill, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <UIText className="text-muted-foreground font-semibold" style={Type.bodySemi}>
            ⏻ Sign out
          </UIText>
        </Pressable>
        <ConfirmSheet
          visible={confirmOut}
          title="Sign out?"
          message="You'll need to sign in again to continue."
          confirmLabel="Sign out"
          loading={signingOut}
          onConfirm={confirmSignOut}
          onCancel={closeConfirm}
        />
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  hero: { fontSize: 72 },
  signoutPill: { borderWidth: 1, borderColor: Accents.border, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
});