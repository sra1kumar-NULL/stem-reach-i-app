import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Nord, Type } from '@/constants/theme';
import { PRIMARY_SOLID } from './tokens';
import { useTheme } from '@/hooks/use-theme';
import { actionLabel, barHint, canSubmit, liveQuestions, plural } from '@/lib/teacher-home';

interface Props {
  topics: number;
  questions: number;
  hasActivation: boolean;
  /** The selection differs from today's active set. */
  changed: boolean;
  busy: boolean;
  onPress: () => void;
}

/** Sticky bottom bar: live selection summary + the primary Activate / Update button. */
export function ActionBar({ topics, questions, hasActivation, changed, busy, onPress }: Props) {
  const theme = useTheme();
  const disabled = !canSubmit(topics, changed, busy);
  const label = actionLabel(hasActivation);
  return (
    <View style={[styles.bar, { backgroundColor: theme.background, borderTopColor: Accents.border }]}>
      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Text style={[styles.count, { color: theme.text }]}>
          {topics === 0 ? 'No topics selected' : `${plural(topics, 'topic')} selected · ${liveQuestions(questions)}`}
        </Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>{barHint(topics, hasActivation, changed)}</Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={busy ? `${label}, working` : label}
        accessibilityState={{ disabled, busy }}
        aria-disabled={disabled}
        aria-busy={busy}
        style={({ pressed }) => [styles.btn, disabled && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}
      >
        {busy ? <ActivityIndicator color={Nord.nord6} /> : <Text style={styles.btnText}>{label}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  summary: { flex: 1, gap: 1 },
  count: { ...Type.bodyBold, fontSize: 14 },
  sub: { ...Type.body, fontSize: 12 },
  btn: { minHeight: 48, minWidth: 120, maxWidth: '55%', paddingHorizontal: 16, borderRadius: 14, backgroundColor: PRIMARY_SOLID, alignItems: 'center', justifyContent: 'center' },
  btnText: { ...Type.bodyBold, fontSize: 15, color: Nord.nord6, textAlign: 'center' },
});
