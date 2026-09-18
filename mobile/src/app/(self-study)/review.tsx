import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZettelText } from '@/components/zettel-text';
import { Accents, Nord } from '@/constants/theme';
import { getSelfStudyDb, LocalCard } from '@/lib/self-study-db';
import { calculateSM2, Grade } from '@/lib/sm2';

export default function ReviewScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const [cards, setCards] = useState<LocalCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getSelfStudyDb();
      const rows = await db.getAllAsync<LocalCard>(
        'SELECT * FROM local_cards WHERE deck_id = ? ORDER BY due_date ASC',
        [deckId]
      );
      setCards(rows);
    })();
  }, [deckId]);

  const handleGrade = async (grade: Grade) => {
    const current = cards[idx];
    const sm2 = calculateSM2(
      { interval: current.interval, repetition: current.repetition, ease_factor: current.ease_factor },
      grade
    );

    const db = await getSelfStudyDb();
    await db.runAsync(
      'UPDATE local_cards SET interval = ?, repetition = ?, ease_factor = ?, due_date = ? WHERE id = ?',
      [sm2.interval, sm2.repetition, sm2.ease_factor, sm2.due_date, current.id]
    );

    setRevealed(false);
    setIdx((i) => i + 1);
  };

  const card = cards[idx];

  if (!card) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">All caught up! 🎉</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedText type="small" themeColor="textSecondary">Card {idx + 1}/{cards.length}</ThemedText>
        <ThemedView style={styles.card}>
          <ZettelText content={card.front} />
          {revealed ? (
            <View style={styles.backArea}>
              <View style={styles.divider} />
              <ZettelText content={card.back} />
            </View>
          ) : (
            <Pressable style={styles.revealBtn} onPress={() => setRevealed(true)}>
              <Text style={styles.revealText}>Show Answer</Text>
            </Pressable>
          )}
        </ThemedView>

        {revealed && (
          <View style={styles.gradeRow}>
            <Pressable style={[styles.gradeBtn, { backgroundColor: Accents.danger }]} onPress={() => handleGrade(0)}>
              <Text style={styles.gradeText}>Again</Text>
            </Pressable>
            <Pressable style={[styles.gradeBtn, { backgroundColor: Accents.warn }]} onPress={() => handleGrade(2)}>
              <Text style={styles.gradeText}>Hard</Text>
            </Pressable>
            <Pressable style={[styles.gradeBtn, { backgroundColor: Accents.primary }]} onPress={() => handleGrade(3)}>
              <Text style={styles.gradeText}>Good</Text>
            </Pressable>
            <Pressable style={[styles.gradeBtn, { backgroundColor: Accents.success }]} onPress={() => handleGrade(5)}>
              <Text style={styles.gradeText}>Easy</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  safe: { flex: 1, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { flex: 1, padding: 24, borderRadius: 20, backgroundColor: Nord.nord1, justifyContent: 'center' },
  backArea: { marginTop: 20 },
  divider: { height: 1, backgroundColor: Accents.border, marginVertical: 16 },
  revealBtn: { marginTop: 24, padding: 16, backgroundColor: Accents.primary, borderRadius: 12, alignItems: 'center' },
  revealText: { color: Nord.nord6, fontWeight: '700' },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  gradeText: { color: Nord.nord6, fontWeight: '700' },
});
