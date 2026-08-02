import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getParticipation } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { ParticipationReport } from '@stemreach/core';

export default function ParticipationScreen() {
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ParticipationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(null);
      getParticipation(date, '10A')
        .then(setReport)
        .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
        .finally(() => setLoading(false));
    }, [date]),
  );

  const rows = [
    ...(report?.done ?? []).map((s) => ({ id: s.id, name: s.name, status: `done · ${s.answered} answers${s.completed ? ' · ✓ complete' : ''}` })),
    ...(report?.pending ?? []).map((s) => ({ id: s.id, name: s.name, status: 'pending' })),
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedView style={styles.headerRow}>
          <Link href="/(teacher)" style={styles.back}>
            <ThemedText style={styles.backText}>‹ Back</ThemedText>
          </Link>
          <ThemedText type="title" style={styles.header}>
            Participation
          </ThemedText>
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          {date} · Class 10A
        </ThemedText>

        {loading ? (
          <ActivityIndicator size="large" style={{ marginTop: 40 }} />
        ) : error ? (
          <ThemedText themeColor="textSecondary" style={{ marginTop: 24 }}>
            {error}
          </ThemedText>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <ThemedView type={item.status.startsWith('pending') ? undefined : 'backgroundElement'} style={[styles.row, item.status.startsWith('pending') && styles.rowPending]}>
                <ThemedText>{item.name}</ThemedText>
                <ThemedText type="small" themeColor={item.status.startsWith('pending') ? 'textSecondary' : undefined}>
                  {item.status}
                </ThemedText>
              </ThemedView>
            )}
            ListHeaderComponent={
              <ThemedText type="smallBold" style={styles.countLine}>
                {report?.done.length ?? 0} done · {report?.pending.length ?? 0} pending of {report?.total_students ?? 0}
              </ThemedText>
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: 16, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { paddingVertical: 4 },
  backText: { color: '#3c87f7', fontSize: 20 },
  header: { fontSize: 28 },
  countLine: { marginVertical: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowPending: { borderWidth: 1, borderColor: '#444' },
});
