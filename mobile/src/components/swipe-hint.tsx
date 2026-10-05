import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { Text as UIText } from '@/components/ui/text';
import { Accents, Type } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** Kept for existing imports; the shared hook is the single implementation. */
export const useReduceMotion = useReducedMotion;

export const SWIPE_CUE_COPY = Platform.OS === 'web' ? 'Scroll or press the Down arrow' : 'Swipe up';

interface Props {
  /** Fixed gap above the bottom edge of the list (sits over the peek). */
  bottom: number;
}

/**
 * Bobbing chevron + "Swipe up" shown after a card is answered, for the first
 * few swipes only. Purely decorative: it never takes touches and screen
 * readers use the Next button instead.
 */
export function SwipeHint({ bottom }: Props) {
  const reduce = useReduceMotion();
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -6, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, bob]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { bottom }]}
    >
      <Animated.View style={[styles.pill, { transform: [{ translateY: bob }] }]}>
        <Ionicons name="chevron-up" size={16} color={Accents.primary} />
        <UIText className="text-muted-foreground" style={[Type.bodySemi, styles.text]}>
          {SWIPE_CUE_COPY}
        </UIText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 13 },
});
