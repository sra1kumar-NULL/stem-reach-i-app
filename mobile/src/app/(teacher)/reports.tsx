import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPerformance, getSchoolToday } from '@/api/reports';
import { ErrorState } from '@/components/error-state';
import { FilterChip } from '@/components/teacher-home/filter-chip';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { AnimatedBar } from '@/components/ui/animated-bar';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { addDays } from '@/lib/sm2';
import { AVATAR_FG, avatarColor, classAccuracy as classAcc, pctOrDash } from '@/lib/reports';
import type { PerformanceReport } from '@stemreach/core';
import { initials } from '@/lib/profile';

type RangeKey = 'today' | '7d' | '30d';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

/** Range ending on the school-calendar day (device day if the API can't say). */
async function rangeParams(key: RangeKey): Promise<{ from?: string; to?: string }> {
  const to = await getSchoolToday();
  if (key === 'today') return { from: to, to };
  return { from: addDays(to, key === '7d' ? -6 : -29), to };
}

function accuracyColor(pct: number): string {
  if (pct >= 75) return Accents.success;
  if (pct >= 50) return Accents.warn;
  return Accents.danger;
}


export default function ReportsScreen() {
  const [range, setRange] = useState<RangeKey>('today');
  const theme = useTheme();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reqId = useRef(0);

  const load = useCallback((r: RangeKey, refreshing = false) => {
    if (refreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const mine = ++reqId.current;
    rangeParams(r)
      .then(({ from, to }) => getPerformance(from, to))
      .then((rep) => mine === reqId.current && setReport(rep))
      .catch((e) => mine === reqId.current && setError(toFriendlyError(e, 'Could not load the performance report.')))
      .finally(() => {
        if (mine !== reqId.current) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useFocusEffect(useCallback(() => load(range), [load, range]));

  // Students who answered, best first; the rest follow alphabetically with "-" instead of a fake 0%.
  const students = [...(report?.per_student ?? [])].sort(
    (a, b) => Number(b.questions_answered > 0) - Number(a.questions_answered > 0) || b.avg_accuracy - a.avg_accuracy || a.name.localeCompare(b.name),
  );
  const { value: classAccuracy, answered: totalAnswers } = classAcc(students);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        {/* Tab root: no Back link. */}
        <View style={styles.headerRow}>
          <Heading style={[Type.heading, styles.title]} accessibilityRole="header">
            Performance
          </Heading>
        </View>

        <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Time range">
          {RANGES.map(({ key, label }) => (
            <FilterChip key={key} label={label} selected={key === range} onPress={() => setRange(key)} />
          ))}
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
                        <Text style={[styles.pctBadgeText, { color: onAccent(badgeBg) }]}>{pctOrDash(item.accuracy, item.attempts)}</Text>
                      </View>
                      <UIText className="text-sm font-bold text-foreground flex-1" style={Type.bodyBold}>
                        {item.section_no} — {item.name}
                      </UIText>
                    </View>
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {item.attempts} attempts
                    </UIText>
                  </View>
                  <AnimatedBar pct={pct / 100} color={color} accessibilityLabel={`${item.section_no} — ${item.name}: ${Math.round(pct)}% accuracy`} />
                </Box>
              );
            }}
            ListHeaderComponent={
              <View style={styles.statsRow}>
                {[
                  { value: pctOrDash(classAccuracy, totalAnswers), label: 'class accuracy' },
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
                  const answered = s.questions_answered > 0;
                  const accColor = answered ? accuracyColor(s.avg_accuracy * 100) : Nord.nord2;
                  const avColor = avatarColor(s.id);
                  return (
                    <Box key={s.id} className="bg-card flex-row items-center gap-3 rounded-2xl p-3">
                      <Avatar className="rounded-full" style={[styles.avatar, { backgroundColor: avColor }]}>
                        <AvatarFallbackText className="font-extrabold" style={[styles.avatarText, { color: AVATAR_FG }]}>
                          {initials(s.name)}
                        </AvatarFallbackText>
                      </Avatar>
                      <Box className="flex-1 gap-0.5">
                        <UIText className="text-foreground" style={Type.bodySemi}>
                          {s.name}
                        </UIText>
                        <UIText className="text-xs text-muted-foreground" style={Type.body}>
                          {s.questions_answered} answers{answered ? ` · rank #${i + 1}` : ''}
                        </UIText>
                      </Box>
                      <View style={[styles.accuracyChip, { backgroundColor: accColor }]}>
                        <Text style={[styles.accuracyChipText, { color: onAccent(accColor) }]}>{pctOrDash(s.avg_accuracy, s.questions_answered)}</Text>
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
            ListEmptyComponent={
              <UIText className="text-sm text-muted-foreground text-center p-4" style={Type.body}>
                No answers in this range yet
              </UIText>
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
  title: { fontSize: 28, lineHeight: 34 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statValue: { ...Type.headingBold, fontSize: 22 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  pctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  pctBadgeText: { ...Type.headingBold, fontSize: 14 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Accents.track },
  barFill: { height: 8, borderRadius: 4 },
  avatar: {},
  avatarText: { fontSize: 15 },
  accuracyChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  accuracyChipText: { ...Type.headingBold, fontSize: 13 },
});