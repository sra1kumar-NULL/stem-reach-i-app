import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getParticipation } from '@/api/client';
import { BackButton } from '@/components/back-button';
import { ErrorState } from '@/components/error-state';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import type { ParticipationReport } from '@stemreach/core';

const AVATAR_COLORS = [Nord.nord15, Nord.nord7, Nord.nord12, Nord.nord10, Nord.nord13, Nord.nord11];

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
  const theme = useTheme();
  const [report, setReport] = useState<ParticipationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (refreshing = false) => {
      if (refreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);
      // No date: the API resolves "today" in the school timezone.
      getParticipation()
        .then(setReport)
        .catch((e) => setError(toFriendlyError(e, 'Could not load participation.')))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [],
  );

  useFocusEffect(useCallback(() => load(), [load]));

  const rows: Row[] = [
    ...(report?.done ?? []).map((s) => ({ id: s.id, name: s.name, done: true, completed: s.completed, answered: s.answered })),
    ...(report?.pending ?? []).map((s) => ({ id: s.id, name: s.name, done: false, completed: false, answered: 0 })),
  ];

  const completedCount = report?.done.filter((s) => s.completed).length ?? 0;

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(teacher)" />
          <Heading className="text-2xl" style={Type.heading}>
            Participation
          </Heading>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Accents.primary} />}
            renderItem={({ item, index }) => {
              const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
              const chipBg = !item.done ? Nord.nord2 : item.completed ? Accents.success : Accents.warn;
              const chipFg = onAccent(chipBg);
              return (
                <Box className={`bg-card flex-row items-center gap-3 rounded-2xl p-3 ${!item.done ? 'opacity-70' : ''}`}>
                  <Avatar className="rounded-full" style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <AvatarFallbackText className="font-extrabold" style={[styles.avatarText, { color: onAccent(avatarColor) }]}>
                      {initials(item.name)}
                    </AvatarFallbackText>
                  </Avatar>
                  <Box className="flex-1 gap-0.5">
                    <UIText className="text-foreground" style={Type.bodySemi}>
                      {item.name}
                    </UIText>
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {item.done ? `${item.answered} answers` : 'not started yet'}
                    </UIText>
                  </Box>
                  <View style={[styles.statusChip, { backgroundColor: chipBg }]}>
                    <Ionicons name={!item.done ? 'time-outline' : item.completed ? 'checkmark-circle' : 'play-circle'} size={12} color={chipFg} />
                    <Text style={[styles.statusText, { color: chipFg }]}>{!item.done ? 'pending' : item.completed ? 'done' : 'in progress'}</Text>
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
  statusText: { fontWeight: '800', fontSize: 12 },
});