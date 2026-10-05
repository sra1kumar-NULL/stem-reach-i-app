import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImportQuestionsResponse, SyllabusResponse } from '@stemreach/core';

import { exportChapter, importQuestions } from '@/api/catalog';
import { getSyllabus } from '@/api/client';
import { BackButton } from '@/components/back-button';
import { ErrorState } from '@/components/error-state';
import { FormSheet } from '@/components/form-sheet';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { syllabusStore } from '@/lib/syllabus-store';
import { csvTemplate, IMPORT_MAX_ROWS, parseImport, type ImportProblem } from '@/lib/question-import';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TABLE_ROWS = 100;
const PLACEHOLDER = 'Paste your questions here, or choose a file';
const ROW_TOPIC_LABEL = 'Use the topic in each row';

/** Web: download via Blob. Native: hand the text to the system share sheet. */
async function saveText(filename: string, mime: string, text: string): Promise<'downloaded' | 'shared'> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  await Share.share({ message: text, title: filename });
  return 'shared';
}

function pickTextFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,.tsv,.txt,text/csv,text/tab-separated-values,application/json,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > MAX_FILE_BYTES) return reject(new Error('too_large'));
      file.text().then(resolve, reject);
    };
    input.click();
  });
}

type Phase = 'edit' | 'checking' | 'checked' | 'importing' | 'done';

export default function ImportScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('edit');
  const [localError, setLocalError] = useState<string | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [result, setResult] = useState<ImportQuestionsResponse | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [publish, setPublish] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [exportChapterId, setExportChapterId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadSyllabus = useCallback(async () => {
    setSyllabusError(null);
    try {
      setSyllabus(await syllabusStore.get(getSyllabus));
    } catch (e) {
      setSyllabusError(toFriendlyError(e, 'Could not load chapters and topics.'));
    }
  }, []);

  useEffect(() => {
    void loadSyllabus();
  }, [loadSyllabus]);

  // With a single chapter there is nothing to choose: preselect it for export.
  useEffect(() => {
    if (syllabus?.chapters.length === 1) setExportChapterId((cur) => cur ?? syllabus.chapters[0].id);
  }, [syllabus]);

  const targetLabel = useMemo(() => {
    for (const ch of syllabus?.chapters ?? []) {
      const s = ch.sections.find((x) => x.id === target);
      if (s) return `${s.section_no} ${s.name} (${ch.name})`;
    }
    return null;
  }, [syllabus, target]);

  const invalidate = () => {
    setPhase('edit');
    setResult(null);
    setProblems([]);
    setLocalError(null);
    setApiError(null);
  };

  const onChangeText = (v: string) => {
    setText(v);
    if (phase !== 'edit') invalidate();
  };

  const check = async () => {
    setApiError(null);
    setResult(null);
    const parsed = parseImport(text, { hasDefaultTarget: target !== null });
    setProblems(parsed.problems);
    setLocalError(parsed.fatal ?? null);
    setRowCount(parsed.rows.length + new Set(parsed.problems.map((p) => p.row)).size);
    if (parsed.fatal || parsed.problems.length > 0) {
      setPhase('edit');
      return;
    }
    setPhase('checking');
    try {
      const res = await importQuestions({
        rows: parsed.rows,
        dry_run: true,
        ...(target ? { default_section_id: target } : {}),
        status: publish ? 'published' : 'draft',
      });
      setResult(res);
      setRowCount(parsed.rows.length);
      setPhase('checked');
    } catch (e) {
      setApiError(toFriendlyError(e, 'Could not check the questions. Please try again.'));
      setPhase('edit');
    }
  };

  const importable = result ? Math.max(0, result.total - result.invalid - result.duplicates) : 0;

  const commit = async () => {
    if (!result || phase !== 'checked') return;
    const parsed = parseImport(text, { hasDefaultTarget: target !== null });
    setPhase('importing');
    setApiError(null);
    try {
      const res = await importQuestions({
        rows: parsed.rows,
        dry_run: false,
        ...(target ? { default_section_id: target } : {}),
        status: publish ? 'published' : 'draft',
      });
      if (!res.committed) {
        setResult(res);
        setApiError('Nothing was imported because some rows need fixing. Review the table below.');
        setPhase('checked');
        return;
      }
      setResult(res);
      setPhase('done');
      showToast(`Imported ${res.created} ${res.created === 1 ? 'question' : 'questions'}.`);
    } catch (e) {
      setApiError(toFriendlyError(e, 'Import failed. Nothing was saved; please try again.'));
      setPhase('checked');
    }
  };

  const chooseFile = async () => {
    try {
      const content = await pickTextFile();
      if (content != null) {
        setText(content);
        invalidate();
      }
    } catch (e) {
      showToast(
        e instanceof Error && e.message === 'too_large' ? 'That file is too large (2 MB max).' : 'Could not read that file.',
        'error',
      );
    }
  };

  const downloadTemplate = async () => {
    try {
      const how = await saveText('question-import-template.csv', 'text/csv', csvTemplate());
      showToast(how === 'downloaded' ? 'Template downloaded.' : 'Template ready to share.', 'info');
    } catch {
      showToast('Could not share the template.', 'error');
    }
  };

  const doExport = async () => {
    const ch = syllabus?.chapters.find((c) => c.id === exportChapterId);
    if (!ch) return;
    setExporting(true);
    try {
      const data = await exportChapter(ch.id);
      const slug = ch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chapter';
      const how = await saveText(`chapter-${ch.ncert_no}-${slug}.json`, 'application/json', JSON.stringify(data, null, 2));
      showToast(how === 'downloaded' ? 'Export downloaded.' : 'Export ready to share.');
    } catch (e) {
      showToast(toFriendlyError(e, 'Could not export this chapter.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const busy = phase === 'checking' || phase === 'importing';
  const issueRows = result?.rows.filter((r) => !r.ok || r.duplicate || r.errors.length > 0) ?? [];

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackButton fallback={'/(teacher)' as Href} />
          <Heading className="text-2xl" style={Type.heading} accessibilityRole="header">
            Import and export
          </Heading>

          {/* ── Import ── */}
          <Box className="gap-3 rounded-2xl border border-border bg-card p-3">
            <UIText className="text-lg font-bold text-foreground" style={Type.headingBold} accessibilityRole="header">
              Import questions
            </UIText>

            <View style={{ gap: 4 }}>
              <UIText className="text-sm font-bold text-foreground" style={Type.bodyBold}>
                Default topic (optional)
              </UIText>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Default topic: ${targetLabel ?? ROW_TOPIC_LABEL}. Change`}
                style={[styles.select, { borderColor: Accents.border }]}
              >
                <UIText className="flex-1 text-foreground" style={Type.body} numberOfLines={2}>
                  {targetLabel ?? ROW_TOPIC_LABEL}
                </UIText>
                <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
              </Pressable>
              <UIText className="text-xs text-muted-foreground" style={Type.body}>
                Rows that name their own topic keep it. Other rows go to the topic you pick here.
              </UIText>
            </View>

            <Input className="rounded-xl border border-border bg-background" style={{ height: 'auto' }}>
              <InputField
                value={text}
                onChangeText={onChangeText}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                placeholder={PLACEHOLDER}
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Questions to import"
                aria-label="Questions to import"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                className="px-3 py-3 text-sm"
                style={{ color: theme.text, fontFamily: Fonts.mono, minHeight: 180, height: 'auto' }}
              />
            </Input>

            <UIText className="text-xs text-muted-foreground" style={Type.body}>
              Accepts JSON, CSV or TSV, up to {IMPORT_MAX_ROWS} questions. The CSV template shows the columns. Nothing is saved until you import.
            </UIText>

            <View style={styles.row}>
              {Platform.OS === 'web' ? (
                <Button variant="outline" className="min-h-11 rounded-2xl" onPress={() => void chooseFile()} accessibilityLabel="Choose a file to import">
                  <Ionicons name="document-outline" size={16} color={theme.text} />
                  <ButtonText style={Type.bodyBold}>Choose file</ButtonText>
                </Button>
              ) : null}
              <Button variant="outline" className="min-h-11 rounded-2xl" onPress={() => void downloadTemplate()} accessibilityLabel="Download CSV template">
                <Ionicons name="download-outline" size={16} color={theme.text} />
                <ButtonText style={Type.bodyBold}>{Platform.OS === 'web' ? 'Download CSV template' : 'Share CSV template'}</ButtonText>
              </Button>
              {text ? (
                <Button
                  variant="outline"
                  className="min-h-11 rounded-2xl"
                  onPress={() => {
                    setText('');
                    invalidate();
                  }}
                  accessibilityLabel="Clear the pasted text"
                >
                  <ButtonText style={Type.bodyBold}>Clear</ButtonText>
                </Button>
              ) : null}
            </View>

            <Button
              variant="default"
              size="lg"
              className={`rounded-2xl ${busy || !text.trim() ? 'opacity-50' : ''}`}
              disabled={busy || !text.trim() || phase === 'done'}
              onPress={() => void check()}
              accessibilityLabel={phase === 'checking' ? 'Checking' : 'Check file'}
              accessibilityHint="Checks every row without saving anything"
              accessibilityState={{ busy, disabled: busy || !text.trim() }}
            >
              {phase === 'checking' ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
              <ButtonText style={Type.bodyBold}>{phase === 'checking' ? 'Checking…' : 'Check file'}</ButtonText>
            </Button>

            {localError ? (
              <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
                {localError}
              </UIText>
            ) : null}
            {apiError ? (
              <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
                {apiError}
              </UIText>
            ) : null}

            {problems.length > 0 ? (
              <View style={{ gap: 6 }}>
                <UIText accessibilityRole="alert" className="font-bold text-danger-text" style={Type.bodyBold}>
                  {new Set(problems.map((p) => p.row)).size} of {rowCount} rows need fixing before they can be checked.
                </UIText>
                <ProblemTable rows={problems.map((p) => ({ n: p.row, text: p.message }))} />
              </View>
            ) : null}

            {result ? (
              <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
                <View style={styles.chipsRow}>
                  <Stat label="Total" value={result.total} />
                  <Stat label="Valid" value={result.valid} color={Accents.success} />
                  <Stat label="Invalid" value={result.invalid} color={result.invalid > 0 ? Accents.danger : undefined} />
                  <Stat label="Duplicates" value={result.duplicates} color={result.duplicates > 0 ? Accents.warn : undefined} />
                </View>

                {issueRows.length > 0 ? (
                  <ProblemTable
                    rows={issueRows.map((r) => ({
                      n: r.index + 1,
                      text: [r.duplicate ? 'Already exists in that topic (will be skipped).' : null, ...r.errors]
                        .filter(Boolean)
                        .join(' '),
                      warn: r.duplicate && r.errors.length === 0,
                    }))}
                  />
                ) : null}

                {phase !== 'done' ? (
                  <>
                    <Pressable
                      onPress={() => setPublish((p) => !p)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: publish }}
                      accessibilityLabel="Publish immediately so students can see these questions"
                      style={styles.checkRow}
                    >
                      <View style={[styles.checkbox, { borderColor: publish ? Accents.primary : Accents.border, backgroundColor: publish ? Accents.primary : 'transparent' }]}>
                        {publish ? <Ionicons name="checkmark" size={14} color="#ECEFF4" /> : null}
                      </View>
                      <UIText className="flex-1 text-sm text-foreground" style={Type.body}>
                        Publish immediately. Otherwise they are saved as drafts for you to review.
                      </UIText>
                    </Pressable>
                    <Button
                      variant="default"
                      size="lg"
                      className={`rounded-2xl ${busy || result.invalid > 0 || importable === 0 ? 'opacity-50' : ''}`}
                      disabled={busy || result.invalid > 0 || importable === 0}
                      onPress={() => void commit()}
                      accessibilityState={{ busy, disabled: busy || result.invalid > 0 || importable === 0 }}
                    >
                      {phase === 'importing' ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
                      <ButtonText style={Type.bodyBold}>
                        {phase === 'importing' ? 'Importing…' : `Import ${importable} ${importable === 1 ? 'question' : 'questions'}`}
                      </ButtonText>
                    </Button>
                    {result.invalid > 0 ? (
                      <UIText className="text-sm text-muted-foreground" style={Type.body}>
                        Fix the rows above and press Check file again. Nothing is imported until every row is valid.
                      </UIText>
                    ) : null}
                  </>
                ) : (
                  <Box className="gap-2 rounded-xl p-3" style={{ backgroundColor: Accents.successSoft }}>
                    <UIText className="font-bold text-foreground" style={Type.bodyBold}>
                      Imported {result.created} {result.created === 1 ? 'question' : 'questions'}
                      {result.duplicates > 0 ? `, skipped ${result.duplicates} duplicates` : ''}.
                    </UIText>
                    <View style={styles.row}>
                      <Link href={'/(teacher)/questions' as Href} asChild>
                        <Button variant="default" className="min-h-11 rounded-2xl" accessibilityRole="link">
                          <ButtonText style={Type.bodyBold}>View in Questions</ButtonText>
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        className="min-h-11 rounded-2xl"
                        onPress={() => {
                          setText('');
                          invalidate();
                        }}
                      >
                        <ButtonText style={Type.bodyBold}>Import more</ButtonText>
                      </Button>
                    </View>
                  </Box>
                )}
              </View>
            ) : null}
          </Box>

          {/* ── Export ── */}
          <Box className="gap-3 rounded-2xl border border-border bg-card p-3">
            <UIText className="text-lg font-bold text-foreground" style={Type.headingBold} accessibilityRole="header">
              Export a chapter
            </UIText>
            <UIText className="text-sm text-muted-foreground" style={Type.body}>
              Downloads the chapter&apos;s active questions (drafts included) as a JSON file you can re-import.
            </UIText>
            {syllabusError ? <ErrorState message={syllabusError} onRetry={() => void loadSyllabus()} /> : null}
            {!syllabus && !syllabusError ? <ActivityIndicator color={Accents.primary} accessibilityLabel="Loading chapters" /> : null}
            <View style={styles.chapterList} accessibilityRole="radiogroup">
              {(syllabus?.chapters ?? []).map((ch) => {
                const on = ch.id === exportChapterId;
                return (
                  <Pressable
                    key={ch.id}
                    onPress={() => setExportChapterId(ch.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Chapter ${ch.ncert_no}, ${ch.name}`}
                    style={[styles.radioRow, { borderColor: on ? Accents.primary : Accents.border, backgroundColor: on ? Accents.primarySoft : 'transparent' }]}
                  >
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? theme.primaryText : theme.textSecondary} />
                    <UIText className="flex-1 text-foreground" style={Type.bodySemi}>
                      {ch.ncert_no}. {ch.name}
                    </UIText>
                  </Pressable>
                );
              })}
            </View>
            <Button
              variant="default"
              size="lg"
              className={`rounded-2xl ${!exportChapterId || exporting ? 'opacity-50' : ''}`}
              disabled={!exportChapterId || exporting}
              onPress={() => void doExport()}
              accessibilityState={{ busy: exporting, disabled: !exportChapterId || exporting }}
            >
              {exporting ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
              <ButtonText style={Type.bodyBold}>{Platform.OS === 'web' ? 'Download JSON' : 'Share JSON'}</ButtonText>
            </Button>
          </Box>
        </ScrollView>
      </SafeAreaView>

      <FormSheet visible={pickerOpen} title="Default topic" onClose={() => setPickerOpen(false)}>
        <TopicOption
          label={ROW_TOPIC_LABEL}
          checked={target === null}
          onPress={() => {
            setTarget(null);
            invalidate();
            setPickerOpen(false);
          }}
        />
        {syllabusError ? <ErrorState message={syllabusError} onRetry={() => void loadSyllabus()} /> : null}
        {(syllabus?.chapters ?? []).map((ch) => (
          <View key={ch.id} style={{ gap: 6 }}>
            <UIText className="font-bold text-foreground" style={Type.bodyBold}>
              {ch.ncert_no}. {ch.name}
            </UIText>
            {ch.sections.map((s) => (
              <TopicOption
                key={s.id}
                label={`${s.section_no} ${s.name}`}
                checked={target === s.id}
                onPress={() => {
                  setTarget(s.id);
                  invalidate();
                  setPickerOpen(false);
                }}
              />
            ))}
          </View>
        ))}
      </FormSheet>
    </Box>
  );
}

function TopicOption({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[styles.radioRow, { borderColor: checked ? Accents.primary : Accents.border, backgroundColor: checked ? Accents.primarySoft : 'transparent' }]}
    >
      <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={20} color={checked ? theme.primaryText : theme.textSecondary} />
      <UIText className="flex-1 text-foreground" style={Type.body}>
        {label}
      </UIText>
    </Pressable>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.stat, { borderColor: color ?? Accents.border }]}
    >
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

function ProblemTable({ rows }: { rows: { n: number; text: string; warn?: boolean }[] }) {
  const theme = useTheme();
  const shown = rows.slice(0, MAX_TABLE_ROWS);
  return (
    <View style={[styles.table, { borderColor: Accents.border }]} accessibilityLabel="Row problems" role="table">
      <View role="row" style={[styles.tr, { backgroundColor: theme.backgroundSelected }]}>
        <Text role="columnheader" style={[styles.th, styles.colRow, { color: theme.text }]}>
          Row
        </Text>
        <Text role="columnheader" style={[styles.th, { flex: 1, color: theme.text }]}>
          Problem
        </Text>
      </View>
      {shown.map((r, i) => (
        <View key={`${r.n}-${i}`} role="row" style={[styles.tr, { borderTopWidth: 1, borderTopColor: Accents.border }]}>
          <Text role="cell" style={[styles.td, styles.colRow, { color: theme.text }]}>
            {r.n}
          </Text>
          <Text role="cell" style={[styles.td, { flex: 1, color: r.warn ? theme.warnText : theme.dangerText }]}>
            {r.text}
          </Text>
        </View>
      ))}
      {rows.length > shown.length ? (
        <Text style={[styles.td, { color: theme.textSecondary }]}>…and {rows.length - shown.length} more.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  select: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { minWidth: 68, flexGrow: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  statValue: { ...Type.headingBold, fontSize: 20 },
  statLabel: { ...Type.body, fontSize: 12 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chapterList: { gap: 8 },
  radioRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  th: { ...Type.bodyBold, fontSize: 12, padding: 8 },
  td: { ...Type.body, fontSize: 13, padding: 8 },
  colRow: { width: 48 },
});
