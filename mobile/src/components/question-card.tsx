import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents } from '@/constants/theme';
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
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const entry = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const isMcq = question.type === 'mcq';

  useEffect(() => {
    Animated.spring(entry, { toValue: 1, useNativeDriver: true, friction: 8, tension: 55 }).start();
  }, [entry]);

  useEffect(() => {
    if (result == null) return;
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }).start();
    const t = setTimeout(onAdvance, 1800);
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

  const doFlip = () => {
    Animated.spring(flip, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }).start();
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <Animated.View
      style={[
        styles.entry,
        {
          opacity: entry,
          transform: [
            { translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) },
            { scale: entry.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <ThemedView style={styles.card}>
        <View style={styles.metaRow}>
          <ThemedView style={[styles.metaChip, { backgroundColor: isMcq ? Accents.primarySoft : Accents.purpleSoft }]}>
            <Text style={[styles.metaChipText, { color: isMcq ? Accents.primary : Accents.purple }]}>
              {isMcq ? '🤔 MCQ' : '🧠 Think & recall'}
            </Text>
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            {sectionLabel} · Q{questionNo}/{total}
          </ThemedText>
        </View>

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
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.optionPressed,
                    isSelected && styles.optionSelected,
                    isCorrectOption && styles.optionCorrect,
                    isWrongPick && styles.optionWrong,
                  ]}
                >
                  <ThemedText style={styles.optionLabel}>
                    {showResult && isCorrectOption ? '✅ ' : showResult && isWrongPick ? '❌ ' : `${'ABCD'[i]}. `}
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}

            {result && (
              <Animated.View
                style={{
                  opacity: pop,
                  transform: [
                    { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                    { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                    { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '0deg'] }) },
                  ],
                }}
              >
                <ThemedView
                  style={[
                    styles.feedbackBox,
                    { backgroundColor: result.is_correct ? Accents.successSoft : Accents.dangerSoft, borderColor: result.is_correct ? Accents.success : Accents.danger },
                  ]}
                >
                  <Text style={styles.feedbackEmoji}>{result.is_correct ? '🎉' : '💪'}</Text>
                  <View style={styles.feedbackBody}>
                    <ThemedText style={[styles.feedbackText, { color: result.is_correct ? Accents.success : Accents.danger }]}>
                      {result.is_correct ? 'Correct! Great job' : 'Not quite — you learn every time'}
                    </ThemedText>
                    {result.explanation != null && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {result.explanation}
                      </ThemedText>
                    )}
                  </View>
                </ThemedView>
              </Animated.View>
            )}
          </ThemedView>
        ) : (
          <View style={styles.flipArea}>
            <Animated.View
              style={[
                styles.flipFace,
                styles.flipFront,
                { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
              ]}
            >
              <Pressable style={({ pressed }) => [styles.revealBtn, pressed && styles.optionPressed]} onPress={doFlip} disabled={busy}>
                <Text style={styles.revealLabel}>👀 Show Answer</Text>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flipHint}>
                Think hard, then flip!
              </ThemedText>
            </Animated.View>

            <Animated.View
              style={[styles.flipFace, { transform: [{ perspective: 1200 }, { rotateY: backRotate }] }]}
            >
              <ThemedView type="backgroundElement" style={styles.answerBox}>
                <ThemedText style={styles.answerText}>{question.answer ?? '—'}</ThemedText>
              </ThemedView>

              {result == null ? (
                <View style={styles.evalRow}>
                  <Pressable style={({ pressed }) => [styles.evalBtn, styles.evalRight, pressed && styles.optionPressed]} onPress={() => answerFlashcard('got_it')} disabled={busy}>
                    <Text style={styles.evalLabel}>✅ I got it</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.evalBtn, styles.evalAgain, pressed && styles.optionPressed]} onPress={() => answerFlashcard('need_practice')} disabled={busy}>
                    <Text style={styles.evalLabel}>🔁 Need practice</Text>
                  </Pressable>
                </View>
              ) : (
                <Animated.View style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
                  <ThemedView
                    style={[
                      styles.feedbackBox,
                      { backgroundColor: result.is_correct ? Accents.successSoft : Accents.warnSoft, borderColor: result.is_correct ? Accents.success : Accents.warn },
                    ]}
                  >
                    <Text style={styles.feedbackEmoji}>{result.is_correct ? '🧠' : '📚'}</Text>
                    <View style={styles.feedbackBody}>
                      <ThemedText style={[styles.feedbackText, { color: result.is_correct ? Accents.success : Accents.warn }]}>
                        {result.is_correct ? 'Great recall!' : 'Marked for practice'}
                      </ThemedText>
                      {result.explanation != null && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {result.explanation}
                        </ThemedText>
                      )}
                    </View>
                  </ThemedView>
                </Animated.View>
              )}
            </Animated.View>
          </View>
        )}
      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1 },
  card: { flex: 1, justifyContent: 'center', padding: 24, gap: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  metaChipText: { fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 36, fontWeight: '600' },
  options: { gap: 12 },
  option: { borderWidth: 1, borderColor: '#444', borderRadius: 14, padding: 16 },
  optionPressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  optionSelected: { borderColor: Accents.primary, backgroundColor: Accents.primarySoft },
  optionCorrect: { backgroundColor: Accents.successSoft, borderColor: Accents.success },
  optionWrong: { backgroundColor: Accents.dangerSoft, borderColor: Accents.danger },
  optionLabel: { fontSize: 16 },
  feedbackBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  feedbackEmoji: { fontSize: 26 },
  feedbackBody: { flex: 1, gap: 2 },
  feedbackText: { fontSize: 17, fontWeight: '800' },
  flipArea: { position: 'relative', minHeight: 230 },
  flipFace: { position: 'absolute', top: 0, left: 0, right: 0, gap: 12, backfaceVisibility: 'hidden' },
  flipFront: { alignItems: 'stretch' },
  flipHint: { textAlign: 'center' },
  revealBtn: { backgroundColor: Accents.purple, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  revealLabel: { color: '#fff', fontWeight: '700', fontSize: 17 },
  answerBox: { borderRadius: 14, padding: 16 },
  answerText: { fontSize: 18, lineHeight: 26 },
  evalRow: { flexDirection: 'row', gap: 12 },
  evalBtn: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  evalRight: { backgroundColor: Accents.success },
  evalAgain: { backgroundColor: Accents.warn },
  evalLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
