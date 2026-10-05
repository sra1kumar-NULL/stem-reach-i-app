import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { liveQuestions, topicA11yLabel, topicTitle, type TopicRow } from '@/lib/teacher-home';
import { CheckBox } from './checkbox';

interface Props {
  topic: TopicRow;
  chapterName: string;
  selected: boolean;
  /** Was part of today's activation but is now deselected. */
  wasActive: boolean;
  onToggle: (id: string) => void;
}

function TopicCardBase({ topic, chapterName, selected, wasActive, onToggle }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onToggle(topic.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={topicA11yLabel(chapterName, topic)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement },
        selected && styles.cardOn,
        pressed && { opacity: 0.8 },
      ]}
    >
      <CheckBox state={selected} />
      <View style={styles.body}>
        <Text style={[styles.no, { color: theme.primaryText }]}>{topic.no}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{topicTitle(topic)}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {liveQuestions(topic.count)}
          {wasActive && !selected ? ' · active today' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export const TopicCard = memo(TopicCardBase);

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardOn: { borderColor: Accents.primary },
  body: { flex: 1, gap: 1 },
  no: { ...Type.bodyBold, fontSize: 12, letterSpacing: 0.4 },
  title: { ...Type.bodySemi, fontSize: 15, lineHeight: 20 },
  meta: { ...Type.body, fontSize: 12 },
});
