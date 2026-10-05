import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listStudents, resetStudentPassword } from '@/api/students';
import { BackButton } from '@/components/back-button';
import { ErrorState } from '@/components/error-state';
import { ResetConfirmSheet, ResetResultSheet } from '@/components/students/reset-sheets';
import { GroupHeader, StudentListSkeleton, StudentRow } from '@/components/students/student-row';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { copyText } from '@/lib/copy-text';
import { toFriendlyError } from '@/lib/friendly-error';
import { buildStudentItems, classOptions, localIsoDate, studentCountLabel } from '@/lib/students';
import type { StudentDto } from '@stemreach/core';

const SEARCH_DEBOUNCE_MS = 300;

export default function StudentsScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [knownClasses, setKnownClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reqId = useRef(0);

  const [confirmFor, setConfirmFor] = useState<StudentDto | null>(null);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const today = useMemo(() => localIsoDate(new Date()), []);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(
    (isRefresh = false) => {
      const id = ++reqId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      listStudents({ q: query || undefined, classSection: classFilter ?? undefined })
        .then((res) => {
          if (id !== reqId.current) return; // a newer request superseded this one
          setStudents(res.students);
          // Chips come from rosters fetched without a class filter, accumulated so they never vanish.
          if (!classFilter) setKnownClasses((prev) => classOptions([...prev, ...res.students.map((s) => s.class_section)]));
        })
        .catch((e) => {
          if (id === reqId.current) setError(toFriendlyError(e, 'Could not load your students.'));
        })
        .finally(() => {
          if (id !== reqId.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [query, classFilter],
  );

  useEffect(() => load(), [load]);

  const runReset = async (student: StudentDto, custom?: string) => {
    setResetting(true);
    try {
      const res = await resetStudentPassword(student.id, custom);
      setConfirmFor(null);
      setCopied(false);
      setResult({ name: student.full_name, password: res.temporary_password });
    } catch (e) {
      setConfirmFor(null);
      showToast(toFriendlyError(e, "Couldn't reset the password. Please try again."), 'error');
    } finally {
      setResetting(false);
    }
  };

  const closeResult = () => {
    setResult(null); // drops the password from memory; it cannot be shown again
    setCopied(false);
  };

  const onCopy = async () => {
    if (!result) return;
    const outcome = await copyText(result.password);
    if (outcome === 'copied') {
      setCopied(true);
      showToast('Password copied');
    } else if (outcome === 'failed') {
      showToast('Could not copy. Select the password and copy it by hand.', 'error');
    }
  };

  const items = useMemo(() => buildStudentItems(students, classFilter === null && !query), [students, classFilter, query]);
  const filtered = Boolean(query || classFilter);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(teacher)" />
          <Heading className="text-2xl flex-1" style={Type.heading} accessibilityRole="header">
            Students
          </Heading>
          {!loading && !error ? (
            <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
              <UIText className="text-xs text-muted-foreground" style={Type.bodyBold} accessibilityLiveRegion="polite">
                {studentCountLabel(students.length)}
              </UIText>
            </View>
          ) : null}
        </View>

        <View style={styles.filters}>
          <Input className="border border-border rounded-xl bg-card min-h-11 items-center pl-3">
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <InputField
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by name"
              accessibilityLabel="Search students by name"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="px-2 py-3 text-base flex-1"
              style={{ color: theme.text, fontFamily: Fonts.sans }}
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </Input>

          {knownClasses.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup" accessibilityLabel="Filter by class">
              {[null, ...knownClasses].map((c) => {
                const active = classFilter === c;
                return (
                  <Pressable
                    key={c ?? 'all'}
                    onPress={() => setClassFilter(c)}
                    accessibilityRole="radio"
                    accessibilityLabel={c ? `Class ${c}` : 'All classes'}
                    accessibilityState={{ checked: active }}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? Accents.primary : theme.backgroundElement, borderColor: active ? Accents.primary : Accents.border },
                    ]}
                  >
                    <UIText style={[Type.bodyBold, { color: active ? onAccent(Accents.primary) : theme.text, fontSize: 14 }]}>{c ?? 'All'}</UIText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {loading ? (
          <View style={styles.list}>
            <StudentListSkeleton />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.list, items.length === 0 && { flexGrow: 1 }]}
            ListEmptyComponent={
              <Box className="flex-1 items-center justify-center gap-2 p-6">
                <Ionicons name={filtered ? 'search-outline' : 'people-outline'} size={40} color={theme.textSecondary} accessible={false} />
                <UIText className="text-center text-foreground" style={Type.bodySemi}>
                  {filtered ? 'No students match' : 'No students yet'}
                </UIText>
                <UIText className="text-center text-muted-foreground text-sm" style={Type.body}>
                  {filtered ? 'Try a different name or class.' : 'Students appear here once they sign up.'}
                </UIText>
              </Box>
            }
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <GroupHeader title={item.title} count={item.count} />
              ) : (
                <StudentRow student={item.student} today={today} onReset={setConfirmFor} />
              )
            }
          />
        )}
      </SafeAreaView>

      <ResetConfirmSheet
        student={confirmFor}
        resetting={resetting}
        onSubmit={(student, custom) => void runReset(student, custom)}
        onCancel={() => setConfirmFor(null)}
      />

      <ResetResultSheet result={result} copied={copied} onCopy={() => void onCopy()} onDone={closeResult} />
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countPill: { paddingHorizontal: 12, minHeight: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 10 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8, paddingBottom: 40 },
});
