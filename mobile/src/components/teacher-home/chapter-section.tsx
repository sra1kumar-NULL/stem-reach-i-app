import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chapterSelection, type ChapterGroup } from '@/lib/teacher-home';
import { TopicCard } from './topic-card';

interface Props {
  group: ChapterGroup;
  selected: ReadonlySet<string>;
  todaySections: ReadonlySet<string>;
  defaultCollapsed: boolean;
  onToggleTopic: (id: string) => void;
  onToggleChapter: (group: ChapterGroup) => void;
}

const SUBJECT_LABEL: Record<string, string> = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology', maths: 'Maths' };
const subjectLabel = (s: string) => SUBJECT_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

export function ChapterSection({ group, selected, todaySections, defaultCollapsed, onToggleTopic, onToggleChapter }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(!defaultCollapsed);
  const sel = chapterSelection(group, selected);
  const allOn = sel.state === true;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          accessibilityLabel={`${group.name}, ${subjectLabel(group.subject)}, ${sel.summary}`}
          accessibilityHint={open ? 'Collapse topics' : 'Expand topics'}
          style={({ pressed }) => [styles.headMain, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={theme.textSecondary} />
          <View style={styles.headText}>
            <Text style={[styles.chapter, { color: theme.text }]} numberOfLines={2}>
              {group.name}
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              {subjectLabel(group.subject)} · {sel.short}
            </Text>
          </View>
        </Pressable>
        {group.topics.length > 0 && (
          <Pressable
            onPress={() => onToggleChapter(group)}
            accessibilityRole="button"
            accessibilityLabel={`${allOn ? 'Clear' : 'Select all'} topics in ${group.name}`}
            style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.toggleText, { color: theme.primaryText }]}>{allOn ? 'Clear' : 'Select all'}</Text>
          </Pressable>
        )}
      </View>
      {open && (
        <View style={styles.list}>
          {group.topics.map((t) => (
            <TopicCard
              key={t.id}
              topic={t}
              chapterName={group.name}
              selected={selected.has(t.id)}
              wasActive={todaySections.has(t.id)}
              onToggle={onToggleTopic}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headMain: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  headText: { flex: 1, gap: 1 },
  chapter: { ...Type.heading, fontSize: 17, lineHeight: 22 },
  sub: { ...Type.body, fontSize: 12 },
  toggle: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  toggleText: { ...Type.bodyBold, fontSize: 13 },
  list: { gap: 8 },
});
