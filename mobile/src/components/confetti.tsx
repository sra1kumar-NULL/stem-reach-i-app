import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Accents } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const COLORS = [Accents.success, Accents.warn, Accents.primary, Accents.purple, Accents.teal, Accents.pink];
const PIECES = 14;

interface Piece {
  x: number;
  color: string;
  rot: number;
  size: number;
}

/** A one-shot confetti burst. Renders nothing until `fire` toggles to true. */
export function Confetti({ fire }: { fire: boolean }) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!fire || reducedMotion) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fire, progress, reducedMotion]);

  // Reduced motion: no particles at all (the caller's own success UI still shows).
  if (!fire || reducedMotion) return null;

  const pieces: Piece[] = [
    { x: -0.35, color: COLORS[0], rot: 30, size: 9 },
    { x: -0.2, color: COLORS[1], rot: -40, size: 7 },
    { x: -0.05, color: COLORS[2], rot: 20, size: 10 },
    { x: 0.1, color: COLORS[3], rot: -25, size: 8 },
    { x: 0.25, color: COLORS[4], rot: 45, size: 9 },
    { x: 0.4, color: COLORS[5], rot: -35, size: 7 },
    { x: -0.45, color: COLORS[2], rot: 60, size: 6 },
    { x: 0.5, color: COLORS[0], rot: -50, size: 8 },
    { x: -0.3, color: COLORS[4], rot: 15, size: 6 },
    { x: 0.15, color: COLORS[1], rot: -15, size: 7 },
    { x: -0.15, color: COLORS[5], rot: 55, size: 6 },
    { x: 0.35, color: COLORS[3], rot: 10, size: 6 },
    { x: -0.4, color: COLORS[1], rot: -60, size: 5 },
    { x: 0.55, color: COLORS[2], rot: 25, size: 5 },
  ].slice(0, PIECES);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer, styles.noPointer]}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              backgroundColor: p.color,
              width: p.size,
              height: p.size * 1.4,
              left: width * (0.5 + p.x),
              top: height * 0.3,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, height * (0.25 + (i % 4) * 0.08)],
                  }),
                },
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, width * 0.12 * (i % 2 === 0 ? 1 : -1)],
                  }),
                },
                {
                  rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot * 4}deg`] }),
                },
                {
                  scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
                },
              ],
              opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 50 },
  noPointer: { pointerEvents: 'none' },
  piece: { position: 'absolute', borderRadius: 3 },
});