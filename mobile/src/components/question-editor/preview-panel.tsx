import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { QuestionCard } from '@/components/question-card';
import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { previewVerdict, type EditorForm } from '@/lib/question-editor';
import type { QuestionDto, SelfEval } from '@stemreach/core';

interface Props {
  form: EditorForm;
  sectionName: string;
}

const PLACEHOLDER = { text: 'Your question appears here', option: 'Option' };

/** Renders the real student card (no network): answers are graded locally from the form. */
export function PreviewPanel({ form, sectionName }: Props) {
  const theme = useTheme();
  // Debounce so the card (and its entry animation) does not remount on every keystroke.
  const [shown, setShown] = useState(form);
  useEffect(() => {
    const t = setTimeout(() => setShown(form), 350);
    return () => clearTimeout(t);
  }, [form]);
  const [round, setRound] = useState(0);

  const question: QuestionDto = useMemo(
    () => ({
      id: '00000000-0000-4000-8000-000000000000',
      section_id: shown.section_id || '00000000-0000-4000-8000-000000000001',
      type: shown.type,
      question_text: shown.text.trim() || PLACEHOLDER.text,
      options: shown.type === 'mcq' ? shown.options.map((o, i) => o.trim() || `${PLACEHOLDER.option} ${i + 1}`) : null,
      answer: shown.type === 'flashcard' ? shown.answer.trim() || 'Answer' : null,
      is_review: false,
    }),
    [shown],
  );

  const onSubmit = useCallback(
    async (_id: string, body: { selected_option?: number; self_eval?: SelfEval }) => previewVerdict(shown, body),
    [shown],
  );
  const noop = useCallback(() => {}, []);
  const again = useCallback(() => setRound((r) => r + 1), []);

  const key = `${round}|${question.type}|${question.question_text}|${(question.options ?? []).join('¦')}|${question.answer}|${shown.correct}|${shown.explanation}`;

  return (
    <View style={[styles.frame, { borderColor: Accents.border, backgroundColor: theme.background }]}>
      <Text style={[Type.body, styles.note, { color: theme.textSecondary }]} accessibilityRole="text">
        Tap an answer to try it. Nothing is saved.
      </Text>
      <ScrollView style={styles.cap} contentContainerStyle={styles.stage} nestedScrollEnabled showsVerticalScrollIndicator>
        <QuestionCard
          key={key}
          question={question}
          sectionLabel={sectionName || 'Preview'}
          questionNo={1}
          total={1}
          onSubmit={onSubmit}
          onAnswered={noop}
          onAdvance={again}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderRadius: 18, padding: 10, gap: 8 },
  note: { fontSize: 12, textAlign: 'center' },
  /** The real card is tall; cap the preview so it never pushes the form 700 px down. */
  cap: { maxHeight: 360 },
  stage: { minHeight: 520, flexGrow: 1 },
});
