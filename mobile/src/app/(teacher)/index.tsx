import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activate, getActivations, getSyllabus } from '@/api/client';
import { ConfirmSheet } from '@/components/confirm-sheet';
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
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/toast';
import { Accents, Nord, Type } from '@/constants/theme';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import type { SyllabusResponse } from '@stemreach/core';

interface Row {
  id: string;
  label: string;
  count: number;
  chapter: string;
}

export default function ActivateScreen() {
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();
  const { showToast } = useToast();
  const theme = useTheme();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [todaySections, setTodaySections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([getSyllabus(), getActivations()])
      .then(([s, act]) => {
        setSyllabus(s);
        const active = new Set(act.sections.map((x) => x.id));
        setTodaySections(active);
        setSelected(new Set(active));
      })
      .catch((e) => setError(toFriendlyError(e, 'Could not load the syllabus.')));
  }, []);

  useEffect(load, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChapter = (chapterId: string) => {
    const sectionIds = (syllabus?.chapters ?? []).find((ch) => ch.id === chapterId)?.sections.map((s) => s.id) ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = sectionIds.every((id) => next.has(id));
      for (const id of sectionIds) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const rows: Row[] = [];
  for (const ch of syllabus?.chapters ?? []) {
    for (const s of ch.sections) {
      rows.push({ id: s.id, label: s.section_no, count: s.enabled_question_count, chapter: ch.name });
    }
  }

  const selectedQuestionCount = rows.filter((r) => selected.has(r.id)).reduce((n, r) => n + r.count, 0);
  const isChanged =
    [...selected].sort().join(',') !==
    [...todaySections].sort().join(',');

  const doSave = async () => {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const res = await activate({ section_ids: [...selected] });
      const total = res.sections.reduce((n, s) => n + s.question_count, 0);
      showToast(`Revision activated for ${res.date} — ${res.sections.length} section(s), ${total} questions!`);
      setTodaySections(new Set(res.sections.map((s) => s.id)));
    } catch (e) {
      showToast(toFriendlyError(e, 'Activation failed. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (selected.size === 0) {
      showToast('Select at least one section', 'info');
      return;
    }
    if (isChanged) setConfirmOpen(true);
    else doSave();
  };

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <Heading className="text-2xl" style={Type.heading}>
            Today&apos;s Revision
          </Heading>
          <View style={styles.headerActions}>
            <ThemeToggle />
            <Pressable
              onPress={openConfirm}
              style={({ pressed }) => [styles.signoutBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={14} color={theme.text} />
              <Text style={[styles.signoutText, { color: theme.text }]}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          Mark the sections you taught today, then activate. Students&apos; feeds update instantly. ✨
        </UIText>

        {error && (
          <Box className="bg-danger-soft rounded-xl p-3 gap-2">
            <UIText className="text-sm text-foreground" style={Type.body}>
              {error}
            </UIText>
            <Button variant="default" className="min-h-11 self-start rounded-lg" onPress={load}>
              <ButtonText style={Type.bodyBold}>Retry</ButtonText>
            </Button>
          </Box>
        )}

        {syllabus == null && !error ? (
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={syllabus?.chapters ?? []}
            keyExtractor={(ch) => ch.id}
            renderItem={({ item: chapter }) => {
              const allOn = chapter.sections.every((s) => selected.has(s.id));
              const someOn = chapter.sections.some((s) => selected.has(s.id));
              return (
                <Box className="mb-2">
                  <Pressable
                    onPress={() => toggleChapter(chapter.id)}
                    style={({ pressed }) => [styles.chapterHead, pressed && { opacity: 0.7 }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allOn ? true : someOn ? 'mixed' : false }}
                    accessibilityLabel={`${chapter.name}, all sections`}
                  >
                    <View style={[styles.dot, { backgroundColor: allOn ? Accents.success : someOn ? Accents.warn : Accents.border }]} />
                    <UIText className="flex-1 text-base font-bold text-foreground" style={Type.bodyBold}>
                      {chapter.name}
                    </UIText>
                    <Text style={[styles.check, { color: allOn ? theme.successText : Accents.border }]}>{allOn ? '✓' : '—'}</Text>
                  </Pressable>
                  <Box className="gap-2 pl-4">
                    {chapter.sections.map((s) => {
                      const isOn = selected.has(s.id);
                      const wasToday = todaySections.has(s.id);
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => toggle(s.id)}
                          style={({ pressed }) => [styles.row, isOn && styles.rowOn, pressed && { opacity: 0.8 }]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isOn }}
                          accessibilityLabel={`${chapter.name} — ${s.section_no}, ${s.enabled_question_count} questions`}
                        >
                          <View style={[styles.dot, { backgroundColor: isOn ? Accents.success : Accents.border }]} />
                          <Box className="flex-1 gap-0.5">
                            <UIText className="text-foreground" style={Type.bodySemi}>
                              {chapter.name} — {s.section_no}
                            </UIText>
                            <UIText className="text-xs text-muted-foreground" style={Type.body}>
                              {s.enabled_question_count} questions{wasToday && !isOn ? ' · was active today' : ''}
                            </UIText>
                          </Box>
                          <Text style={[styles.check, { color: theme.successText, opacity: isOn ? 1 : 0 }]}>✓</Text>
                        </Pressable>
                      );
                    })}
                  </Box>
                </Box>
              );
            }}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}

        {/* Opaque, in-flow footer: rows used to scroll visibly under its text and buttons. */}
        <Box className="gap-2 border-t border-border bg-background pt-2" style={styles.footer}>
          <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold}>
            {selected.size} selected · {selectedQuestionCount} questions
          </UIText>
          <Button
            variant="default"
            size="lg"
            className={`rounded-2xl ${busy || selected.size === 0 ? 'opacity-50' : ''}`}
            onPress={save}
            disabled={busy || selected.size === 0}
          >
            {busy ? (
              <ActivityIndicator color={Nord.nord6} />
            ) : (
              <ButtonText style={Type.bodyBold}>🚀 Activate Revision</ButtonText>
            )}
          </Button>
          <View style={styles.navRow}>
            <Link href="/(teacher)/participation" style={styles.navLink}>
              <Ionicons name="people-outline" size={16} color={Accents.primary} />
              <UIText className="text-primary-text font-bold" style={Type.bodyBold}>
                Participation
              </UIText>
            </Link>
            <Link href="/(teacher)/reports" style={styles.navLink}>
              <Ionicons name="bar-chart-outline" size={16} color={Accents.primary} />
              <UIText className="text-primary-text font-bold" style={Type.bodyBold}>
                Performance
              </UIText>
            </Link>
          </View>
        </Box>
      </SafeAreaView>

      <ConfirmSheet
        visible={confirmOut}
        title="Sign out?"
        message="You'll need to sign in again to continue."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={confirmSignOut}
        onCancel={closeConfirm}
      />

      <AlertDialog isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <AlertDialogBackdrop onPress={() => setConfirmOpen(false)} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading className="text-xl" style={Type.heading}>
              Confirm activation
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <UIText className="text-sm text-muted-foreground" style={Type.body}>
              {isChanged
                ? `This changes today's revision to ${selected.size} section(s) (${selectedQuestionCount} questions). Students' feeds will update immediately.`
                : `Today's revision is already set to ${selected.size} section(s).`}
            </UIText>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button variant="outline" className="rounded-xl" onPress={() => setConfirmOpen(false)}>
              <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
            </Button>
            <Button variant="default" className="rounded-xl" onPress={doSave} disabled={busy}>
              <ButtonText style={Type.bodyBold}>Yes, activate</ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signoutBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  signoutText: { fontSize: 13, fontWeight: '600' },
  chapterHead: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Accents.border,
    borderRadius: 14,
    padding: 14,
  },
  rowOn: { borderColor: Accents.success, backgroundColor: Accents.successSoft },
  dot: { width: 10, height: 10, borderRadius: 5 },
  check: { fontSize: 18, fontWeight: '800' },
  footer: { marginHorizontal: -16, paddingHorizontal: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-around' },
  navLink: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
});