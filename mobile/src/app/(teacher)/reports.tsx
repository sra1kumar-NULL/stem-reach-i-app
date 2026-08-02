import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPerformance } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { PerformanceReport } from '@stemreach/core';

const BAR_MAX = 100;

export default function ReportsScreen() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(null);
      getPerformance()
        .then(setReport)
        .catch((e) => setError(e instanceof Error ? e.message : 'failed'))
        .finally(() => setLoading(false));
    }, []),
  );

  const fmt = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedView style={styles.headerRow}>
          <Link href="/(teacher)" style={styles.back}>
            <ThemedText style={styles.backText}>‹ Back</ThemedText>
          </Link>
          <ThemedText type="title" style={styles.header}>
            Performance
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
            data={report?.per_section ?? []}
            keyExtractor={(s) => s.section_id}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.sectionRow}>
                <ThemedView style={styles.sectionHead}>
                  <ThemedText type="smallBold">
                    {item.section_no} — {item.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.attempts} attempts · {fmt(item.accuracy)}
                  </ThemedText>
                </ThemedView>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.min(1, item.accuracy) * BAR_MAX}%` }]} />
                </View>
              </ThemedView>
            )}
            ListHeaderComponent={
              <ThemedView style={styles.studentsHead}>
                <ThemedText type="smallBold">Students</ThemedText>
                {(report?.per_student ?? []).map((s) => (
                  <ThemedView key={s.id} type="backgroundElement" style={styles.studentRow}>
                    <ThemedText>{s.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {s.questions_answered} answers · {fmt(s.avg_accuracy)}
                    </ThemedText>
                  </ThemedView>
                ))}
              </ThemedView>
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
  sectionRow: { borderRadius: 14, padding: 14, marginBottom: 10, gap: 8 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#333' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#3c87f7' },
  studentsHead: { marginTop: 12, gap: 8 },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 12, padding: 12 },
});
