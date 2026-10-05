import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, ButtonText } from '@/components/ui/button';
import { Nord, Type } from '@/constants/theme';

export type RatingValue = 'again' | 'hard' | 'good' | 'easy';

/**
 * Fills and label colours for the self-grade buttons. Every pair is >= 4.5:1
 * (Again: white on deep red 6.5; the pastels use dark Nord text, 6.0 to 8.0).
 * The wire value `good` is unchanged, only the label reads "Average".
 */
const RATINGS: Record<RatingValue, { emoji: string; label: string; bg: string; fg: string }> = {
  again: { emoji: '🔁', label: 'Again', bg: '#9C3F48', fg: '#FFFFFF' },
  hard: { emoji: '😅', label: 'Hard', bg: Nord.nord13, fg: Nord.nord0 },
  good: { emoji: '👌', label: 'Average', bg: Nord.nord14, fg: Nord.nord0 },
  easy: { emoji: '⚡', label: 'Easy', bg: Nord.nord7, fg: Nord.nord0 },
};

/** "Show Answer" fill and label (5.5:1). */
export const SHOW_ANSWER_BG = '#C4A1BE';
export const SHOW_ANSWER_FG = Nord.nord0;

interface Props {
  values: readonly RatingValue[];
  busy?: boolean;
  /** The rating whose request is in flight (shows a spinner). */
  pending?: RatingValue | null;
  onPick: (value: RatingValue) => void;
}

/** Again / (Hard) / Average / Easy buttons shared by the daily feed and deck review. */
export function RatingButtons({ values, busy = false, pending = null, onPick }: Props) {
  const { width } = useWindowDimensions();
  // Four labels do not fit in one row on a narrow phone: use a 2x2 grid there.
  const grid = values.length > 3 && width < 560;
  // On the narrowest phones the emoji sits above the label so every label stays on one line.
  const stacked = width < 360;
  return (
    <View style={styles.row}>
      {values.map((value) => {
        const r = RATINGS[value];
        const loading = busy && pending === value;
        return (
          <Button
            key={value}
            variant="default"
            className={`min-h-11 rounded-2xl ${stacked ? 'flex-col gap-0 px-1 py-1.5' : ''} ${busy && !loading ? 'opacity-40' : ''}`}
            style={[{ backgroundColor: r.bg }, grid ? styles.cell : styles.flex]}
            onPress={() => onPick(value)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            accessibilityState={{ disabled: busy, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={r.fg} />
            ) : (
              <>
                {stacked ? <ButtonText style={{ color: r.fg, fontSize: 16, lineHeight: 20 }}>{r.emoji}</ButtonText> : null}
                <ButtonText numberOfLines={1} style={{ ...Type.bodyBold, color: r.fg }}>
                  {stacked ? r.label : `${r.emoji} ${r.label}`}
                </ButtonText>
              </>
            )}
          </Button>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flex: 1 },
  cell: { flexBasis: '47%', flexGrow: 1 },
});
