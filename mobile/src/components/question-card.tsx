import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { QuestionDto, SubmissionResponse } from '@stemreach/core';

interface Props {
  question: QuestionDto;
  sectionLabel: string;
  questionNo: number;
  total: number;
  onSubmit: (questionId: string, body: { selected_option?: number; self_eval?: 'got_it' | 'need_practice' }) => Promise<SubmissionResponse>;
  onAnswered: (isCorrect: boolean) => void;
  onAdvance: () => void;
}

/** One full-screen question card (MCQ or flashcard) for the vertical feed. */
export function QuestionCard({ question, sectionLabel, questionNo, total, onSubmit, onAnswered, onAdvance }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (result == null) return;
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    const t = setTimeout(onAdvance, 1600);
    return () => clearTimeout(t);
  }, [result, pop, onAdvance]);

  const answerMcq = async (option: number) => {
    if (selected != null || busy) return;
    setSelected(option);
    setBusy(true);
    try {
      const res = await onSubmit(question.id, { selected_option: option });
      setResult(res);
      onAnswered(res.is_correct);
    } catch {
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const answerFlashcard = async (selfEval: 'got_it' | 'need_practice') => {
    if (result != null || busy) return;
    setBusy(true);
    try {
      const res = await onSubmit(question.id, { self_eval: selfEval });
      setResult(res);
      onAnswered(res.is_correct);
    } finally {
      setBusy(false);
    }
  };

  const isMcq = question.type === 'mcq';

  return (
    <ThemedView style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
        {sectionLabel} · Q{questionNo}/{total} · {isMcq ? 'MCQ' : 'Think & recall'}
      </ThemedText>

      <ThemedText style={styles.question}>{question.question_text}</ThemedText>

      {isMcq ? (
        <ThemedView style={styles.options}>
          {question.options?.map((option, i) => {
            const isSelected = selected === i;
            const showResult = result != null;
            const isCorrectOption = showResult && result.correct_option === i;
            const isWrongPick = showResult && isSelected && !result.is_correct;
            return (
              <Pressable
                key={i}
                onPress={() => answerMcq(i)}
                disabled={selected != null}
                style={[
                  styles.option,
                  isSelected && styles.optionSelected,
                  isCorrectOption && styles.optionCorrect,
                  isWrongPick && styles.optionWrong,
                ]}
              >
                <ThemedText style={styles.optionLabel}>{option}</ThemedText>
              </Pressable>
            );
          })}

          {result && (
            <Animated.View style={{ opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
              <ThemedText style={[styles.feedbackText, { color: result.is_correct ? '#2ea043' : '#f85149' }]}>
                {result.is_correct ? 'Correct ✓' : 'Incorrect'}
              </ThemedText>
              {result.explanation != null && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.explanation}>
                  {result.explanation}
                </ThemedText>
              )}
            </Animated.View>
          )}
        </ThemedView>
      ) : (
        <ThemedView style={styles.flashArea}>
          {!revealed ? (
            <Pressable style={styles.revealBtn} onPress={() => setRevealed(true)}>
              <Text style={styles.revealLabel}>Show Answer</Text>
            </Pressable>
          ) : (
            <Animated.View style={{ opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1] }), gap: 12 }}>
              <ThemedView type="backgroundElement" style={styles.answerBox}>
                <ThemedText style={styles.answerText}>{question.answer ?? '—'}</ThemedText>
              </ThemedView>

              {result == null ? (
                <ThemedView style={styles.evalRow}>
                  <Pressable style={[styles.evalBtn, styles.evalRight]} onPress={() => answerFlashcard('got_it')} disabled={busy}>
                    <Text style={styles.evalLabel}>I got it right ✓</Text>
                  </Pressable>
                  <Pressable style={[styles.evalBtn, styles.evalAgain]} onPress={() => answerFlashcard('need_practice')} disabled={busy}>
                    <Text style={styles.evalLabel}>Need practice ↻</Text>
                  </Pressable>
                </ThemedView>
              ) : (
                <ThemedView style={styles.answerBox}>
                  <ThemedText style={[styles.feedbackText, { color: result.is_correct ? '#2ea043' : '#9e6a03' }]}>
                    {result.is_correct ? 'Great recall ✓' : 'Marked for practice'}
                  </ThemedText>
                  {result.explanation != null && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.explanation}>
                      {result.explanation}
                    </ThemedText>
                  )}
                </ThemedView>
              )}
            </Animated.View>
          )}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, justifyContent: 'center', padding: 24, gap: 24 },
  meta: { textTransform: 'uppercase', letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 36, fontWeight: '600' },
  options: { gap: 12 },
  option: { borderWidth: 1, borderColor: '#444', borderRadius: 14, padding: 16 },
  optionSelected: { borderColor: '#3c87f7' },
  optionCorrect: { backgroundColor: 'rgba(46, 160, 67, 0.25)', borderColor: '#2ea043' },
  optionWrong: { backgroundColor: 'rgba(248, 81, 73, 0.25)', borderColor: '#f85149' },
  optionLabel: { fontSize: 16 },
  feedbackText: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  explanation: { marginTop: 4 },
  flashArea: { gap: 16 },
  revealBtn: { backgroundColor: '#3c87f7', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  revealLabel: { color: '#fff', fontWeight: '700', fontSize: 17 },
  answerBox: { borderRadius: 14, padding: 16 },
  answerText: { fontSize: 18, lineHeight: 26 },
  evalRow: { flexDirection: 'row', gap: 12 },
  evalBtn: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  evalRight: { backgroundColor: '#2ea043' },
  evalAgain: { backgroundColor: '#9e6a03' },
  evalLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
