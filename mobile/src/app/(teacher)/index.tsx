import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activate, getActivations, getSyllabus } from '@/api/client';
import { getStudentSections } from '@/api/students';
import { ErrorState } from '@/components/error-state';
import { ActionBar } from '@/components/teacher-home/action-bar';
import { ChapterSection } from '@/components/teacher-home/chapter-section';
import { ClassOverview } from '@/components/teacher-home/class-overview';
import { HomeSkeleton } from '@/components/teacher-home/home-skeleton';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from '@/components/ui/alert-dialog';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { useToast } from '@/components/toast';
import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import {
  buildGroups,
  dateFromIso,
  defaultCollapsed,
  headerDate,
  liveQuestions,
  plural,
  reconcileSelection,
  sameSelection,
  selectionTotals,
  statusLine,
  toggleChapterSelection,
  type ChapterGroup,
} from '@/lib/teacher-home';
import type { SyllabusResponse } from '@stemreach/core';

export default function ActivateScreen() {
  const { showToast } = useToast();
  const theme = useTheme();
  const router = useRouter();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [todaySections, setTodaySections] = useState<Set<string>>(new Set());
  const [todayQuestions, setTodayQuestions] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** The school-calendar day the API resolved for "today" (null until loaded: header falls back to the device day). */
  const [schoolDate, setSchoolDate] = useState<string | null>(null);
  /** Available class sections (cohorts) for the activation target picker. */
  const [sections, setSections] = useState<string[]>([]);
  /** Which cohorts will receive the activation. Empty = all students. */
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const activeRef = useRef(todaySections);
  activeRef.current = todaySections;
  const loadedOnce = useRef(false);

  /**
   * (Re)loads the syllabus + today's activation. Runs on every focus so a topic added or a question published in
   * another tab shows here; unsaved selection edits survive a background reload (see `reconcileSelection`).
   */
  const load = useCallback((isRefresh = false) => {
    if (!loadedOnce.current || isRefresh) setError(null);
    if (isRefresh) setRefreshing(true);
    Promise.all([getSyllabus(), getActivations(), getStudentSections()])
      .then(([s, act, secs]) => {
        const active = new Set(act.sections.map((x) => x.id));
        const existing = new Set(s.chapters.flatMap((c) => c.sections.map((x) => x.id)));
        setSelected(
          loadedOnce.current && !isRefresh
            ? reconcileSelection(selectedRef.current, activeRef.current, active, existing)
            : new Set(active),
        );
        loadedOnce.current = true;
        setSyllabus(s);
        setTodaySections(active);
        setTodayQuestions(act.sections.reduce((n, x) => n + x.question_count, 0));
        setSchoolDate(act.date);
        setSections(secs.sections);
        if (!loadedOnce.current || isRefresh) setSelectedCohorts(act.target_cohorts ?? []);
        setError(null);
      })
      .catch((e) => {
        // A failed background refresh keeps the data on screen.
        if (!loadedOnce.current || isRefresh) setError(toFriendlyError(e, 'Could not load the syllabus.'));
      })
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleChapter = useCallback((group: ChapterGroup) => {
    setSelected((prev) => toggleChapterSelection(group, prev));
  }, []);

  const groups = useMemo(() => buildGroups(syllabus), [syllabus]);
  const totals = selectionTotals(groups, selected);
  const hasActivation = todaySections.size > 0;
  const isChanged = !sameSelection(selected, todaySections);
  const collapse = defaultCollapsed(groups.length);

  const doSave = async () => {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const res = await activate({
        section_ids: [...selected],
        target_cohorts: selectedCohorts.length > 0 ? selectedCohorts : undefined,
      });
      const total = res.sections.reduce((n, s) => n + s.question_count, 0);
      showToast(`Revision activated for ${res.date} — ${plural(res.sections.length, 'topic')}, ${liveQuestions(total)}!`);
      setTodaySections(new Set(res.sections.map((s) => s.id)));
      setTodayQuestions(total);
    } catch (e) {
      showToast(toFriendlyError(e, 'Activation failed. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (selected.size === 0) {
      showToast('Select at least one topic', 'info');
      return;
    }
    if (!isChanged) return;
    setConfirmOpen(true);
  };

  const loading = syllabus == null && !error;
  const empty = syllabus != null && groups.every((g) => g.topics.length === 0);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Accents.primary} />}
        >
          <View style={styles.header}>
            <Text style={[styles.date, { color: theme.textSecondary }]}>{headerDate(schoolDate ? dateFromIso(schoolDate) : new Date())}</Text>
            <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
              Today&apos;s revision
            </Text>
            {syllabus && (
              <View style={styles.statusRow} accessibilityLiveRegion="polite">
                <Ionicons
                  name={hasActivation ? 'checkmark-circle-outline' : 'radio-button-off'}
                  size={16}
                  color={hasActivation ? theme.successText : theme.textSecondary}
                  accessible={false}
                />
                <Text style={[styles.status, { color: hasActivation ? theme.successText : theme.textSecondary }]}>
                  {statusLine(todaySections.size, todayQuestions)}
                </Text>
              </View>
            )}
          </View>

          {error && <ErrorState message={error} onRetry={() => load()} />}
          {loading && <HomeSkeleton />}

          {empty && (
            <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="library-outline" size={28} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No topics yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Add a chapter and its topics, then come back to activate today&apos;s revision.</Text>
              <Button
                variant="default"
                className="min-h-11 rounded-xl"
                onPress={() => router.push('/(teacher)/catalog' as Href)}
                accessibilityRole="link"
                accessibilityLabel="Manage topics"
              >
                <ButtonText style={Type.bodyBold}>Manage topics</ButtonText>
              </Button>
            </View>
          )}

          {!empty &&
            groups.map((g) => (
              <ChapterSection
                key={g.id}
                group={g}
                selected={selected}
                todaySections={todaySections}
                defaultCollapsed={collapse}
                onToggleTopic={toggle}
                onToggleChapter={toggleChapter}
              />
            ))}

          {sections.length > 0 && !empty && (
            <View style={[styles.cohortSection, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.cohortLabel, { color: theme.textSecondary }]}>Who sees this?</Text>
              <View style={styles.cohortChips} accessibilityRole="radiogroup" accessibilityLabel="Target students">
                <Pressable
                  style={[styles.cohortChip, { borderColor: Accents.border }, selectedCohorts.length === 0 && { backgroundColor: Accents.primary, borderColor: Accents.primary }]}
                  onPress={() => setSelectedCohorts([])}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedCohorts.length === 0 }}
                  accessibilityLabel="All students"
                >
                  <Text style={[styles.cohortChipText, { color: selectedCohorts.length === 0 ? '#fff' : theme.text }]}>All students</Text>
                </Pressable>
                {sections.map((s) => {
                  const active = selectedCohorts.includes(s);
                  return (
                    <Pressable
                      key={s}
                      style={[styles.cohortChip, { borderColor: Accents.border }, active && { backgroundColor: Accents.primary, borderColor: Accents.primary }]}
                      onPress={() => setSelectedCohorts((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={`Target ${s}`}
                    >
                      <Text style={[styles.cohortChipText, { color: active ? '#fff' : theme.text }]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <ClassOverview />
        </ScrollView>

        <ActionBar topics={totals.topics} questions={totals.questions} hasActivation={hasActivation} changed={isChanged} busy={busy} onPress={save} />
      </SafeAreaView>

      <AlertDialog isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <AlertDialogBackdrop onPress={() => setConfirmOpen(false)} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading className="text-xl" style={Type.heading}>
              {hasActivation ? 'Update today’s revision?' : 'Confirm activation'}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <UIText className="text-sm text-muted-foreground" style={Type.body}>
              {selectedCohorts.length > 0
                ? `This sets today's revision to ${plural(totals.topics, 'topic')} (${liveQuestions(totals.questions)}) for ${selectedCohorts.join(', ')}. Their feeds will update immediately.`
                : `This sets today's revision to ${plural(totals.topics, 'topic')} (${liveQuestions(totals.questions)}). All students' feeds will update immediately.`}
            </UIText>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button variant="outline" className="min-h-11 rounded-xl" onPress={() => setConfirmOpen(false)}>
              <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
            </Button>
            <Button variant="default" className="min-h-11 rounded-xl" onPress={doSave} disabled={busy} accessibilityState={{ busy, disabled: busy }}>
              <ButtonText style={Type.bodyBold}>{hasActivation ? 'Yes, update' : 'Yes, activate'}</ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  header: { gap: 2, marginBottom: 2 },
  title: { ...Type.heading, fontSize: 28, lineHeight: 34 },
  date: { ...Type.bodySemi, fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  status: { ...Type.bodyBold, fontSize: 14 },
  empty: { alignItems: 'center', gap: 8, borderRadius: 16, padding: 24 },
  emptyTitle: { ...Type.heading, fontSize: 18 },
  emptyBody: { ...Type.body, fontSize: 14, textAlign: 'center', marginBottom: 6 },
  cohortSection: { borderRadius: 14, padding: 14, gap: 10 },
  cohortLabel: { ...Type.bodyBold, fontSize: 13 },
  cohortChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cohortChip: { borderRadius: 99, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  cohortChipText: { ...Type.bodyBold, fontSize: 13 },
});
