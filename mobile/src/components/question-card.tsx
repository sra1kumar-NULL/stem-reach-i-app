import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Confetti } from '@/components/confetti';
import { hapticError, hapticFlip, hapticLight, hapticSuccess } from '@/components/haptics';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text as UIText } from '@/components/ui/text';
import { Accents, onAccent, Type } from '@/constants/theme';
import type { QuestionDto, SelfEval, SubmissionResponse } from '@stemreach/core';

interface Props {
  question: QuestionDto;
  sectionLabel: string;
  questionNo: number;
  total: number;
  onSubmit: (questionId: string, body: { selected_option?: number; self_eval?: SelfEval }) => Promise<SubmissionResponse>;
  onAnswered: (isCorrect: boolean) => void;
  onAdvance: () => void;
}

/** One full-screen question card (MCQ or flashcard) for the vertical feed. */
export function QuestionCard({ question, sectionLabel, questionNo, total, onSubmit, onAnswered, onAdvance }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(false);
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
      if (res.is_correct) {
        hapticSuccess();
        setConfetti(true);
      } else {
        hapticError();
      }
    } catch {
      hapticLight();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const answerFlashcard = async (selfEval: SelfEval) => {
    if (result != null || busy) return;
    setBusy(true);
    try {
      const res = await onSubmit(question.id, { self_eval: selfEval });
      setResult(res);
      onAnswered(res.is_correct);
      if (res.is_correct) hapticSuccess();
      else hapticError();
    } catch {
      hapticLight();
    } finally {
      setBusy(false);
    }
  };

  const doFlip = () => {
    hapticFlip();
    Animated.spring(flip, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }).start();
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <Box className="flex-1">
      <Confetti fire={confetti} />
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
        <Box className="flex-1 justify-center bg-card p-6 rounded-3xl gap-6">
          <View style={styles.metaRow}>
            <Box className={`rounded-full px-2.5 py-1 ${isMcq ? 'bg-primary-soft' : question.is_review ? 'bg-warn-soft' : 'bg-purple-soft'}`}>
              <UIText
                className={`text-xs font-extrabold uppercase tracking-wide ${isMcq ? 'text-primary-text' : question.is_review ? 'text-warn-text' : 'text-purple-text'}`}
                style={Type.bodyBold}
              >
                {isMcq ? '🤔 MCQ' : question.is_review ? '🔁 Review' : '✨ New'}
              </UIText>
            </Box>
            <UIText className="text-sm text-muted-foreground" style={Type.bodySemi}>
              {sectionLabel} · Q{questionNo}/{total}
            </UIText>
          </View>

          <UIText className="text-2xl leading-9 font-semibold text-foreground" style={Type.heading}>
            {question.question_text}
          </UIText>

          {isMcq ? (
            <Box className="gap-3">
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
                      isSelected && !showResult && styles.optionSelected,
                      isCorrectOption && styles.optionCorrect,
                      isWrongPick && styles.optionWrong,
                    ]}
                  >
                    <UIText className="text-base text-foreground" style={Type.bodySemi}>
                      {showResult && isCorrectOption ? '✅ ' : showResult && isWrongPick ? '❌ ' : `${'ABCD'[i]}. `}
                      {option}
                    </UIText>
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
                  <Box
                    className={`flex-row gap-2.5 items-start rounded-2xl p-3.5 border mt-2 ${
                      result.is_correct ? 'bg-success-soft border-success' : 'bg-danger-soft border-danger'
                    }`}
                  >
                    <Text style={styles.feedbackEmoji}>{result.is_correct ? '🎉' : '💪'}</Text>
                    <Box className="flex-1 gap-0.5">
                      <UIText
                        className={`text-base font-extrabold ${result.is_correct ? 'text-success-text' : 'text-danger-text'}`}
                        style={Type.bodyBold}
                      >
                        {result.is_correct ? 'Correct! Great job' : 'Not quite — you learn every time'}
                      </UIText>
                      {result.explanation != null && (
                        <UIText className="text-sm text-muted-foreground" style={Type.body}>
                          {result.explanation}
                        </UIText>
                      )}
                    </Box>
                  </Box>
                </Animated.View>
              )}
            </Box>
          ) : (
            <View style={styles.flipArea}>
              <Animated.View
                style={[
                  styles.flipFace,
                  styles.flipFront,
                  { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
                ]}
              >
                <Button variant="outline" size="lg" className="rounded-2xl bg-purple border-purple" onPress={doFlip} disabled={busy}>
                  <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.purple) }}>
                    👀 Show Answer
                  </ButtonText>
                </Button>
                <UIText className="text-sm text-muted-foreground text-center" style={Type.body}>
                  Think hard, then flip!
                </UIText>
              </Animated.View>

              <Animated.View style={[styles.flipFace, { transform: [{ perspective: 1200 }, { rotateY: backRotate }] }]}>
                <Box className="bg-secondary rounded-2xl p-4">
                  <UIText className="text-lg leading-7 text-foreground" style={Type.bodySemi}>
                    {question.answer ?? '—'}
                  </UIText>
                </Box>

                {result == null ? (
                  <View style={styles.evalRow}>
                    <Button variant="destructive" className="flex-1 rounded-2xl" onPress={() => answerFlashcard('again')} disabled={busy}>
                      <ButtonText style={Type.bodyBold}>🔁 Again</ButtonText>
                    </Button>
                    <Button variant="default" className="flex-1 rounded-2xl bg-success" onPress={() => answerFlashcard('good')} disabled={busy}>
                      <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.success) }}>👍 Good</ButtonText>
                    </Button>
                    <Button variant="default" className="flex-1 rounded-2xl bg-teal" onPress={() => answerFlashcard('easy')} disabled={busy}>
                      <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.teal) }}>⚡ Easy</ButtonText>
                    </Button>
                  </View>
                ) : (
                  <Animated.View style={{ opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
                    <Box
                      className={`flex-row gap-2.5 items-start rounded-2xl p-3.5 border ${
                        result.is_correct ? 'bg-success-soft border-success' : 'bg-warn-soft border-warn'
                      }`}
                    >
                      <Text style={styles.feedbackEmoji}>{result.is_correct ? '🧠' : '📚'}</Text>
                      <Box className="flex-1 gap-0.5">
                        <UIText
                          className={`text-base font-extrabold ${result.is_correct ? 'text-success-text' : 'text-warn-text'}`}
                          style={Type.bodyBold}
                        >
                          {result.is_correct ? 'Great recall!' : 'Added back for practice'}
                        </UIText>
                        {result.explanation != null && (
                          <UIText className="text-sm text-muted-foreground" style={Type.body}>
                            {result.explanation}
                          </UIText>
                        )}
                      </Box>
                    </Box>
                  </Animated.View>
                )}
              </Animated.View>
            </View>
          )}
        </Box>
      </Animated.View>
    </Box>
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  option: {
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 14,
    padding: 16,
  },
  optionPressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  optionSelected: { borderColor: Accents.primary, backgroundColor: Accents.primarySoft },
  optionCorrect: { borderColor: Accents.success, backgroundColor: Accents.successSoft },
  optionWrong: { borderColor: Accents.danger, backgroundColor: Accents.dangerSoft },
  feedbackEmoji: { fontSize: 26 },
  flipArea: { position: 'relative', minHeight: 230 },
  flipFace: { position: 'absolute', top: 0, left: 0, right: 0, gap: 12, backfaceVisibility: 'hidden' },
  flipFront: { alignItems: 'stretch' },
  evalRow: { flexDirection: 'row', gap: 10 },
});
