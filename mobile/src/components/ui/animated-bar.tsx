import { useCallback, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { Accents } from '@/constants/theme';

interface Props {
  pct: number;
  color: string;
  accessibilityLabel: string;
}

export function AnimatedBar({ pct, color, accessibilityLabel }: Props) {
  const width = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      Animated.spring(width, {
        toValue: Math.max(0, Math.min(1, pct)),
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();
    }, [width, pct]),
  );
  return (
    <View
      style={styles.barTrack}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        accessible={false}
        style={[
          styles.barFill,
          {
            width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track },
  barFill: { height: 8, borderRadius: 4 },
});
