import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPerformance } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents } from '@/constants/theme';
import type { PerformanceReport } from '@stemreach/core';

const BAR_MAX = 100;

function accuracyColor(pct: number): string {
  if (pct >= 75) return Accents.success;
  if (pct >= 50) return Accents.warn;
  return Accents.danger;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const AVATAR_COLORS = [Accents.purple, Accents.teal, Accents.pink, Accents.primary, Accents.warn, '#e5484d'];

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const width = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      Animated.spring(width, { toValue: Math.min(1, pct) * BAR_MAX, useNativeDriver: false, friction: 8, tension: 40 }).start();
    }, [width, pct]),
  );
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width, backgroundColor: color }]} />
    </View>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

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
  const students = [...(report?.per_student ?? [])].sort((a, b) => b.avg_accuracy - a.avg_accuracy);
  const classAccuracy = students.length > 0 ? students.reduce((n, s) => n + s.avg_accuracy, 0) / students.length : 0;
  const totalAnswers = students.reduce((n, s) => n + s.questions_answered, 0);

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
            renderItem={({ item }) => {
              const pct = item.attempts > 0 ? item.accuracy * 100 : 0;
              const color = item.attempts > 0 ? accuracyColor(pct) : '#555';
              return (
                <ThemedView type="backgroundElement" style={styles.sectionRow}>
                  <ThemedView style={styles.sectionHead}>
                    <ThemedView style={styles.sectionTitleWrap}>
                      <Text style={[styles.pctBadge, { backgroundColor: item.attempts > 0 ? color : '#333', color: '#fff' }]}>
                        {item.attempts > 0 ? fmt(item.accuracy) : '—'}
                      </Text>
                      <ThemedText type="smallBold" style={styles.sectionName}>
                        {item.section_no} — {item.name}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.attempts} attempts
                    </ThemedText>
                  </ThemedView>
                  <AnimatedBar pct={pct} color={color} />
                </ThemedView>
              );
            }}
            ListHeaderComponent={
              <ThemedView style={styles.statsRow}>
                <StatChip value={fmt(classAccuracy)} label="class accuracy" />
                <StatChip value={String(totalAnswers)} label="answers" />
                <StatChip value={String(students.length)} label="students" />
              </ThemedView>
            }
            ListFooterComponent={
              <ThemedView style={styles.studentsHead}>
                <ThemedText type="smallBold">Students</ThemedText>
                {students.map((s, i) => {
                  const pct = s.avg_accuracy * 100;
                  return (
                    <ThemedView key={s.id} type="backgroundElement" style={styles.studentRow}>
                      <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                        <Text style={styles.avatarText}>{initials(s.name)}</Text>
                      </View>
                      <ThemedView style={styles.studentBody}>
                        <ThemedText>{s.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {s.questions_answered} answers · rank #{i + 1}
                        </ThemedText>
                      </ThemedView>
                      <View style={[styles.accuracyChip, { backgroundColor: accuracyColor(pct) }]}>
                        <Text style={styles.accuracyChipText}>{fmt(s.avg_accuracy)}</Text>
                      </View>
                    </ThemedView>
                  );
                })}
                {students.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', padding: 16 }}>
                    No answers yet today — ask students to start their revision! 🚀
                  </ThemedText>
                )}
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
  backText: { color: Accents.primary, fontSize: 20 },
  header: { fontSize: 28 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statChip: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 12, gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sectionRow: { borderRadius: 14, padding: 14, marginTop: 10, gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  sectionName: { flexShrink: 1 },
  pctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontWeight: '800', fontSize: 14, overflow: 'hidden' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#333' },
  barFill: { height: 8, borderRadius: 4 },
  studentsHead: { marginTop: 20, gap: 8 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  studentBody: { flex: 1, gap: 2 },
  accuracyChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  accuracyChipText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
