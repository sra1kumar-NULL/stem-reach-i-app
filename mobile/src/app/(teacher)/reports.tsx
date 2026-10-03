import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPerformance } from '@/api/client';
import { BackButton } from '@/components/back-button';
import { ErrorState } from '@/components/error-state';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { addDays, localDateString } from '@/lib/sm2';
import type { PerformanceReport } from '@stemreach/core';
import { initials } from '@/lib/profile';

const AVATAR_COLORS = [Nord.nord15, Nord.nord7, Nord.nord12, Nord.nord10, Nord.nord13, Nord.nord11];

type RangeKey = 'today' | '7d' | '30d';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

/** Local-calendar range (toISOString was the UTC day — off by one near midnight in IST). */
function rangeParams(key: RangeKey): { from?: string; to?: string } {
  const to = localDateString();
  if (key === 'today') return { from: to, to };
  return { from: addDays(to, key === '7d' ? -6 : -29), to };
}

function accuracyColor(pct: number): string {
  if (pct >= 75) return Accents.success;
  if (pct >= 50) return Accents.warn;
  return Accents.danger;
}

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const width = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      Animated.spring(width, { toValue: Math.max(0, Math.min(1, pct)), useNativeDriver: false, friction: 8, tension: 40 }).start();
    }, [width, pct]),
  );
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[styles.barFill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color }]}
      />
    </View>
  );
}

export default function ReportsScreen() {
  const [range, setRange] = useState<RangeKey>('today');
  const theme = useTheme();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((r: RangeKey, refreshing = false) => {
    if (refreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const { from, to } = rangeParams(r);
    getPerformance(from, to)
      .then(setReport)
      .catch((e) => setError(toFriendlyError(e, 'Could not load the performance report.')))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useFocusEffect(useCallback(() => load(range), [load, range]));

  const fmt = (n: number) => `${Math.round(n * 100)}%`;
  const students = [...(report?.per_student ?? [])].sort((a, b) => b.avg_accuracy - a.avg_accuracy);
  const classAccuracy = students.length > 0 ? students.reduce((n, s) => n + s.avg_accuracy, 0) / students.length : 0;
  const totalAnswers = students.reduce((n, s) => n + s.questions_answered, 0);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(teacher)" />
          <Heading className="text-2xl" style={Type.heading}>
            Performance
          </Heading>
        </View>

        <View style={styles.chipRow}>
          {RANGES.map(({ key, label }) => {
            const active = key === range;
            return (
              <Pressable
                key={key}
                onPress={() => setRange(key)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text style={[styles.chipLabel, { color: active ? onAccent(Accents.primary) : theme.primaryText }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(range)} />
        ) : (
          <FlatList
            data={report?.per_section ?? []}
            keyExtractor={(s) => s.section_id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(range, true)} tintColor={Accents.primary} />}
            renderItem={({ item }) => {
              const pct = item.attempts > 0 ? item.accuracy * 100 : 0;
              const color = item.attempts > 0 ? accuracyColor(pct) : Accents.border;
              const badgeBg = item.attempts > 0 ? color : Nord.nord2;
              return (
                <Box className="bg-card rounded-2xl p-3.5 mt-2.5 gap-2.5">
                  <View style={styles.sectionHead}>
                    <View style={styles.sectionTitleWrap}>
                      <View style={[styles.pctBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.pctBadgeText, { color: onAccent(badgeBg) }]}>{item.attempts > 0 ? fmt(item.accuracy) : '—'}</Text>
                      </View>
                      <UIText className="text-sm font-bold text-foreground flex-1" style={Type.bodyBold}>
                        {item.section_no} — {item.name}
                      </UIText>
                    </View>
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {item.attempts} attempts
                    </UIText>
                  </View>
                  <AnimatedBar pct={pct} color={color} />
                </Box>
              );
            }}
            ListHeaderComponent={
              <View style={styles.statsRow}>
                {[
                  { value: fmt(classAccuracy), label: 'class accuracy' },
                  { value: String(totalAnswers), label: 'answers' },
                  { value: String(students.length), label: 'students' },
                ].map((chip) => (
                  <Box key={chip.label} className="bg-card flex-1 items-center rounded-2xl py-3 gap-0.5">
                    <Text style={[styles.statValue, { color: theme.primaryText }]}>{chip.value}</Text>
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {chip.label}
                    </UIText>
                  </Box>
                ))}
              </View>
            }
            ListFooterComponent={
              <Box className="mt-5 gap-2">
                <UIText className="text-base font-bold text-foreground" style={Type.bodyBold}>
                  Students
                </UIText>
                {students.map((s, i) => {
                  const pct = s.avg_accuracy * 100;
                  const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  const accColor = accuracyColor(pct);
                  return (
                    <Box key={s.id} className="bg-card flex-row items-center gap-3 rounded-2xl p-3">
                      <Avatar className="rounded-full" style={[styles.avatar, { backgroundColor: avatarColor }]}>
                        <AvatarFallbackText className="font-extrabold" style={[styles.avatarText, { color: onAccent(avatarColor) }]}>
                          {initials(s.name)}
                        </AvatarFallbackText>
                      </Avatar>
                      <Box className="flex-1 gap-0.5">
                        <UIText className="text-foreground" style={Type.bodySemi}>
                          {s.name}
                        </UIText>
                        <UIText className="text-xs text-muted-foreground" style={Type.body}>
                          {s.questions_answered} answers · rank #{i + 1}
                        </UIText>
                      </Box>
                      <View style={[styles.accuracyChip, { backgroundColor: accColor }]}>
                        <Text style={[styles.accuracyChipText, { color: onAccent(accColor) }]}>{fmt(s.avg_accuracy)}</Text>
                      </View>
                    </Box>
                  );
                })}
                {students.length === 0 && (
                  <UIText className="text-sm text-muted-foreground text-center p-4" style={Type.body}>
                    No answers in this range yet — ask students to start their revision! 🚀
                  </UIText>
                )}
              </Box>
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: Accents.primary, borderColor: Accents.primary },
  chipLabel: { fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statValue: { fontSize: 22, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  pctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  pctBadgeText: { fontWeight: '800', fontSize: 14 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track },
  barFill: { height: 8, borderRadius: 4 },
  avatar: {},
  avatarText: { fontSize: 15 },
  accuracyChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  accuracyChipText: { fontWeight: '800', fontSize: 13 },
});