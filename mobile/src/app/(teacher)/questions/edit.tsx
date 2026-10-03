import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, getSyllabus } from '@/api/client';
import { cachedQuestion, createQuestion, deleteQuestion, findQuestion, findSimilar, restoreRevision, updateQuestion } from '@/api/questions';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { ChipRow } from '@/components/question-editor/chip';
import { PreviewPanel } from '@/components/question-editor/preview-panel';
import { RevisionsSheet } from '@/components/question-editor/revisions-sheet';
import { SectionButton, SectionPicker, sectionLabel } from '@/components/question-editor/section-picker';
import { SimilarBanner, type SimilarItem } from '@/components/question-editor/similar-banner';
import { SymbolField } from '@/components/question-editor/symbol-field';
import { SymbolToolbar } from '@/components/question-editor/symbol-toolbar';
import { useToast } from '@/components/toast';
import { Accents, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import {
  buildCreatePayload,
  buildPatchPayload,
  duplicateForm,
  emptyForm,
  fieldLimit,
  firstErrorField,
  formFromQuestion,
  hasErrors,
  insertAtSelection,
  IN_USE_MESSAGE,
  isDirty,
  isLocked,
  mapServerError,
  nextFormKeepingSettings,
  setOption,
  setPrefill,
  SIMILAR_MIN_CHARS,
  takePrefill,
  validateForm,
  type EditorForm,
  type FieldKey,
  type Selection,
} from '@/lib/question-editor';
import type { SyllabusResponse, TeacherQuestionDto } from '@stemreach/core';

const FIELD_LABEL: Record<FieldKey, string> = {
  text: 'Question',
  opt0: 'Option A',
  opt1: 'Option B',
  opt2: 'Option C',
  opt3: 'Option D',
  answer: 'Answer',
  explanation: 'Explanation',
};

const LETTERS = ['A', 'B', 'C', 'D'];
const BLANK_KEEP = (sectionId: string) => emptyForm({ section_id: sectionId });

function hasContent(f: EditorForm): boolean {
  return Boolean(f.text.trim() || f.explanation.trim() || f.answer.trim() || f.options.some((o) => o.trim()));
}

export default function QuestionEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; section_id?: string; prefill?: string }>();
  const id = params.id || undefined;
  const sectionParam = params.section_id || undefined;
  const theme = useTheme();
  const navigation = useNavigation();
  const { showToast } = useToast();

  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [syllabusError, setSyllabusError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [question, setQuestion] = useState<TeacherQuestionDto | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm({ section_id: sectionParam ?? '' }));
  const [original, setOriginal] = useState<EditorForm>(() => emptyForm({ section_id: sectionParam ?? '' }));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'missing'>(id ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');

  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey | 'correct' | 'section_id' | 'general', string>>>({});
  const [inUseFlag, setInUseFlag] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'another' | 'archive' | 'delete' | 'copy'>(null);

  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [focused, setFocused] = useState<FieldKey>('text');
  const [selOverride, setSelOverride] = useState<{ key: FieldKey; selection: Selection } | null>(null);
  const refs = useRef<Partial<Record<FieldKey, TextInput | null>>>({});
  const selections = useRef<Partial<Record<FieldKey, Selection>>>({});

  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pendingAction = useRef<unknown>(null);
  const bypass = useRef(false);

  // ── topics ────────────────────────────────────────────────────────────────
  const loadSyllabus = useCallback(() => {
    setSyllabusError(false);
    getSyllabus()
      .then(setSyllabus)
      .catch(() => setSyllabusError(true));
  }, []);
  useEffect(loadSyllabus, [loadSyllabus]);

  // ── load / initialise ─────────────────────────────────────────────────────
  const applyQuestion = useCallback((q: TeacherQuestionDto) => {
    const f = formFromQuestion(q);
    setQuestion(q);
    setForm(f);
    setOriginal(f);
    setInUseFlag(false);
  }, []);

  const init = useCallback(async () => {
    setShowErrors(false);
    setServerErrors({});
    setSimilar([]);
    if (!id) {
      const pf = takePrefill();
      const f = pf ?? emptyForm({ section_id: sectionParam ?? '' });
      setQuestion(null);
      setForm(f);
      // A prefilled copy is unsaved work: compare against a blank so leaving asks first.
      setOriginal(pf ? BLANK_KEEP(f.section_id) : f);
      setLoadState('ready');
      return;
    }
    const hit = cachedQuestion(id);
    if (hit) {
      applyQuestion(hit);
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    try {
      const q = await findQuestion(id);
      if (!q) {
        setLoadState('missing');
        return;
      }
      applyQuestion(q);
      setLoadState('ready');
    } catch (e) {
      setLoadError(toFriendlyError(e, 'Could not load this question.'));
      setLoadState('error');
    }
  }, [id, sectionParam, applyQuestion]);
  useEffect(() => {
    void init();
  }, [init]);

  // ── derived state ─────────────────────────────────────────────────────────
  const locked = !!id && (isLocked(question?.submission_count) || inUseFlag);
  const correctUnknown = !!id && original.type === 'mcq' && original.correct == null;
  const errors = useMemo(() => validateForm(form, { correctUnknownOk: correctUnknown && form.correct == null }), [form, correctUnknown]);
  const dirty = id ? isDirty(original, form) : hasContent(form);
  const archived = question ? question.enabled === false : false;
  const canDelete = !!question && (question.submission_count ?? 0) === 0 && !inUseFlag;
  const secName = sectionLabel(syllabus, form.section_id) ?? '';

  const err = (k: FieldKey | 'correct' | 'section_id'): string | undefined => {
    const server = serverErrors[k];
    if (server) return server;
    if (!showErrors) return undefined;
    if (k === 'text') return errors.text;
    if (k === 'section_id') return errors.section_id;
    if (k === 'correct') return errors.correct;
    if (k === 'answer') return errors.answer;
    if (k === 'explanation') return errors.explanation;
    return errors.options?.[Number(k.slice(3))];
  };

  const update = (patch: Partial<EditorForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerErrors({});
  };

  // ── unsaved-changes guard ─────────────────────────────────────────────────
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (bypass.current || !dirty) return;
      e.preventDefault();
      pendingAction.current = e.data.action;
      setLeaveOpen(true);
    });
    return sub;
  }, [navigation, dirty]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /** Plain navigation back: goes through the unsaved-changes guard. */
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(teacher)/questions');
  }, []);

  /** Leaves without asking (after a successful save/delete, or once the user chose Discard). */
  const leave = useCallback(() => {
    bypass.current = true;
    goBack();
  }, [goBack]);

  const confirmDiscard = () => {
    setLeaveOpen(false);
    bypass.current = true;
    const action = pendingAction.current;
    if (action) (navigation as unknown as { dispatch: (a: unknown) => void }).dispatch(action);
    else leave();
  };

  // ── near-duplicate check ──────────────────────────────────────────────────
  const similarToken = useRef(0);
  useEffect(() => {
    const text = form.text.trim();
    const mine = ++similarToken.current;
    if (loadState !== 'ready' || text.length < SIMILAR_MIN_CHARS || !form.section_id || (id && text === original.text.trim() && form.section_id === original.section_id)) {
      setSimilar([]);
      return;
    }
    const t = setTimeout(() => {
      findSimilar({ section_id: form.section_id, text, exclude_id: id })
        .then((r) => {
          if (mine === similarToken.current) setSimilar(r.similar.slice(0, 5));
        })
        .catch(() => {
          if (mine === similarToken.current) setSimilar([]);
        });
    }, 600);
    return () => clearTimeout(t);
  }, [form.text, form.section_id, id, original.text, original.section_id, loadState]);

  // ── symbols ───────────────────────────────────────────────────────────────
  const valueOf = (k: FieldKey): string => (k.startsWith('opt') ? form.options[Number(k.slice(3))] : (form[k as 'text' | 'answer' | 'explanation'] as string));
  const isDisabledField = (k: FieldKey) => locked && k.startsWith('opt');
  const targetKey: FieldKey = isDisabledField(focused) || (form.type === 'flashcard' && focused.startsWith('opt')) || (form.type === 'mcq' && focused === 'answer') ? 'text' : focused;

  const insertSymbol = (symbol: string) => {
    const k = targetKey;
    const r = insertAtSelection(valueOf(k), selections.current[k], symbol);
    if (k.startsWith('opt')) update({ options: setOption(form.options, Number(k.slice(3)), r.value) });
    else update({ [k]: r.value } as Partial<EditorForm>);
    selections.current[k] = r.selection;
    setSelOverride({ key: k, selection: r.selection });
    setTimeout(() => refs.current[k]?.focus(), 0);
  };

  const fieldProps = (k: FieldKey) => ({
    ref: (el: TextInput | null) => {
      refs.current[k] = el;
    },
    onFocus: () => setFocused(k),
    selection: selOverride?.key === k ? selOverride.selection : undefined,
    onSelectionChange: (s: Selection) => {
      selections.current[k] = s;
      if (selOverride?.key === k && (s.start !== selOverride.selection.start || s.end !== selOverride.selection.end)) setSelOverride(null);
    },
    limit: fieldLimit(k),
    error: err(k),
  });

  // ── actions ───────────────────────────────────────────────────────────────
  const handleSaveError = (e: unknown) => {
    if (e instanceof ApiError && (e.status === 400 || e.status === 409)) {
      const m = mapServerError(e.status, e.code, e.message);
      if (m.inUse) setInUseFlag(true);
      setServerErrors({ [m.field]: m.message });
      showToast(m.inUse ? m.message : 'The server rejected this question. See the highlighted field.', 'error');
      return;
    }
    showToast(toFriendlyError(e, 'Could not save. Please try again.'), 'error');
  };

  const startBlank = (next: EditorForm) => {
    setPrefill(next);
    if (id) {
      router.setParams({ id: '', section_id: next.section_id });
    } else {
      setQuestion(null);
      setForm(next);
      setOriginal(next);
      setShowErrors(false);
      setServerErrors({});
      setSimilar([]);
      setPrefill(null);
    }
    setTimeout(() => refs.current.text?.focus(), 50);
  };

  const save = async (another: boolean) => {
    if (busy) return;
    setShowErrors(true);
    if (hasErrors(errors)) {
      showToast('Please fix the highlighted fields.', 'error');
      const first = firstErrorField(errors);
      if (first && first !== 'correct' && first !== 'section_id') refs.current[first]?.focus();
      return;
    }
    setBusy(another ? 'another' : 'save');
    try {
      if (!id) {
        await createQuestion(buildCreatePayload(form));
        showToast('Question created');
      } else {
        const patch = buildPatchPayload(original, form);
        if (Object.keys(patch).length > 0) {
          const row = await updateQuestion(id, patch);
          showToast('Changes saved');
          if (!another) {
            applyQuestion({ ...row });
          }
        }
      }
      if (another) startBlank(nextFormKeepingSettings(form));
      else leave();
    } catch (e) {
      handleSaveError(e);
    } finally {
      setBusy(null);
    }
  };

  const duplicate = () => {
    setPrefill(duplicateForm(form));
    router.push({ pathname: '/(teacher)/questions/edit', params: { prefill: '1' } });
    showToast('Copy opened as a draft. Save it to keep it.', 'info');
  };

  const setArchived = async (archive: boolean) => {
    if (!id || busy) return;
    setBusy('archive');
    try {
      const row = await updateQuestion(id, { enabled: !archive });
      setQuestion(row);
      showToast(archive ? 'Archived. Students no longer see it.' : 'Restored.');
    } catch (e) {
      showToast(toFriendlyError(e, 'Could not update the question.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const correctedCopy = async () => {
    if (!id || busy) return;
    setBusy('copy');
    try {
      if (!archived) await updateQuestion(id, { enabled: false });
      setPrefill(duplicateForm(form));
      bypass.current = true;
      router.replace({ pathname: '/(teacher)/questions/edit', params: { prefill: '1', section_id: form.section_id } });
      showToast('Archived. Fix the copy and save it.', 'info');
    } catch (e) {
      showToast(toFriendlyError(e, 'Could not archive the question.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    if (!id) return;
    setBusy('delete');
    try {
      await deleteQuestion(id);
      setDeleteOpen(false);
      showToast('Question deleted');
      leave();
    } catch (e) {
      setDeleteOpen(false);
      if (e instanceof ApiError && e.status === 409) {
        setInUseFlag(true);
        showToast('Students have already answered this, so it cannot be deleted. Archive it instead.', 'error');
      } else {
        showToast(toFriendlyError(e, 'Could not delete the question.'), 'error');
      }
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async (revisionNo: number) => {
    if (!id) return;
    const row = await restoreRevision(id, revisionNo);
    applyQuestion(row);
    showToast(`Restored version ${revisionNo}`);
  };

  // ── render ────────────────────────────────────────────────────────────────
  const title = id ? 'Edit question' : 'New question';

  if (loadState !== 'ready') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <TopBar title={title} onBack={goBack} />
        {loadState === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={Accents.primary} accessibilityLabel="Loading question" />
        ) : loadState === 'error' ? (
          <ErrorState message={loadError} onRetry={init} />
        ) : (
          <View style={styles.centerMsg}>
            <Text style={[Type.body, { color: theme.textSecondary, textAlign: 'center' }]}>This question no longer exists. It may have been deleted.</Text>
            <Pressable onPress={leave} accessibilityRole="button" style={[styles.outlineBtn, { borderColor: Accents.border }]}>
              <Text style={[Type.bodyBold, { color: theme.primaryText }]}>Back to questions</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <TopBar title={title} onBack={goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {locked ? (
            <View style={[styles.notice, { borderColor: Accents.warn, backgroundColor: Accents.warnSoft }]} accessibilityRole="alert">
              <View style={styles.noticeHead}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.warnText} />
                <Text style={[Type.bodyBold, { color: theme.warnText, flex: 1 }]}>
                  {IN_USE_MESSAGE}
                </Text>
              </View>
              <Text style={[Type.body, { color: theme.text, fontSize: 13 }]}>
                You can still fix the wording, explanation, difficulty, language and status. The type, options and correct answer are locked.
              </Text>
              <Pressable
                onPress={correctedCopy}
                disabled={busy != null}
                accessibilityRole="button"
                accessibilityLabel="Archive this question and create a corrected copy"
                accessibilityState={{ disabled: busy != null, busy: busy === 'copy' }}
                style={({ pressed }) => [styles.outlineBtn, { borderColor: Accents.warn }, pressed && { opacity: 0.6 }]}
              >
                {busy === 'copy' ? <ActivityIndicator color={Accents.warn} /> : null}
                <Text style={[Type.bodyBold, { color: theme.warnText }]}>Archive and create corrected copy</Text>
              </Pressable>
            </View>
          ) : null}

          {serverErrors.general ? (
            <Text accessibilityRole="alert" style={[Type.bodySemi, styles.banner, { color: theme.dangerText, backgroundColor: Accents.dangerSoft }]}>
              {serverErrors.general}
            </Text>
          ) : null}

          {archived ? (
            <Text accessibilityRole="text" style={[Type.bodySemi, styles.banner, { color: theme.text, backgroundColor: theme.backgroundSelected }]}>
              This question is archived. Students do not see it. Restore it from More actions.
            </Text>
          ) : null}

          {syllabusError ? (
            <Pressable
              onPress={loadSyllabus}
              accessibilityRole="button"
              accessibilityLabel="Topics could not load. Retry"
              style={[styles.outlineBtn, { borderColor: Accents.danger }]}
            >
              <Text style={[Type.bodySemi, { color: theme.dangerText }]}>Topics could not load - tap to retry</Text>
            </Pressable>
          ) : (
            <SectionButton
              label="Topic"
              syllabus={syllabus}
              value={form.section_id || undefined}
              placeholder="Choose a topic"
              error={err('section_id')}
              onPress={() => setPickerOpen(true)}
            />
          )}

          <ChipRow
            label="Type"
            value={form.type}
            disabled={locked}
            options={[
              { value: 'mcq', label: 'Multiple choice' },
              { value: 'flashcard', label: 'Flashcard' },
            ]}
            onChange={(type) => update({ type })}
          />

          <SymbolField
            label="Question"
            value={form.text}
            onChangeText={(text) => update({ text })}
            multiline
            minLines={3}
            placeholder="Type the question"
            {...fieldProps('text')}
          />
          <SimilarBanner items={similar} onOpen={(sid) => router.push({ pathname: '/(teacher)/questions/edit', params: { id: sid } })} />

          {form.type === 'mcq' ? (
            <View style={styles.optionsBox}>
              <Text style={[Type.bodyBold, { color: theme.textSecondary, fontSize: 13 }]}>Options (tap the circle to mark the correct one)</Text>
              {form.options.map((opt, i) => {
                const k = `opt${i}` as FieldKey;
                const on = form.correct === i;
                return (
                  <SymbolField
                    key={k}
                    label={FIELD_LABEL[k]}
                    value={opt}
                    onChangeText={(v) => update({ options: setOption(form.options, i, v) })}
                    disabled={locked}
                    placeholder={`Option ${LETTERS[i]}`}
                    leading={
                      <Pressable
                        onPress={() => update({ correct: i })}
                        disabled={locked}
                        accessibilityRole="radio"
                        accessibilityLabel={`Mark option ${LETTERS[i]} as the correct answer`}
                        accessibilityState={{ checked: on, selected: on, disabled: locked }}
                        style={[styles.radioHit, locked && { opacity: 0.55 }]}
                      >
                        <View style={[styles.radio, { borderColor: on ? Accents.success : Accents.border, backgroundColor: on ? Accents.success : 'transparent' }]}>
                          {on ? <Ionicons name="checkmark" size={16} color={onAccent(Accents.success)} /> : null}
                        </View>
                      </Pressable>
                    }
                    {...fieldProps(k)}
                  />
                );
              })}
              {err('correct') ? (
                <Text accessibilityRole="alert" style={[Type.body, { color: theme.dangerText, fontSize: 12 }]}>
                  {err('correct')}
                </Text>
              ) : null}
              {correctUnknown && form.correct == null && !locked ? (
                <Text style={[Type.body, { color: theme.textSecondary, fontSize: 12 }]}>
                  The correct option is kept as saved. Pick one only if you want to change it.
                </Text>
              ) : null}
            </View>
          ) : (
            <SymbolField
              label="Answer (back of the card)"
              value={form.answer}
              onChangeText={(answer) => update({ answer })}
              multiline
              minLines={2}
              placeholder="Type the answer"
              {...fieldProps('answer')}
            />
          )}

          <SymbolField
            label="Explanation"
            value={form.explanation}
            onChangeText={(explanation) => update({ explanation })}
            multiline
            minLines={2}
            placeholder="Why is this the answer? Students read this after answering."
            {...fieldProps('explanation')}
          />

          <ChipRow
            label="Difficulty"
            value={form.difficulty}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
            onChange={(difficulty) => update({ difficulty })}
          />
          <ChipRow
            label="Language"
            value={form.language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'kn', label: 'Kannada' },
            ]}
            onChange={(language) => update({ language })}
          />
          <ChipRow
            label="Status (drafts are never shown to students)"
            value={form.status}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
            onChange={(status) => update({ status })}
          />

          <Pressable
            onPress={() => setPreviewOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: previewOpen }}
            accessibilityLabel="Preview as student"
            style={styles.sectionToggle}
          >
            <Ionicons name="phone-portrait-outline" size={18} color={theme.primaryText} />
            <Text style={[Type.bodyBold, { color: theme.primaryText, flex: 1 }]}>Preview as student</Text>
            <Ionicons name={previewOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} />
          </Pressable>
          {previewOpen ? <PreviewPanel form={form} sectionName={secName} /> : null}

          {id ? (
            <View style={[styles.moreBox, { borderColor: Accents.border }]}>
              <Text accessibilityRole="header" style={[Type.bodyBold, { color: theme.textSecondary, fontSize: 13 }]}>
                More actions
              </Text>
              <View style={styles.moreRow}>
                <MoreBtn icon="copy-outline" label="Duplicate" onPress={duplicate} />
                <MoreBtn icon="time-outline" label="History" onPress={() => setHistoryOpen(true)} />
                <MoreBtn
                  icon={archived ? 'arrow-undo-outline' : 'archive-outline'}
                  label={archived ? 'Restore' : 'Archive'}
                  onPress={() => setArchived(!archived)}
                  busy={busy === 'archive'}
                />
                {canDelete ? <MoreBtn icon="trash-outline" label="Delete" danger onPress={() => setDeleteOpen(true)} /> : null}
              </View>
              {!canDelete ? (
                <Text style={[Type.body, { color: theme.textSecondary, fontSize: 12 }]}>
                  Students have answered this, so it can only be archived, not deleted.
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.dock, { backgroundColor: theme.background, borderTopColor: Accents.border }]}>
          {symbolsOpen ? <SymbolToolbar onInsert={insertSymbol} targetLabel={FIELD_LABEL[targetKey]} /> : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setSymbolsOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: symbolsOpen }}
              accessibilityLabel={symbolsOpen ? 'Hide symbols' : 'Show symbols'}
              style={[styles.symBtn, { borderColor: symbolsOpen ? Accents.primary : Accents.border, backgroundColor: symbolsOpen ? Accents.primarySoft : 'transparent' }]}
            >
              <Text style={[Type.bodyBold, { color: theme.primaryText, fontSize: 18 }]}>Σ</Text>
            </Pressable>
            <Text style={[Type.body, { color: theme.textSecondary, fontSize: 12, flex: 1 }]} numberOfLines={1}>
              {symbolsOpen ? `Symbols go into: ${FIELD_LABEL[targetKey]}` : 'Symbols: powers, units, Greek, math'}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => save(true)}
              disabled={busy != null}
              accessibilityRole="button"
              accessibilityLabel="Save and add another"
              accessibilityState={{ disabled: busy != null, busy: busy === 'another' }}
              style={({ pressed }) => [styles.outlineBtn, { flex: 1, borderColor: Accents.primary }, busy != null && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
            >
              {busy === 'another' ? <ActivityIndicator color={Accents.primary} /> : null}
              <Text style={[Type.bodyBold, { color: theme.primaryText, textAlign: 'center' }]}>Save & add another</Text>
            </Pressable>
            <Pressable
              onPress={() => save(false)}
              disabled={busy != null}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: busy != null, busy: busy === 'save' }}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: Accents.primary }, busy != null && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
            >
              {busy === 'save' ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
              <Text style={[Type.bodyBold, { color: onAccent(Accents.primary), fontSize: 16 }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SectionPicker visible={pickerOpen} syllabus={syllabus} value={form.section_id || undefined} onSelect={(sid) => sid && update({ section_id: sid })} onClose={() => setPickerOpen(false)} />

      <ConfirmSheet
        visible={leaveOpen}
        title="Discard your changes?"
        message="You have unsaved changes to this question. If you leave now they are lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={confirmDiscard}
        onCancel={() => setLeaveOpen(false)}
      />
      <ConfirmSheet
        visible={deleteOpen}
        title="Delete this question?"
        message="This cannot be undone. If students have answered it, archive it instead."
        confirmLabel="Delete"
        loading={busy === 'delete'}
        onConfirm={doDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      {id ? <RevisionsSheet visible={historyOpen} questionId={id} onClose={() => setHistoryOpen(false)} onRestore={doRestore} /> : null}
    </SafeAreaView>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={Accents.primary} />
        <Text style={[Type.bodyBold, { color: theme.primaryText, fontSize: 17 }]}>Back</Text>
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[Type.heading, styles.topTitle, { color: theme.text }]}>
        {title}
      </Text>
    </View>
  );
}

function MoreBtn({ icon, label, onPress, danger, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; busy?: boolean }) {
  const theme = useTheme();
  const color = danger ? theme.dangerText : theme.primaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => [styles.moreBtn, { borderColor: danger ? Accents.danger : Accents.border }, pressed && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={18} color={color} />}
      <Text style={[Type.bodyBold, { color, fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, minHeight: 52 },
  backBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  topTitle: { flex: 1, fontSize: 20 },
  content: { padding: 16, paddingBottom: 24, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  centerMsg: { alignItems: 'center', gap: 16, padding: 32 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  noticeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: { borderRadius: 12, padding: 12, fontSize: 14 },
  optionsBox: { gap: 12 },
  radioHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sectionToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  moreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moreBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderWidth: 1, borderRadius: 999 },
  dock: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  saveBtn: { minHeight: 48, minWidth: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 22 },
});
