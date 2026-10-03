import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SYMBOL_GROUPS } from '@/lib/symbols';

interface Props {
  /** Called with the symbol; the editor inserts it at the focused field's cursor. */
  onInsert: (symbol: string) => void;
  /** Name of the field that will receive the symbol, for the hint. */
  targetLabel: string;
}

/** Symbol palette: group tabs on top, one horizontally scrolling row of 44pt keys below. */
export function SymbolToolbar({ onInsert, targetLabel }: Props) {
  const theme = useTheme();
  const [groupId, setGroupId] = useState(SYMBOL_GROUPS[0].id);
  const group = SYMBOL_GROUPS.find((g) => g.id === groupId) ?? SYMBOL_GROUPS[0];

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement, borderColor: Accents.border }]} accessibilityLabel="Symbol toolbar">
      <View style={styles.header}>
        <Text style={[Type.bodyBold, styles.title, { color: theme.textSecondary }]}>Symbols</Text>
        <Text numberOfLines={1} style={[Type.body, styles.target, { color: theme.textSecondary }]}>
          into: {targetLabel}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
        {SYMBOL_GROUPS.map((g) => {
          const on = g.id === groupId;
          return (
            <Pressable
              key={g.id}
              onPress={() => setGroupId(g.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${g.title} symbols`}
              style={[styles.tab, { backgroundColor: on ? Accents.primarySoft : 'transparent', borderColor: on ? Accents.primary : 'transparent' }]}
            >
              <Text style={[Type.bodyBold, styles.tabText, { color: on ? theme.primaryText : theme.text }]}>{g.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keys}>
        {group.items.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => onInsert(s.char)}
            accessibilityRole="button"
            accessibilityLabel={`Insert ${s.label}`}
            style={({ pressed }) => [styles.key, { backgroundColor: theme.background, borderColor: Accents.border }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[Type.bodyBold, styles.keyText, { color: theme.text }]}>{s.char}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 14, paddingVertical: 8, gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 },
  title: { fontSize: 13 },
  target: { fontSize: 12, flexShrink: 1 },
  tabs: { paddingHorizontal: 8, gap: 6 },
  tab: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, justifyContent: 'center' },
  tabText: { fontSize: 13 },
  keys: { paddingHorizontal: 8, gap: 6 },
  key: { minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 18 },
});
