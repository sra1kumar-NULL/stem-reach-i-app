import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Spoken label when the visible text is short, e.g. "EN" -> "English". */
  accessibilityLabel?: string;
}

/** 44pt single-choice pill. Selected = solid primary fill, contrasting text and a check (not colour alone). */
export function Chip({ label, selected, onPress, disabled, accessibilityLabel }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, checked: selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? Accents.primary : Accents.border, backgroundColor: selected ? Accents.primary : 'transparent' },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={onAccent(Accents.primary)} /> : null}
      <Text style={[Type.bodyBold, styles.text, { color: selected ? onAccent(Accents.primary) : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

interface RowProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; a11y?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

/** Labelled radio group of chips (wraps on narrow screens). */
export function ChipRow<T extends string>({ label, value, options, onChange, disabled }: RowProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[Type.bodyBold, styles.groupLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            accessibilityLabel={o.a11y}
            selected={o.value === value}
            disabled={disabled}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  groupLabel: { fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 14 },
});
