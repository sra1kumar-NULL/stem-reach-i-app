import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Accents, Nord, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Distance from the top of the safe area to the menu (just below the header button). */
  offsetTop?: number;
}

/** Small top-right popover (a "..." menu) on a Modal so it layers above tab bars and handles Android back. */
export function PopoverMenu({ visible, onClose, children, offsetTop = 52 }: MenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <View style={[styles.menu, { top: insets.top + offsetTop, backgroundColor: theme.backgroundElement, borderColor: Accents.border }]}>
        {children}
      </View>
    </Modal>
  );
}

interface ItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** Spoken label when it should say more than the visible text. */
  accessibilityLabel?: string;
}

/** 48 pt menu row. A plain button so assistive tech and tests find it by its name. */
export function MenuItem({ icon, label, onPress, danger, accessibilityLabel }: ItemProps) {
  const theme = useTheme();
  const color = danger ? theme.dangerText : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundSelected }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[Type.bodyBold, { color, fontSize: 16, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export function MenuNote({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[Type.body, styles.note, { color: theme.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: `${Nord.nord0}66` },
  menu: { position: 'absolute', right: 12, minWidth: 220, maxWidth: 300, borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  note: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 10 },
});
