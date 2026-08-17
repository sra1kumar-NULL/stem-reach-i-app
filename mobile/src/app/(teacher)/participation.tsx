import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getParticipation } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents } from '@/constants/theme';
import type { ParticipationReport } from '@stemreach/core';

const AVATAR_COLORS = [Accents.purple, Accents.teal, Accents.pink, Accents.primary, Accents.warn, '#e5484d'];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface Row {
  id: string;
  name: string;
  done: boolean;
  completed: boolean;
  answered: number;
}

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

  const rows: Row[] = [
    ...(report?.done ?? []).map((s) => ({ id: s.id, name: s.name, done: true, completed: s.completed, answered: s.answered })),
    ...(report?.pending ?? []).map((s) => ({ id: s.id, name: s.name, done: false, completed: false, answered: 0 })),
  ];

  const completedCount = report?.done.filter((s) => s.completed).length ?? 0;

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
            renderItem={({ item, index }) => (
              <ThemedView type="backgroundElement" style={[styles.row, !item.done && styles.rowPending]}>
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }]}>
                  <Text style={styles.avatarText}>{initials(item.name)}</Text>
                </View>
                <ThemedView style={styles.rowBody}>
                  <ThemedText>{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.done ? `${item.answered} answers` : 'not started yet'}
                  </ThemedText>
                </ThemedView>
                <View style={[styles.statusChip, { backgroundColor: !item.done ? '#333' : item.completed ? Accents.success : Accents.warn }]}>
                  <Text style={styles.statusText}>{!item.done ? '⏳ pending' : item.completed ? '✅ done' : '▶ in progress'}</Text>
                </View>
              </ThemedView>
            )}
            ListHeaderComponent={
              <View style={styles.statsRow}>
                <ThemedView type="backgroundElement" style={styles.statChip}>
                  <Text style={styles.statValue}>{completedCount}/{report?.total_students ?? 0}</Text>
                  <ThemedText type="small" themeColor="textSecondary">
                    completed
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={styles.statChip}>
                  <Text style={styles.statValue}>{report?.done.length ?? 0}</Text>
                  <ThemedText type="small" themeColor="textSecondary">
                    started
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={styles.statChip}>
                  <Text style={styles.statValue}>{report?.pending.length ?? 0}</Text>
                  <ThemedText type="small" themeColor="textSecondary">
                    pending
                  </ThemedText>
                </ThemedView>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
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
  backText: { color: Accents.primary, fontSize: 20 },
  header: { fontSize: 28 },
  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 12 },
  statChip: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 12, gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
  },
  rowPending: { opacity: 0.7 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  rowBody: { flex: 1, gap: 2 },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
