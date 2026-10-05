import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Subject, SyllabusResponse } from '@stemreach/core';

import {
  createChapter,
  createSection,
  deleteChapter,
  deleteSection,
  updateChapter,
  updateSection,
} from '@/api/catalog';
import { ApiError, getSyllabus } from '@/api/client';
import { BackButton } from '@/components/back-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { FormSheet } from '@/components/form-sheet';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { deleteBlockedHint, formatQuestionCounts } from '@/lib/question-editor';
import { syllabusStore } from '@/lib/syllabus-store';

type Chapter = SyllabusResponse['chapters'][number];
type Topic = Chapter['sections'][number];

const SUBJECTS: Subject[] = ['physics', 'chemistry', 'biology', 'general'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Limits mirror CreateChapterRequest / CreateSectionRequest in @stemreach/core. */
const LIMITS = { ncertMin: 1, ncertMax: 999, chapterName: 120, sectionNo: 20, sectionName: 120 } as const;

type FormState =
  | { kind: 'chapter'; chapter: Chapter | null }
  | { kind: 'topic'; chapter: Chapter; topic: Topic | null };

type DeleteTarget = { kind: 'chapter'; chapter: Chapter } | { kind: 'topic'; chapter: Chapter; topic: Topic };

function friendlyCatalogError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.status === 409) {
    if (e.code === 'not_empty') {
      return 'This still has questions or has been used in a daily revision, so it cannot be deleted. Move or archive those first.';
    }
    return e.message || 'That number is already taken.';
  }
  return toFriendlyError(e, fallback);
}

export default function CatalogScreen() {
  const { showToast } = useToast();
  const theme = useTheme();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [del, setDel] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);
  /** Chapter whose topics currently show the move up / down controls. */
  const [reorderFor, setReorderFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSyllabus(await syllabusStore.get(getSyllabus));
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load chapters and topics.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (chapter: Chapter, from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= chapter.sections.length || reordering) return;
    const next = [...chapter.sections];
    [next[from], next[to]] = [next[to], next[from]];
    const previous = syllabus;
    setSyllabus((s) =>
      s ? { chapters: s.chapters.map((c) => (c.id === chapter.id ? { ...c, sections: next } : c)) } : s,
    );
    setReordering(chapter.id);
    try {
      // Sort orders are not exposed by /syllabus, so renumber the whole chapter (1..n) to keep them unique.
      await Promise.all(next.map((t, i) => updateSection(t.id, { sort_order: i + 1 })));
    } catch (e) {
      setSyllabus(previous);
      showToast(friendlyCatalogError(e, 'Could not reorder topics.'), 'error');
      void load();
    } finally {
      setReordering(null);
    }
  };

  const confirmDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      if (del.kind === 'chapter') await deleteChapter(del.chapter.id);
      else await deleteSection(del.topic.id);
      showToast(del.kind === 'chapter' ? 'Chapter deleted.' : 'Topic deleted.');
      setDel(null);
      await load();
    } catch (e) {
      showToast(friendlyCatalogError(e, 'Could not delete. Please try again.'), 'error');
      setDel(null);
    } finally {
      setDeleting(false);
    }
  };

  const chapters = syllabus?.chapters ?? [];

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackButton fallback={'/(teacher)' as Href} />
          <Heading className="text-2xl" style={Type.heading} accessibilityRole="header">
            Chapters and topics
          </Heading>
          <UIText className="text-sm text-muted-foreground" style={Type.body}>
            Organise what students revise. Live questions are published and active, so students can get them. Hidden ones are drafts or archived. A chapter or topic can only be deleted when it is empty.
          </UIText>

          <View style={styles.actionRow}>
            <Button variant="default" className="min-h-11 rounded-2xl" onPress={() => setForm({ kind: 'chapter', chapter: null })}>
              <Ionicons name="add" size={18} color={onAccent(Accents.primary)} />
              <ButtonText style={Type.bodyBold}>Add chapter</ButtonText>
            </Button>
            <Link href={'/(teacher)/import' as Href} asChild>
              <Button variant="outline" className="min-h-11 rounded-2xl" accessibilityRole="link">
                <ButtonText style={Type.bodyBold}>Import / export</ButtonText>
              </Button>
            </Link>
          </View>

          {error && !syllabus ? <ErrorState message={error} onRetry={() => void load()} /> : null}

          {!syllabus && !error ? (
            <View style={{ gap: 12 }} accessibilityLabel="Loading chapters" accessibilityRole="progressbar">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </View>
          ) : null}

          {syllabus && chapters.length === 0 ? (
            <Box className="items-center gap-2 rounded-2xl border border-border p-5">
              <Ionicons name="library-outline" size={32} color={theme.textSecondary} accessible={false} />
              <UIText className="font-bold text-foreground" style={Type.bodyBold}>
                No chapters yet
              </UIText>
              <UIText className="text-center text-sm text-muted-foreground" style={Type.body}>
                Add your first chapter, then add topics inside it.
              </UIText>
            </Box>
          ) : null}

          {chapters.map((ch) => {
            const total = ch.sections.reduce((n, s) => n + s.question_count, 0);
            const live = ch.sections.reduce((n, s) => n + s.enabled_question_count, 0);
            const reorderOn = reorderFor === ch.id;
            return (
              <Box key={ch.id} className="gap-2 rounded-2xl border border-border bg-card p-3" accessibilityLabel={`Chapter ${ch.ncert_no}, ${ch.name}`}>
                <UIText className="text-base font-bold text-foreground" style={Type.bodyBold} accessibilityRole="header">
                  {ch.ncert_no}. {ch.name}
                </UIText>
                <UIText className="text-xs text-muted-foreground" style={Type.body}>
                  {cap(ch.subject)} · {ch.sections.length} {ch.sections.length === 1 ? 'topic' : 'topics'} · {formatQuestionCounts(total, live)}
                </UIText>
                <View style={styles.btnRow}>
                  <SmallButton icon="create-outline" label="Edit" a11y={`Edit chapter ${ch.name}`} onPress={() => setForm({ kind: 'chapter', chapter: ch })} />
                  <SmallButton icon="add" label="Add topic" a11y={`Add a topic to ${ch.name}`} onPress={() => setForm({ kind: 'topic', chapter: ch, topic: null })} />
                  {ch.sections.length > 1 ? (
                    <SmallButton
                      icon={reorderOn ? 'checkmark' : 'swap-vertical-outline'}
                      label={reorderOn ? 'Done' : 'Reorder'}
                      a11y={reorderOn ? `Done reordering topics in ${ch.name}` : `Reorder topics in ${ch.name}`}
                      onPress={() => setReorderFor(reorderOn ? null : ch.id)}
                    />
                  ) : null}
                  <SmallButton
                    icon="trash-outline"
                    label="Delete"
                    a11y={total > 0 ? `Delete chapter ${ch.name} (unavailable, it has ${total} questions)` : `Delete chapter ${ch.name}`}
                    danger
                    disabled={total > 0}
                    onPress={() => setDel({ kind: 'chapter', chapter: ch })}
                  />
                </View>
                {total > 0 ? (
                  <UIText className="text-xs text-muted-foreground" style={Type.body}>
                    {deleteBlockedHint(total)}.
                  </UIText>
                ) : null}

                {ch.sections.length === 0 ? (
                  <UIText className="text-sm text-muted-foreground" style={Type.body}>
                    No topics yet.
                  </UIText>
                ) : (
                  ch.sections.map((s, i) => (
                    <View key={s.id} style={[styles.topic, { borderColor: Accents.border }]}>
                      <UIText className="font-semibold text-foreground" style={Type.bodySemi}>
                        {s.section_no} {s.name}
                      </UIText>
                      <UIText className="text-xs text-muted-foreground" style={Type.body}>
                        {formatQuestionCounts(s.question_count, s.enabled_question_count)}
                      </UIText>
                      <View style={styles.btnRow}>
                        {reorderOn ? (
                          <>
                            <IconButton
                              icon="arrow-up"
                              label={`Move ${s.section_no} ${s.name} up`}
                              disabled={i === 0 || reordering !== null}
                              onPress={() => void move(ch, i, -1)}
                            />
                            <IconButton
                              icon="arrow-down"
                              label={`Move ${s.section_no} ${s.name} down`}
                              disabled={i === ch.sections.length - 1 || reordering !== null}
                              onPress={() => void move(ch, i, 1)}
                            />
                          </>
                        ) : null}
                        <SmallButton icon="create-outline" label="Edit" a11y={`Edit topic ${s.section_no} ${s.name}`} onPress={() => setForm({ kind: 'topic', chapter: ch, topic: s })} />
                        <SmallButton
                          icon="trash-outline"
                          label="Delete"
                          a11y={
                            s.question_count > 0
                              ? `Delete topic ${s.section_no} (unavailable, it has ${s.question_count} questions)`
                              : `Delete topic ${s.section_no} ${s.name}`
                          }
                          danger
                          disabled={s.question_count > 0}
                          onPress={() => setDel({ kind: 'topic', chapter: ch, topic: s })}
                        />
                      </View>
                      {s.question_count > 0 ? (
                        <UIText className="text-xs text-muted-foreground" style={Type.body}>
                          {deleteBlockedHint(s.question_count)}.
                        </UIText>
                      ) : null}
                    </View>
                  ))
                )}
              </Box>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {form?.kind === 'chapter' ? (
        <ChapterForm
          chapter={form.chapter}
          onClose={() => setForm(null)}
          onSaved={async (msg) => {
            setForm(null);
            showToast(msg);
            await load();
          }}
        />
      ) : null}
      {form?.kind === 'topic' ? (
        <TopicForm
          chapter={form.chapter}
          topic={form.topic}
          onClose={() => setForm(null)}
          onSaved={async (msg) => {
            setForm(null);
            showToast(msg);
            await load();
          }}
        />
      ) : null}

      <ConfirmSheet
        visible={del !== null}
        title={del?.kind === 'chapter' ? `Delete "${del.chapter.name}"?` : del ? `Delete topic ${del.topic.section_no}?` : ''}
        message={
          del?.kind === 'chapter'
            ? 'The chapter and its empty topics will be removed. This cannot be undone.'
            : 'This topic will be removed. This cannot be undone.'
        }
        confirmLabel="Delete"
          destructive
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDel(null)}
      />
    </Box>
  );
}

// ── Small controls ───────────────────────────────────────────────────────────

function SmallButton({
  icon,
  label,
  a11y,
  onPress,
  danger,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  a11y: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.dangerText : theme.primaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.smallBtn,
        { borderColor: danger ? Accents.danger : Accents.border, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.smallBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.iconBtn, { borderColor: danger ? Accents.danger : Accents.border, opacity: disabled ? 0.3 : pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={danger ? theme.dangerText : theme.text} />
    </Pressable>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold}>
      {children}
    </UIText>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  maxLength,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <FieldLabel>{label}</FieldLabel>
      <Input className="min-h-11 rounded-xl border border-border bg-background" isInvalid={!!error}>
        <InputField
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          accessibilityLabel={label}
          aria-label={label}
          placeholderTextColor={theme.textSecondary}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className="px-3 py-2 text-base"
          style={{ color: theme.text, fontFamily: Fonts.sans }}
        />
      </Input>
      {error ? (
        <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
          {error}
        </UIText>
      ) : null}
    </View>
  );
}

// ── Forms ────────────────────────────────────────────────────────────────────

function ChapterForm({
  chapter,
  onClose,
  onSaved,
}: {
  chapter: Chapter | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [ncert, setNcert] = useState(chapter ? String(chapter.ncert_no) : '');
  const [name, setName] = useState(chapter?.name ?? '');
  const [subject, setSubject] = useState<Subject>(chapter?.subject ?? 'general');
  const [errors, setErrors] = useState<{ ncert?: string; name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    const n = Number(ncert);
    if (!/^\d+$/.test(ncert.trim()) || n < LIMITS.ncertMin || n > LIMITS.ncertMax) e.ncert = `Enter a whole number from ${LIMITS.ncertMin} to ${LIMITS.ncertMax}.`;
    const trimmed = name.trim();
    if (!trimmed) e.name = 'Enter a chapter name.';
    else if (trimmed.length > LIMITS.chapterName) e.name = `Keep the name under ${LIMITS.chapterName} characters.`;
    setErrors(e);
    if (e.ncert || e.name) return;
    setBusy(true);
    try {
      if (chapter) await updateChapter(chapter.id, { ncert_no: n, name: trimmed, subject });
      else await createChapter({ ncert_no: n, name: trimmed, subject });
      await onSaved(chapter ? 'Chapter updated.' : 'Chapter added.');
    } catch (err) {
      setErrors({ form: friendlyCatalogError(err, 'Could not save the chapter.') });
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible
      title={chapter ? 'Edit chapter' : 'Add chapter'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" className="min-h-11 flex-1 rounded-2xl" onPress={onClose} disabled={busy}>
            <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
          </Button>
          <Button variant="default" className={`min-h-11 flex-1 rounded-2xl ${busy ? 'opacity-50' : ''}`} onPress={() => void submit()} disabled={busy} accessibilityState={{ busy }}>
            {busy ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
            <ButtonText style={Type.bodyBold}>{chapter ? 'Save' : 'Add'}</ButtonText>
          </Button>
        </>
      }
    >
      <TextField label="Chapter number" value={ncert} onChangeText={setNcert} placeholder="e.g. 5" keyboardType="number-pad" maxLength={3} error={errors.ncert} autoFocus />
      <TextField label="Chapter name" value={name} onChangeText={setName} placeholder="e.g. Light and Shadows" maxLength={LIMITS.chapterName + 20} error={errors.name} />
      <View style={{ gap: 6 }}>
        <FieldLabel>Subject</FieldLabel>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {SUBJECTS.map((s) => {
            const on = s === subject;
            return (
              <Pressable
                key={s}
                onPress={() => setSubject(s)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={cap(s)}
                style={[styles.chip, { borderColor: on ? Accents.primary : Accents.border, backgroundColor: on ? Accents.primary : 'transparent' }]}
              >
                <Text style={[styles.chipText, { color: on ? onAccent(Accents.primary) : theme.text }]}>{cap(s)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {errors.form ? (
        <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
          {errors.form}
        </UIText>
      ) : null}
    </FormSheet>
  );
}

function TopicForm({
  chapter,
  topic,
  onClose,
  onSaved,
}: {
  chapter: Chapter;
  topic: Topic | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [no, setNo] = useState(topic?.section_no ?? `${chapter.ncert_no}.${chapter.sections.length + 1}`);
  const [name, setName] = useState(topic?.name ?? '');
  const [errors, setErrors] = useState<{ no?: string; name?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    const n = no.trim();
    const nm = name.trim();
    if (!n) e.no = 'Enter a topic number such as 5.1.';
    else if (n.length > LIMITS.sectionNo) e.no = `Keep it under ${LIMITS.sectionNo} characters.`;
    if (!nm) e.name = 'Enter a topic name.';
    else if (nm.length > LIMITS.sectionName) e.name = `Keep the name under ${LIMITS.sectionName} characters.`;
    setErrors(e);
    if (e.no || e.name) return;
    setBusy(true);
    try {
      if (topic) await updateSection(topic.id, { section_no: n, name: nm });
      else await createSection({ chapter_id: chapter.id, section_no: n, name: nm });
      await onSaved(topic ? 'Topic updated.' : 'Topic added.');
    } catch (err) {
      setErrors({ form: friendlyCatalogError(err, 'Could not save the topic.') });
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible
      title={topic ? 'Edit topic' : `Add topic to ${chapter.name}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" className="min-h-11 flex-1 rounded-2xl" onPress={onClose} disabled={busy}>
            <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
          </Button>
          <Button variant="default" className={`min-h-11 flex-1 rounded-2xl ${busy ? 'opacity-50' : ''}`} onPress={() => void submit()} disabled={busy} accessibilityState={{ busy }}>
            {busy ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
            <ButtonText style={Type.bodyBold}>{topic ? 'Save' : 'Add'}</ButtonText>
          </Button>
        </>
      }
    >
      <TextField label="Topic number" value={no} onChangeText={setNo} placeholder="e.g. 5.1" maxLength={LIMITS.sectionNo + 5} error={errors.no} autoFocus />
      <TextField label="Topic name" value={name} onChangeText={setName} placeholder="e.g. Shadows" maxLength={LIMITS.sectionName + 20} error={errors.name} />
      {errors.form ? (
        <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
          {errors.form}
        </UIText>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  smallBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  smallBtnText: { ...Type.bodyBold, fontSize: 13 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  topic: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderWidth: 1.5, borderRadius: 999, justifyContent: 'center' },
  chipText: { ...Type.bodyBold, fontSize: 14 },
});
