import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSyllabus } from '@/api/client';
import { listQuestions, questionsVersion, type QuestionFilters } from '@/api/questions';
import { ErrorState } from '@/components/error-state';
import { ChipRow } from '@/components/question-editor/chip';
import { MenuItem, PopoverMenu } from '@/components/question-editor/popover-menu';
import { QuestionRow } from '@/components/question-editor/question-row';
import { SectionButton, SectionPicker } from '@/components/question-editor/section-picker';
import { Button, ButtonText } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Accents, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { syllabusStore } from '@/lib/syllabus-store';
import type { SyllabusResponse, TeacherQuestionDto } from '@stemreach/core';

type Pick1<K extends keyof QuestionFilters> = NonNullable<QuestionFilters[K]> | 'all';

const TYPE_OPTS: { value: Pick1<'type'>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'flashcard', label: 'Flashcard' },
];
const DIFF_OPTS: { value: Pick1<'difficulty'>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];
const LANG_OPTS: { value: Pick1<'language'>; label: string; a11y?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'Kannada' },
];
const STATUS_OPTS: { value: Pick1<'status'>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];
const ARCHIVED_OPTS: { value: NonNullable<QuestionFilters['archived']>; label: string; a11y: string }[] = [
  { value: 'exclude', label: 'Active', a11y: 'Active questions only' },
  { value: 'only', label: 'Archived', a11y: 'Archived questions only' },
  { value: 'include', label: 'Both', a11y: 'Active and archived questions' },
];

interface Filters {
  section_id?: string;
  type: Pick1<'type'>;
  difficulty: Pick1<'difficulty'>;
  language: Pick1<'language'>;
  status: Pick1<'status'>;
  archived: NonNullable<QuestionFilters['archived']>;
}
const DEFAULT_FILTERS: Filters = { type: 'all', difficulty: 'all', language: 'all', status: 'all', archived: 'exclude' };

function toQuery(f: Filters, q: string, cursor?: string): QuestionFilters {
  return {
    section_id: f.section_id,
    q: q.trim() || undefined,
    type: f.type === 'all' ? undefined : f.type,
    difficulty: f.difficulty === 'all' ? undefined : f.difficulty,
    language: f.language === 'all' ? undefined : f.language,
    status: f.status === 'all' ? undefined : f.status,
    archived: f.archived,
    cursor,
  };
}

function activeFilterCount(f: Filters): number {
  return [f.type !== 'all', f.difficulty !== 'all', f.language !== 'all', f.status !== 'all', f.archived !== 'exclude'].filter(Boolean).length;
}

export default function QuestionsListScreen() {
  const theme = useTheme();
  const narrow = useWindowDimensions().width < 380;
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [syllabusError, setSyllabusError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [items, setItems] = useState<TeacherQuestionDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  // Guards against out-of-order responses when filters change quickly.
  const token = useRef(0);
  const seenVersion = useRef(questionsVersion());

  const loadSyllabus = useCallback(() => {
    setSyllabusError(false);
    syllabusStore
      .get(getSyllabus)
      .then(setSyllabus)
      .catch(() => setSyllabusError(true));
  }, []);
  useEffect(loadSyllabus, [loadSyllabus]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFirst = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const mine = ++token.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      setMoreError(null);
      try {
        const res = await listQuestions(toQuery(filters, search));
        if (mine !== token.current) return;
        setItems(res.questions);
        setCursor(res.next_cursor ?? null);
      } catch (e) {
        if (mine !== token.current) return;
        setError(toFriendlyError(e, 'Could not load questions.'));
        if (mode !== 'silent') setItems([]);
        setCursor(null);
      } finally {
        if (mine === token.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filters, search],
  );

  useEffect(() => {
    void fetchFirst('initial');
  }, [fetchFirst]);

  // Coming back from the editor after a save/delete: refresh without blanking the list.
  useFocusEffect(
    useCallback(() => {
      if (seenVersion.current !== questionsVersion()) {
        seenVersion.current = questionsVersion();
        void fetchFirst('silent');
      }
    }, [fetchFirst]),
  );

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loading || error) return;
    const mine = token.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await listQuestions(toQuery(filters, search, cursor));
      if (mine !== token.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.questions.filter((r) => !seen.has(r.id))];
      });
      setCursor(res.next_cursor ?? null);
    } catch (e) {
      if (mine === token.current) setMoreError(toFriendlyError(e, 'Could not load more questions.'));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, error, filters, search]);

  const openEditor = useCallback((q: TeacherQuestionDto) => {
    router.push({ pathname: '/(teacher)/questions/edit', params: { id: q.id } });
  }, []);
  const newQuestion = () =>
    router.push({ pathname: '/(teacher)/questions/edit', params: filters.section_id ? { section_id: filters.section_id } : {} });

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const nFilters = activeFilterCount(filters);
  const anyFilter = nFilters > 0 || !!filters.section_id || !!search.trim();
  /** Resets only the chip filters (topic and search have their own clear controls). */
  const clearFilters = () => setFilters((f) => ({ ...DEFAULT_FILTERS, section_id: f.section_id }));
  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput('');
    setSearch('');
  };

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[Type.heading, styles.title, { color: theme.text }]}>
            Questions
          </Text>
          <Button
            variant="outline"
            size="sm"
            onPress={newQuestion}
            accessibilityLabel="New question"
          >
            <Ionicons name="add" size={18} color={Accents.primary} />
            <ButtonText style={[Type.bodyBold, { fontSize: 15 }]}>{narrow ? 'New' : 'New question'}</ButtonText>
          </Button>
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="More"
            accessibilityHint="Chapters and topics, import and export"
            accessibilityState={{ expanded: menuOpen }}
            style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
          </Pressable>
        </View>

        {syllabusError ? (
          <Pressable
            onPress={loadSyllabus}
            accessibilityRole="button"
            accessibilityLabel="Topics could not load. Retry"
            style={[styles.topicBtn, { borderColor: Accents.danger, backgroundColor: theme.backgroundElement }]}
          >
            <Text style={[Type.bodySemi, { color: theme.dangerText }]}>Topics could not load - tap to retry</Text>
          </Pressable>
        ) : (
          <SectionButton
            label="Topic"
            syllabus={syllabus}
            value={filters.section_id}
            placeholder="All topics"
            onPress={() => setPickerOpen(true)}
          />
        )}

        <View style={[styles.searchBox, { borderColor: Accents.border, backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search question text"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Search question text"
            returnKeyType="search"
            autoCorrect={false}
            style={[Type.body, styles.searchInput, { color: theme.text }]}
          />
          {searchInput ? (
            <Pressable onPress={() => setSearchInput('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setShowFilters((s) => !s)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }}
            accessibilityLabel={`Filters${nFilters ? `, ${nFilters} active` : ''}`}
            style={styles.filterToggle}
          >
            <Ionicons name="options-outline" size={18} color={theme.primaryText} />
            <Text style={[Type.bodyBold, { color: theme.primaryText, fontSize: 14 }]} accessibilityLiveRegion="polite">
              Filters{nFilters ? ` (${nFilters})` : ''}
            </Text>
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={theme.primaryText} />
          </Pressable>
          {nFilters > 0 ? (
            <Pressable onPress={clearFilters} accessibilityRole="button" accessibilityLabel="Clear filters" style={styles.clearLink}>
              <Text style={[Type.bodyBold, { color: theme.primaryText, fontSize: 14, textDecorationLine: 'underline' }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {showFilters ? (
          <View style={styles.filters}>
            <ChipRow label="Type" value={filters.type} options={TYPE_OPTS} onChange={(v) => set('type', v)} />
            <ChipRow label="Difficulty" value={filters.difficulty} options={DIFF_OPTS} onChange={(v) => set('difficulty', v)} />
            <ChipRow label="Language" value={filters.language} options={LANG_OPTS} onChange={(v) => set('language', v)} />
            <ChipRow label="Status" value={filters.status} options={STATUS_OPTS} onChange={(v) => set('status', v)} />
            <ChipRow label="Show" value={filters.archived} options={ARCHIVED_OPTS} onChange={(v) => set('archived', v)} />
          </View>
        ) : null}
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, syllabus, syllabusError, filters, searchInput, showFilters, nFilters, loadSyllabus, menuOpen, narrow],
  );

  let body: 'skeleton' | 'error' | 'empty' | 'list' = 'list';
  if (loading) body = 'skeleton';
  else if (error && items.length === 0) body = 'error';
  else if (items.length === 0) body = 'empty';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <FlatList
        data={body === 'list' ? items : []}
        keyExtractor={(q) => q.id}
        renderItem={({ item }) => <QuestionRow q={item} onPress={openEditor} />}
        ItemSeparatorComponent={Sep}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        style={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchFirst('refresh')} tintColor={Accents.primary} />}
        ListEmptyComponent={
          body === 'skeleton' ? (
            <View style={{ gap: 10 }} accessibilityLabel="Loading questions" accessibilityRole="progressbar">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" className="h-24 w-full" />
              ))}
            </View>
          ) : body === 'error' ? (
            <ErrorState message={error ?? ''} onRetry={() => fetchFirst('initial')} />
          ) : (
            <EmptyState filtered={anyFilter} onClear={clearAll} onNew={newQuestion} />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ margin: 16 }} color={Accents.primary} accessibilityLabel="Loading more" />
          ) : moreError ? (
            <ErrorState message={moreError} onRetry={loadMore} />
          ) : cursor == null && items.length > 0 ? (
            <Text style={[Type.body, styles.end, { color: theme.textSecondary }]}>
              {items.length} question{items.length === 1 ? '' : 's'}
            </Text>
          ) : null
        }
      />
      <PopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuItem
          icon="library-outline"
          label="Chapters and topics"
          onPress={() => {
            setMenuOpen(false);
            router.push('/(teacher)/catalog' as Href);
          }}
        />
        <MenuItem
          icon="swap-vertical-outline"
          label="Import / export"
          onPress={() => {
            setMenuOpen(false);
            router.push('/(teacher)/import' as Href);
          }}
        />
      </PopoverMenu>
      <SectionPicker
        visible={pickerOpen}
        syllabus={syllabus}
        value={filters.section_id}
        allowAll
        onSelect={(id) => set('section_id', id)}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function Sep() {
  return <View style={{ height: 10 }} />;
}

function EmptyState({ filtered, onClear, onNew }: { filtered: boolean; onClear: () => void; onNew: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name="document-text-outline" size={44} color={theme.textSecondary} />
      <Text accessibilityRole="header" style={[Type.heading, { fontSize: 18, color: theme.text }]}>
        {filtered ? 'No questions match' : 'No questions yet'}
      </Text>
      <Text style={[Type.body, { color: theme.textSecondary, textAlign: 'center' }]}>
        {filtered ? 'Try a different search or clear the filters.' : 'Write your first question and students will see it once it is published.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {filtered ? (
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear filters" style={[styles.linkBtn, { borderColor: Accents.border }]}>
            <Text style={[Type.bodyBold, { color: theme.primaryText }]}>Clear filters</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="New question"
          style={[styles.primaryBtn, { backgroundColor: Accents.primary }]}
        >
          <Ionicons name="add" size={20} color={onAccent(Accents.primary)} />
          <Text style={[Type.bodyBold, { color: onAccent(Accents.primary), fontSize: 15 }]}>New question</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
  header: { gap: 12, marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 26, flex: 1 },
  primaryBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, borderRadius: 999 },
  linkBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  topicBtn: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12 },
  searchInput: { flex: 1, fontSize: 15, minHeight: 44 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  filterToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearLink: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  filters: { gap: 12 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 8 },
  end: { textAlign: 'center', fontSize: 12, padding: 16 },
});
