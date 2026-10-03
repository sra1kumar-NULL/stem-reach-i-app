import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/components/swipe-hint';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Step {
  title: string;
  body: string;
  /** Step 3 points at the top bar, so its panel sits near the top. */
  anchor: 'center' | 'top';
}

const STEPS: Step[] = [
  {
    title: 'Swipe up for the next question',
    body: 'Answer a question, then swipe up to see the next one. You can also tap Next.',
    anchor: 'center',
  },
  {
    title: 'Tap Show Answer, then rate yourself',
    body: 'On a flashcard, tap Show Answer. Then tell us how it went.',
    anchor: 'center',
  },
  {
    title: 'Your streak and progress are up here',
    body: 'The flame is your streak. The bar fills as you answer.',
    anchor: 'top',
  },
];

interface Props {
  visible: boolean;
  /** Called for both Skip and Done. */
  onClose: () => void;
  /** Distance from the top of the screen to the bottom of the header, for step 3. */
  topOffset: number;
}

/**
 * First-run guide (plan section 0.1b G4): three short steps, skippable, no
 * auto-advance and no gesture-only controls. Focus moves into the panel when
 * it opens and on every step; steps are announced.
 */
export function CoachOverlay({ visible, onClose, topOffset }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [step, setStep] = useState(0);
  const titleRef = useRef<View>(null);
  const primaryRef = useRef<View>(null);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  // Re-opening (e.g. from Profile) always starts at step 1.
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  // Move focus into the overlay and announce the step.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (Platform.OS === 'web') {
        (primaryRef.current as unknown as { focus?: () => void } | null)?.focus?.();
      } else {
        const node = findNodeHandle(titleRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 150);
    AccessibilityInfo.announceForAccessibility(`Step ${step + 1} of ${STEPS.length}. ${s.title}. ${s.body}`);
    return () => clearTimeout(t);
  }, [visible, step, s.title, s.body]);

  // Escape closes on web (Android back is handled by Modal.onRequestClose).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduce ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.scrim,
          s.anchor === 'top'
            ? { justifyContent: 'flex-start', paddingTop: topOffset + 8 }
            : { justifyContent: 'center', paddingBottom: insets.bottom },
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: theme.background, borderColor: Accents.border }]}
        >
          {s.anchor === 'top' && (
            <Ionicons name="arrow-up" size={22} color={Accents.primary} style={styles.upArrow} accessible={false} />
          )}

          <Illustration step={step} reduce={reduce} />

          <Text style={[styles.count, { color: theme.textSecondary }, Type.bodySemi]}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text
            ref={titleRef as never}
            accessibilityRole="header"
            accessible
            style={[styles.title, { color: theme.text }, Type.headingBold]}
          >
            {s.title}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }, Type.body]}>{s.body}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Skip the tour"
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
            >
              <Text style={[{ color: theme.textSecondary }, Type.bodySemi, styles.btnText]}>Skip</Text>
            </Pressable>
            <Pressable
              ref={primaryRef as never}
              onPress={() => (last ? onClose() : setStep(step + 1))}
              accessibilityRole="button"
              accessibilityLabel={last ? 'Got it, close the tour' : 'Next step'}
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
            >
              <Text style={[{ color: onAccent(Accents.primary) }, Type.bodyBold, styles.btnText]}>
                {last ? 'Got it' : 'Next'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Illustration({ step, reduce }: { step: number; reduce: boolean }): ReactNode {
  const move = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce || step !== 0) {
      move.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(move, { toValue: -28, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(move, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(300),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, step, move]);

  if (step === 0) {
    return (
      <View style={styles.illo} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.miniCard, { borderColor: Accents.border }]} />
        <Animated.Text style={[styles.finger, { transform: [{ translateY: move }] }]}>👆</Animated.Text>
      </View>
    );
  }
  if (step === 1) {
    return (
      <View style={styles.illo} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={styles.pillRow}>
          <MiniPill label="Again" bg={Nord.nord11} fg={onAccent(Nord.nord11)} />
          <MiniPill label="Average" bg={Accents.success} fg={onAccent(Accents.success)} />
          <MiniPill label="Easy" bg={Accents.teal} fg={onAccent(Accents.teal)} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.illo} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.pillRow}>
        <View style={[styles.chip, { borderColor: Accents.border }]}>
          <Ionicons name="flash" size={14} color={Accents.primary} />
          <Text style={[styles.chipText, Type.bodyBold]}>3/15</Text>
        </View>
        <View style={[styles.chip, { borderColor: Accents.border }]}>
          <Ionicons name="flame" size={14} color={Accents.warn} />
          <Text style={[styles.chipText, Type.bodyBold]}>4</Text>
        </View>
      </View>
    </View>
  );
}

function MiniPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.miniPill, { backgroundColor: bg }]}>
      <Text style={[{ color: fg, fontSize: 13 }, Type.bodyBold]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: `${Nord.nord0}B3`, paddingHorizontal: 20 },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  upArrow: { alignSelf: 'center' },
  illo: { height: 84, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  miniCard: { width: 120, height: 56, borderRadius: 12, borderWidth: 2 },
  finger: { position: 'absolute', fontSize: 34, bottom: 4 },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  miniPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  chipText: { fontSize: 14, color: Accents.primary },
  count: { fontSize: 13, textAlign: 'center' },
  title: { fontSize: 21, lineHeight: 28, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 },
  skip: { minHeight: 44, minWidth: 72, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  primary: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Accents.primary,
  },
  btnText: { fontSize: 16 },
});
