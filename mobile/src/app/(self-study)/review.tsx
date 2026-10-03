import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { hapticFlip, hapticLight, hapticSuccess } from '@/components/haptics';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/toast';
import { ZettelText } from '@/components/zettel-text';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, onAccent, Type } from '@/constants/theme';
import { getSelfStudyDb, normalizeDeckId, type LocalCard } from '@/lib/self-study-db';
import { calculateSM2, localDateString, type ReviewButton } from '@/lib/sm2';

/**
 * Flashcard review for one deck (local SQLite + SM-2). `deckId` is validated
 * at the receiving screen: a missing/empty param renders an error state and
 * never reaches the database. Only cards due today (local calendar) are
 * queued — reviewing a card before its due date would defeat the spacing.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ deckId?: string | string[] }>();
  const deckId = normalizeDeckId(params.deckId) ?? '';
  const { showToast } = useToast();
  const [cards, setCards] = useState<LocalCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(deckId.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Cards graded Again this session — due again today (interval 0), offered for another pass. */
  const [againCount, setAgainCount] = useState(0);
  /** Cards in the deck at all, and the earliest future due date — for the nothing-due state. */
  const [deckInfo, setDeckInfo] = useState<{ total: number; nextDue: string | null }>({ total: 0, nextDue: null });
  const announced = useRef(-1);

  const load = useCallback(() => {
    if (!deckId) {
      setCards([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setIdx(0);
    setAgainCount(0);
    setRevealed(false);
    (async () => {
      try {
        const db = await getSelfStudyDb();
        const today = localDateString();
        const rows = await db.getAllAsync<LocalCard>(
          'SELECT * FROM local_cards WHERE deck_id = ? AND due_date <= ? ORDER BY due_date ASC',
          [deckId, today],
        );
        const info = await db.getFirstAsync<{ total: number; next_due: string | null }>(
          'SELECT COUNT(*) AS total, MIN(CASE WHEN due_date > ? THEN due_date END) AS next_due FROM local_cards WHERE deck_id = ?',
          [today, deckId],
        );
        announced.current = -1;
        setCards(rows);
        setDeckInfo({ total: info?.total ?? 0, nextDue: info?.next_due ?? null });
      } catch (e) {
        setCards([]);
        setError(e instanceof Error ? e.message : 'failed to load cards');
      } finally {
        setLoading(false);
      }
    })();
  }, [deckId]);

  useEffect(() => {
    load();
  }, [load]);

  // Announce progress + completion to screen readers (confirm-sheet idiom).
  useEffect(() => {
    if (loading || error != null || cards.length === 0) return;
    if (announced.current === idx) return;
    announced.current = idx;
    AccessibilityInfo.announceForAccessibility(
      idx >= cards.length
        ? 'All cards reviewed — deck complete'
        : `Card ${idx + 1} of ${cards.length}`,
    );
  }, [idx, cards.length, loading, error]);

  /** Back to wherever review was opened from (the deck screen); deck list on a cold deep link. */
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(self-study)');
  };

  const reveal = () => {
    hapticFlip();
    setRevealed(true);
  };

  const handleGrade = async (button: ReviewButton) => {
    const current = cards[idx];
    if (!current || busy) return;
    setBusy(true);
    try {
      const next = calculateSM2(
        { interval: current.interval, repetition: current.repetition, ease_factor: current.ease_factor },
        button,
        localDateString(),
      );
      const db = await getSelfStudyDb();
      await db.runAsync(
        'UPDATE local_cards SET interval = ?, repetition = ?, ease_factor = ?, due_date = ? WHERE id = ?',
        [next.interval, next.repetition, next.ease_factor, next.due_date, current.id],
      );
      if (button !== 'again') hapticSuccess();
      else hapticLight();
      setRevealed(false);
      if (button === 'again') setAgainCount((n) => n + 1);
      setIdx((i) => i + 1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'failed to save your grade', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Zettelkasten `[[…]]` link → open the deck that owns the target card. */
  const openLinkedCard = useCallback(
    async (targetId: string) => {
      try {
        const db = await getSelfStudyDb();
        const rows = await db.getAllAsync<{ deck_id: string }>(
          'SELECT deck_id FROM local_cards WHERE id = ?',
          [targetId],
        );
        const linkedDeckId = rows[0]?.deck_id;
        if (linkedDeckId) {
          router.push({ pathname: '/(self-study)/review', params: { deckId: linkedDeckId } });
        } else {
          showToast(`Linked card "${targetId}" was not found`, 'info');
        }
      } catch {
        showToast('Could not open the linked card', 'error');
      }
    },
    [showToast],
  );

  const card = cards[idx];
  const deckEmpty = deckInfo.total === 0;

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(self-study)" />
          <Heading accessibilityRole="header" className="flex-1 text-2xl" style={Type.heading}>
            Review
          </Heading>
          <ThemeToggle />
        </View>

        {loading ? (
          <Box className="flex-1 items-center justify-center bg-background">
            <ActivityIndicator size="large" color={Accents.primary} />
          </Box>
        ) : !deckId ? (
          <Box className="flex-1 items-center justify-center gap-4 bg-background p-8">
            <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
              Deck not found
            </Heading>
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              This review link is missing its deck. Pick a deck from the list to start studying.
            </UIText>
            <Button
              variant="default"
              className="min-h-11 rounded-xl"
              onPress={() => router.replace('/(self-study)')}
              accessibilityRole="button"
            >
              <ButtonText style={Type.bodyBold}>Back to decks</ButtonText>
            </Button>
          </Box>
        ) : error ? (
          <Box className="flex-1 items-center justify-center gap-4 bg-background p-8">
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              {error}
            </UIText>
            <Button variant="default" className="min-h-11 rounded-xl" onPress={load} accessibilityRole="button">
              <ButtonText style={Type.bodyBold}>Retry</ButtonText>
            </Button>
          </Box>
        ) : (!card || idx >= cards.length) && againCount > 0 ? (
          <Box className="flex-1 items-center justify-center gap-4 bg-background p-8">
            <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
              Round complete
            </Heading>
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              {againCount === 1 ? '1 card needs' : `${againCount} cards need`} another look today.
            </UIText>
            <Button variant="default" className="min-h-11 rounded-xl" onPress={load} accessibilityRole="button">
              <ButtonText style={Type.bodyBold}>{`Review ${againCount} again`}</ButtonText>
            </Button>
            <Button variant="outline" className="min-h-11 rounded-xl" onPress={goBack} accessibilityRole="button">
              <ButtonText style={Type.bodyBold}>Back to deck</ButtonText>
            </Button>
          </Box>
        ) : !card || idx >= cards.length ? (
          <Box className="flex-1 items-center justify-center gap-4 bg-background p-8">
            <Text style={{ fontSize: 56 }} accessible={false}>
              🎉
            </Text>
            <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
              All caught up!
            </Heading>
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              {deckEmpty
                ? 'This deck has no cards yet — add some from the deck screen.'
                : deckInfo.nextDue
                  ? `Nothing else is due today. Next card due ${deckInfo.nextDue}.`
                  : 'Every card in this deck is reviewed — come back when they are due again.'}
            </UIText>
            <Button
              variant="default"
              className="min-h-11 rounded-xl"
              onPress={goBack}
              accessibilityRole="button"
            >
              <ButtonText style={Type.bodyBold}>Back to deck</ButtonText>
            </Button>
          </Box>
        ) : (
          <>
            <UIText className="text-sm text-muted-foreground" style={Type.bodySemi}>
              Card {idx + 1}/{cards.length}
            </UIText>

            <Box className="flex-1 justify-center gap-4 rounded-3xl bg-card p-6">
              <ZettelText content={card.front} onLinkPress={openLinkedCard} />
              {revealed ? (
                <View style={styles.backArea}>
                  <Box className="bg-border" style={styles.divider} />
                  <ZettelText content={card.back} onLinkPress={openLinkedCard} />
                </View>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="min-h-11 rounded-2xl"
                  onPress={reveal}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: revealed }}
                  accessibilityHint="Shows the back of the card"
                >
                  <ButtonText style={Type.bodyBold}>👀 Show Answer</ButtonText>
                </Button>
              )}
            </Box>

            {revealed && (
              <View style={styles.gradeRow}>
                <Button
                  variant="destructive"
                  className="min-h-11 flex-1 rounded-2xl"
                  onPress={() => handleGrade('again')}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <ButtonText style={Type.bodyBold}>Again</ButtonText>
                </Button>
                <Button
                  variant="default"
                  className="min-h-11 flex-1 rounded-2xl bg-warn"
                  onPress={() => handleGrade('hard')}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.warn) }}>Hard</ButtonText>
                </Button>
                <Button
                  variant="default"
                  className="min-h-11 flex-1 rounded-2xl bg-success"
                  onPress={() => handleGrade('good')}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.success) }}>Good</ButtonText>
                </Button>
                <Button
                  variant="default"
                  className="min-h-11 flex-1 rounded-2xl bg-teal"
                  onPress={() => handleGrade('easy')}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <ButtonText style={{ ...Type.bodyBold, color: onAccent(Accents.teal) }}>Easy</ButtonText>
                </Button>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backArea: { marginTop: 4 },
  divider: { height: 1, marginVertical: 16 },
  gradeRow: { flexDirection: 'row', gap: 10 },
});
