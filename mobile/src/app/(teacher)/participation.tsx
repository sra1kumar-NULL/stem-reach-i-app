import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, getActivations } from '@/api/client';
import { getParticipation } from '@/api/reports';
import { BackButton } from '@/components/back-button';
import { ErrorState } from '@/components/error-state';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import type { ParticipationReport } from '@stemreach/core';
import { initials } from '@/lib/profile';
import { formatLongDate } from '@/lib/calendar';
import { AVATAR_FG, avatarColor, participationRows, revisedLabel } from '@/lib/reports';
import { Button, ButtonText } from '@/components/ui/button';

export default function ParticipationScreen() {
  const theme = useTheme();
  const [report, setReport] = useState<ParticipationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** The API answered `no_activation`: nothing was activated for the day (an empty state, not an error). */
  const [noActivation, setNoActivation] = useState(false);
  /** Live questions activated today, for "Revised 8/15" (null when unknown). */
  const [dayTotal, setDayTotal] = useState<number | null>(null);
  const router = useRouter();
  // Optional `?date=YYYY-MM-DD` (from the Calendar day panel); absent = the school's today.
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;

  const load = useCallback(
    (refreshing = false) => {
      if (refreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setNoActivation(false);
      // No date: the API resolves "today" in the school timezone.
      Promise.all([getParticipation(date), getActivations(date).catch(() => null)])
        .then(([rep, act]) => {
          setReport(rep);
          setDayTotal(act ? act.sections.reduce((n, x) => n + x.question_count, 0) : null);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 400 && e.code === 'no_activation') {
            setReport(null);
            setNoActivation(true);
          } else {
            setError(toFriendlyError(e, 'Could not load participation.'));
          }
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [date],
  );

  useFocusEffect(useCallback(() => load(), [load]));

  const rows = report ? participationRows(report) : [];

  const completedCount = report?.done.filter((s) => s.completed).length ?? 0;

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(teacher)" />
          <Heading className="text-2xl" style={Type.heading} accessibilityRole="header">
            Participation
          </Heading>
        </View>
        {date ? (
          <UIText className="text-sm text-muted-foreground" style={Type.body}>
            {formatLongDate(date)}
          </UIText>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : noActivation ? (
          <Box className="items-center gap-3 rounded-2xl bg-card p-6">
            <Ionicons name="calendar-clear-outline" size={28} color={theme.textSecondary} />
            <UIText className="text-center text-foreground" style={Type.bodyBold}>
              Nothing was activated for this day. Activate topics from Today.
            </UIText>
            <Button variant="default" className="min-h-11 rounded-xl" onPress={() => router.push('/(teacher)' as Href)} accessibilityRole="link">
              <ButtonText style={Type.bodyBold}>Go to Today</ButtonText>
            </Button>
          </Box>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Accents.primary} />}
            renderItem={({ item }) => {
              // Pending = outlined chip in secondary text colour (>= 4.5:1 on the card in both themes).
              const chipBg = !item.done ? 'transparent' : item.completed ? Accents.success : Accents.warn;
              const chipFg = !item.done ? theme.textSecondary : onAccent(chipBg);
              const statusLabel = !item.done ? 'pending' : item.completed ? 'done' : 'in progress';
              const revisedText = revisedLabel(item, dayTotal);
              return (
                <Box
                  className="bg-card flex-row items-center gap-3 rounded-2xl p-3"
                  accessible
                  accessibilityLabel={`${item.name}, ${statusLabel}, ${revisedText}`}
                >
                  <Avatar accessible={false} className="rounded-full" style={[styles.avatar, { backgroundColor: avatarColor(item.id) }]}>
                    <AvatarFallbackText className="font-extrabold" style={[styles.avatarText, { color: AVATAR_FG }]}>
                      {initials(item.name)}
                    </AvatarFallbackText>
                  </Avatar>
                  <Box accessible={false} className="flex-1 gap-0.5">
                    <UIText className="text-foreground" style={Type.bodySemi}>
                      {item.name}
                    </UIText>
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {revisedText}
                    </UIText>
                  </Box>
                  <View accessible={false} style={[styles.statusChip, { backgroundColor: chipBg }, !item.done && { borderWidth: 1, borderColor: theme.textSecondary }]}>
                    <Ionicons name={!item.done ? 'time-outline' : item.completed ? 'checkmark-circle' : 'play-circle'} size={14} color={chipFg} />
                    <Text style={[styles.statusText, { color: chipFg }]}>{statusLabel}</Text>
                  </View>
                </Box>
              );
            }}
            ListHeaderComponent={
              <View style={styles.statsRow}>
                {[
                  { value: `${completedCount}/${report?.total_students ?? 0}`, label: 'completed' },
                  { value: String(report?.done.length ?? 0), label: 'started' },
                  { value: String(report?.pending.length ?? 0), label: 'pending' },
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
            contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
          />
        )}
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 12 },
  statValue: { fontSize: 22, fontWeight: '800' },
  avatar: {},
  avatarText: { fontSize: 15 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontWeight: '800', fontSize: 13 },
});