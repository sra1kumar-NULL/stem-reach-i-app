import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Nord, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PRIMARY_SOLID } from './tokens';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'tab' | 'radio' | 'button';
}

/**
 * Range / filter chip. Selected = solid primary fill, white label, check mark and a 2 px outline in the
 * theme's primary text colour, so it reads against unselected (outline only) at >= 3:1 in both themes.
 */
export function FilterChip({ label, selected, onPress, role = 'tab' }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { selected } : role === 'radio' ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: PRIMARY_SOLID, borderColor: theme.primaryText, borderWidth: 2 }
          : { backgroundColor: 'transparent', borderColor: theme.textSecondary, borderWidth: 1 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={14} color={Nord.nord6} /> : null}
      <Text style={[styles.label, { color: selected ? Nord.nord6 : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  label: { ...Type.bodyBold, fontSize: 14 },
});
