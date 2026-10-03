import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TeacherQuestionDto } from '@stemreach/core';

type Tone = 'primary' | 'success' | 'warn' | 'danger' | 'purple' | 'muted';

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const theme = useTheme();
  const bg = {
    primary: Accents.primarySoft,
    success: Accents.successSoft,
    warn: Accents.warnSoft,
    danger: Accents.dangerSoft,
    purple: Accents.purpleSoft,
    muted: theme.backgroundSelected,
  }[tone];
  const fg = {
    primary: theme.primaryText,
    success: theme.successText,
    warn: theme.warnText,
    danger: theme.dangerText,
    purple: theme.purpleText,
    muted: theme.text,
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[Type.bodyBold, styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const DIFF_TONE = { easy: 'success', medium: 'warn', hard: 'danger' } as const;

interface Props {
  q: TeacherQuestionDto;
  onPress: (q: TeacherQuestionDto) => void;
}

function RowImpl({ q, onPress }: Props) {
  const theme = useTheme();
  const archived = q.enabled === false;
  const status = q.status ?? 'published';
  const answered = q.submission_count ?? 0;
  const summary = [
    q.type === 'mcq' ? 'Multiple choice' : 'Flashcard',
    q.difficulty,
    q.language === 'kn' ? 'Kannada' : 'English',
    status,
    archived ? 'archived' : null,
    `${answered} answered`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => onPress(q)}
      accessibilityRole="button"
      accessibilityLabel={`${q.question_text}. ${summary}. Open to edit`}
      style={({ pressed }) => [
        styles.row,
        { borderColor: Accents.border, backgroundColor: theme.backgroundElement, opacity: archived ? 0.75 : 1 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text numberOfLines={2} style={[Type.bodySemi, styles.text, { color: theme.text }]}>
        {q.question_text}
      </Text>
      <View style={styles.badges}>
        <Badge label={q.type === 'mcq' ? 'MCQ' : 'Flashcard'} tone="primary" />
        <Badge label={q.difficulty} tone={DIFF_TONE[q.difficulty]} />
        <Badge label={status === 'draft' ? 'Draft' : 'Published'} tone={status === 'draft' ? 'warn' : 'success'} />
        {archived ? <Badge label="Archived" tone="muted" /> : null}
        {q.language === 'kn' ? <Badge label="Kannada" tone="purple" /> : null}
        <Text style={[Type.body, styles.count, { color: theme.textSecondary }]}>{answered} answered</Text>
      </View>
    </Pressable>
  );
}

export const QuestionRow = memo(RowImpl);

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, minHeight: 44 },
  text: { fontSize: 15, lineHeight: 21 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, textTransform: 'capitalize' },
  count: { fontSize: 12, marginLeft: 'auto' },
});
