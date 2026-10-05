import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Accents, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}

/** Mutually-exclusive filter chip group with correct ARIA radiogroup / radio semantics. */
export function FilterChipGroup<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: selected ? Accents.primary : Accents.border,
                backgroundColor: selected ? Accents.primary : 'transparent',
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            {selected ? <Ionicons name="checkmark" size={16} color={onAccent(Accents.primary)} /> : null}
            <Text
              style={[
                Type.bodyBold,
                styles.text,
                { color: selected ? onAccent(Accents.primary) : theme.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
