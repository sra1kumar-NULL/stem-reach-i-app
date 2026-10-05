import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Confetti } from '@/components/confetti';
import { RatingButtons, type RatingValue, SHOW_ANSWER_BG, SHOW_ANSWER_FG } from '@/components/student/rating-buttons';
import { hapticError, hapticFlip, hapticLight, hapticSuccess } from '@/components/haptics';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Type } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { toFriendlyError } from '@/lib/friendly-error';
import type { QuestionDto, SelfEval, SubmissionResponse } from '@stemreach/core';

interface Props {
  question: QuestionDto;
  sectionLabel: string;
  /** Position shown on the card, consistent with the feed header counter (answered + 1). */
  questionNo: number;
  total: number;
  /** Overrides "Question {questionNo} of {total}" (e.g. "Extra practice"). */
  positionLabel?: string;
  onSubmit: (questionId: string, body: { selected_option?: number; self_eval?: SelfEval }) => Promise<SubmissionResponse>;
  onAnswered: (isCorrect: boolean) => void;
  onAdvance: () => void;
  /** Present only while the card can be skipped (unanswered, under the cap, another card left). */
  onSkip?: () => void;
  /** Shown under the card while unanswered, e.g. "2 skipped - answer them to finish". */
  skipNote?: string;
  /** True when nothing else is left to answer; the Next button reads "Finish". Defaults to the last numbered card. */
  isLast?: boolean;
}

/** One full-screen question card (MCQ or flashcard) for the vertical feed. */
export function QuestionCard({ question, sectionLabel, questionNo, total, positionLabel, onSubmit, onAnswered, onAdvance, onSkip, skipNote, isLast }: Props) {
  const finishing = isLast ?? questionNo >= total;
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(false);
  /** Last submit failure — shown inline with Retry instead of silently resetting the card. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Flashcard grade whose submit failed, for Retry. */
  const [pendingEval, setPendingEval] = useState<SelfEval | null>(null);
  const [flipped, setFlipped] = useState(false);
  const entry = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  // Latest onAdvance without re-running the post-answer effect (parents pass a fresh closure every render).
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  const isMcq = question.type === 'mcq';
  const reduceMotion = useReducedMotion();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  /** Spring to `toValue`, or jump there when the OS asks for reduced motion. */
  const settle = (value: Animated.Value, toValue: number, friction: number, tension: number) => {
    if (reduceRef.current) {
      value.setValue(toValue);
      return;
    }
    Animated.spring(value, { toValue, useNativeDriver: true, friction, tension }).start();
  };

  useEffect(() => {
    if (reduceRef.current) entry.setValue(1);
    else Animated.spring(entry, { toValue: 1, useNativeDriver: true, friction: 8, tension: 55 }).start();
  }, [entry]);

  // After answering: announce the feedback, and auto-advance only when there
  // is nothing to read (no explanation) and no screen reader is running —
  // otherwise the explicit Next button is the way on (WCAG 2.2.1).
  useEffect(() => {
    if (result == null) return;
    settle(pop, 1, 5, 90);
    const verdict = isMcq
      ? result.is_correct
        ? 'Correct!'
        : 'Not quite.'
      : result.is_correct
        ? 'Great recall!'
        : 'Added back for practice.';
    AccessibilityInfo.announceForAccessibility(result.explanation ? `${verdict} ${result.explanation}` : verdict);
    if (result.explanation != null) return;
    let cancelled = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((screenReader) => {
        if (!cancelled && !screenReader) t = setTimeout(() => advanceRef.current(), 1800);
      });
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [result, pop, isMcq]);

  const answerMcq = async (option: number) => {
    if (result != null || busy) return;
    setSelected(option);
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await onSubmit(question.id, { selected_option: option });
      setResult(res);
      onAnswered(res.is_correct);
      if (res.is_correct) {
        hapticSuccess();
        if (!reduceRef.current) setConfetti(true);
      } else {
        hapticError();
      }
    } catch (e) {
      // Keep the pick visible as pending and say why; Retry (or another option) resubmits.
      hapticLight();
      setSubmitError(toFriendlyError(e, "Couldn't send your answer. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const answerFlashcard = async (selfEval: SelfEval) => {
    if (result != null || busy) return;
    setBusy(true);
    setSubmitError(null);
    setPendingEval(selfEval);
    try {
      const res = await onSubmit(question.id, { self_eval: selfEval });
      setResult(res);
      onAnswered(res.is_correct);
      if (res.is_correct) hapticSuccess();
      else hapticError();
    } catch (e) {
      hapticLight();
      setSubmitError(toFriendlyError(e, "Couldn't send your answer. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const doFlip = () => {
    hapticFlip();
    // Android ignores backfaceVisibility for touches, so the faces also need
    // pointerEvents or the hidden grade buttons swallow taps on "Show Answer".
    setFlipped(true);
    settle(flip, 1, 6, 60);
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
            <Box style={styles.badge} className={`rounded-full px-2.5 py-1 ${isMcq ? 'bg-primary-soft' : question.is_review ? 'bg-warn-soft' : 'bg-purple-soft'}`}>
              <UIText
                className={`text-xs font-extrabold uppercase tracking-wide ${isMcq ? 'text-primary-text' : question.is_review ? 'text-warn-text' : 'text-purple-text'}`}
                style={Type.bodyBold}
              >
                {isMcq ? '🤔 MCQ' : question.is_review ? '🔁 Review' : '✨ New'}
              </UIText>
            </Box>
            <UIText className="text-sm text-muted-foreground" style={[Type.bodySemi, styles.metaLabel]} numberOfLines={2}>
              {sectionLabel} · {positionLabel ?? `Question ${questionNo} of ${total}`}
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
                    disabled={result != null || busy}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled: result != null || busy }}
                    accessibilityLabel={`${'ABCD'[i]}. ${option}${isCorrectOption ? ', correct answer' : isWrongPick ? ', your answer, incorrect' : ''}`}
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
                pointerEvents={flipped ? 'none' : 'auto'}
                accessibilityElementsHidden={flipped}
                importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
                style={[
                  styles.flipFace,
                  styles.flipFront,
                  { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
                ]}
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-2xl"
                  style={{ backgroundColor: SHOW_ANSWER_BG, borderColor: SHOW_ANSWER_BG }}
                  onPress={doFlip}
                  disabled={busy}
                >
                  <ButtonText style={{ ...Type.bodyBold, color: SHOW_ANSWER_FG }}>
                    👀 Show Answer
                  </ButtonText>
                </Button>
                <UIText className="text-sm text-muted-foreground text-center" style={Type.body}>
                  Think hard, then flip!
                </UIText>
              </Animated.View>

              <Animated.View
                pointerEvents={flipped ? 'auto' : 'none'}
                accessibilityElementsHidden={!flipped}
                importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
                style={[styles.flipBack, { transform: [{ perspective: 1200 }, { rotateY: backRotate }] }]}
              >
                <Box className="bg-secondary rounded-2xl p-4">
                  <UIText className="text-lg leading-7 text-foreground" style={Type.bodySemi}>
                    {question.answer ?? '—'}
                  </UIText>
                </Box>

                {result == null ? (
                  <RatingButtons values={FLASHCARD_RATINGS} busy={busy} pending={pendingEval as RatingValue | null} onPick={(v) => void answerFlashcard(v)} />
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

          {submitError != null && result == null && (
            <Box className="gap-2 rounded-2xl border border-danger bg-danger-soft p-3.5">
              <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.bodySemi}>
                {submitError}
              </UIText>
              <Button
                variant="default"
                className="min-h-11 self-start rounded-xl"
                disabled={busy}
                onPress={() => {
                  if (isMcq && selected != null) void answerMcq(selected);
                  else if (!isMcq && pendingEval != null) void answerFlashcard(pendingEval);
                }}
                accessibilityRole="button"
              >
                <ButtonText style={Type.bodyBold}>Retry</ButtonText>
              </Button>
            </Box>
          )}

          {result == null && !flipped && (onSkip != null || skipNote != null) && (
            <View style={styles.skipArea}>
              {skipNote != null && (
                <UIText accessibilityLiveRegion="polite" className="text-sm text-muted-foreground text-center" style={Type.bodySemi}>
                  {skipNote}
                </UIText>
              )}
              {onSkip != null && (
                <Button
                  variant="ghost"
                  className="min-h-11 min-w-24 rounded-xl px-5"
                  onPress={onSkip}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Skip this question"
                  accessibilityHint="Moves it to the end. Nothing is recorded."
                  accessibilityState={{ disabled: busy }}
                >
                  <ButtonText className="text-muted-foreground" style={Type.bodySemi}>
                    Skip
                  </ButtonText>
                </Button>
              )}
            </View>
          )}

          {result != null && (
            <Button
              variant="default"
              size="lg"
              className="min-h-11 rounded-2xl"
              onPress={onAdvance}
              accessibilityRole="button"
              accessibilityLabel={finishing ? 'Finish' : 'Next question'}
            >
              <ButtonText style={Type.bodyBold}>{finishing ? 'Finish' : 'Next →'}</ButtonText>
            </Button>
          )}
        </Box>
      </Animated.View>
    </Box>
  );
}

const FLASHCARD_RATINGS = ['again', 'good', 'easy'] as const;

const styles = StyleSheet.create({
  entry: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Badge keeps its size; the label takes the rest and wraps/truncates instead of overflowing the card (Android).
  badge: { flexShrink: 0 },
  metaLabel: { flex: 1, flexShrink: 1, minWidth: 0 },
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
  // In normal flow (not absolute) so a long answer + feedback grows the card
  // instead of overflowing onto the Next button at large font scales.
  flipBack: { gap: 12, backfaceVisibility: 'hidden' },
  skipArea: { alignItems: 'center', gap: 2 },
});
