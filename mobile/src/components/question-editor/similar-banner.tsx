import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SimilarItem {
  id: string;
  question_text: string;
}

interface Props {
  items: SimilarItem[];
  onOpen: (id: string) => void;
}

/** Non-blocking "this looks like an existing question" notice. Saving is never prevented. */
export function SimilarBanner({ items, onOpen }: Props) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={[styles.box, { borderColor: Accents.warn, backgroundColor: Accents.warnSoft }]} accessibilityRole="alert">
      <View style={styles.head}>
        <Ionicons name="alert-circle-outline" size={18} color={theme.warnText} />
        <Text style={[Type.bodyBold, { color: theme.warnText, fontSize: 13, flex: 1 }]}>
          {items.length === 1 ? 'A similar question already exists in this topic' : `${items.length} similar questions already exist in this topic`}
        </Text>
      </View>
      {items.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onOpen(s.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open similar question: ${s.question_text}`}
          style={({ pressed }) => [styles.item, { backgroundColor: theme.background }, pressed && { opacity: 0.6 }]}
        >
          <Text numberOfLines={2} style={[Type.body, { color: theme.text, fontSize: 14, flex: 1 }]}>
            {s.question_text}
          </Text>
          <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
        </Pressable>
      ))}
      <Text style={[Type.body, { color: theme.textSecondary, fontSize: 12 }]}>You can still save this one.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
