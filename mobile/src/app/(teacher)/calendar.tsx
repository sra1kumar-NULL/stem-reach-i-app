import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  ActivationRangeResponse,
  CalendarDayResponse,
  CalendarMonthResponse,
  SyllabusResponse,
} from '@stemreach/core';

import { getSchoolToday } from '@/api/reports';
import { getActivationRange, getCalendarDay, getCalendarMonth, planActivations } from '@/api/calendar';
import { getSyllabus } from '@/api/client';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { FormSheet } from '@/components/form-sheet';
import { MonthGrid, type DayDisplay } from '@/components/month-grid';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Type } from '@/constants/theme';
import { PRIMARY_SOLID } from '@/components/teacher-home/tokens';
import { useTheme } from '@/hooks/use-theme';
import {
  copyLastWeek,
  formatLongDate,
  formatRangeShort,
  formatShortDate,
  groupBySections,
  isFresh,
  lastWeekRange,
  monthOf,
  partialCopyMessage,
  shiftMonth,
  tintFromPct,
  type CopyProposal,
} from '@/lib/calendar';
import { toFriendlyError } from '@/lib/friendly-error';
import { onSignOut } from '@/lib/session-cleanup';
import { localDateString } from '@/lib/sm2';

type MonthCache = Record<string, CalendarMonthResponse>;

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

const DOT_QUESTIONS = Accents.primary;
const DOT_TOPICS = Accents.success;
/** Day-panel cache lifetime: short, because teachers add questions/activations in other tabs. */
const DAY_TTL_MS = 60_000;
/** Questions listed in the day panel before "Show all". */
const QUESTIONS_PREVIEW = 5;

export default function CalendarScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  // School-calendar day (device day until the API answers); refreshed on focus/resume, never frozen at mount.
  const [today, setToday] = useState(() => localDateString());
  const todayRef = useRef(today);
  const [month, setMonth] = useState(() => monthOf(today));
  const [cache, setCache] = useState<MonthCache>({});
  const [monthError, setMonthError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const requested = useRef<Record<string, number>>({});

  // Day panel
  const [dayDate, setDayDate] = useState<string | null>(null);
  const [dayData, setDayData] = useState<CalendarDayResponse | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const dayCache = useRef<Record<string, { res: CalendarDayResponse; at: number }>>({});
  const dayDateRef = useRef<string | null>(null);
  dayDateRef.current = dayDate;
  const monthRef = useRef(month);
  monthRef.current = month;

  // Plan mode
  const [planMode, setPlanMode] = useState(false);
  const [planDates, setPlanDates] = useState<Set<string>>(new Set());
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  const [pickedSections, setPickedSections] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [working, setWorking] = useState(false);
  const [copying, setCopying] = useState(false);

  const loadMonth = useCallback(async (m: string, opts: { silent?: boolean; force?: boolean } = {}) => {
    const last = requested.current[m];
    if (!opts.force && last && Date.now() - last < 30_000) return;
    requested.current[m] = Date.now();
    if (!opts.silent) {
      setFetching(true);
      setMonthError(null);
    }
    try {
      const res = await getCalendarMonth(m);
      setCache((c) => ({ ...c, [m]: res }));
    } catch (e) {
      delete requested.current[m];
      if (!opts.silent) setMonthError(toFriendlyError(e, 'Could not load the calendar.'));
    } finally {
      if (!opts.silent) setFetching(false);
    }
  }, []);

  useEffect(() => {
    void loadMonth(month);
    // Warm the neighbours so paging is instant.
    void loadMonth(shiftMonth(month, -1), { silent: true });
    void loadMonth(shiftMonth(month, 1), { silent: true });
  }, [month, loadMonth]);

  const current = cache[month];
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarMonthResponse['days'][number]>();
    for (const d of current?.days ?? []) map.set(d.date, d);
    return map;
  }, [current]);

  const getDay = useCallback(
    (date: string): DayDisplay | undefined => {
      const d = byDate.get(date);
      const past = date < today;
      const display: DayDisplay = { disabled: planMode && past };
      if (planMode && past) display.labelExtra = ['in the past, cannot be planned'];
      if (d) {
        const dots: string[] = [];
        if (d.created_count > 0) dots.push(DOT_QUESTIONS);
        if (d.activated_section_count > 0) dots.push(DOT_TOPICS);
        display.dots = dots;
        display.intensity = tintFromPct(d.participation_pct);
        display.intensityColor = Accents.success;
        display.summary = d;
      }
      return display;
    },
    [byDate, planMode, today],
  );

  // ── Day panel ──
  const loadDay = useCallback(async (date: string, opts: { force?: boolean } = {}) => {
    setDayError(null);
    const cached = dayCache.current[date];
    if (cached) setDayData(cached.res);
    else setDayData(null);
    if (!opts.force && cached && isFresh(cached.at, Date.now(), DAY_TTL_MS)) return;
    try {
      const res = await getCalendarDay(date);
      dayCache.current[date] = { res, at: Date.now() };
      setDayData((cur) => (cur === null || cur.date === date ? res : cur));
    } catch (e) {
      if (!cached) setDayError(toFriendlyError(e, 'Could not load this day.'));
    }
  }, []);

  /** Re-reads everything the screen shows: today, the visible month and the open day. */
  const refresh = useCallback(async () => {
    const t = await getSchoolToday();
    if (t !== todayRef.current) {
      const prev = todayRef.current;
      todayRef.current = t;
      setToday(t);
      // Was looking at the (old) current month: follow the new "today".
      if (monthRef.current === monthOf(prev)) setMonth(monthOf(t));
    }
    // Coming back to the tab: anything cached may be stale (questions/activations change in other tabs).
    dayCache.current = {};
    const m = monthRef.current;
    void loadMonth(m, { force: true, silent: true });
    void loadMonth(shiftMonth(m, -1), { silent: true });
    void loadMonth(shiftMonth(m, 1), { silent: true });
    if (dayDateRef.current) void loadDay(dayDateRef.current, { force: true });
  }, [loadMonth, loadDay]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const sub = AppState.addEventListener('change', (st) => {
        if (st === 'active') void refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );

  // Module/screen caches hold the previous account's data: drop them on sign-out.
  useEffect(
    () =>
      onSignOut(() => {
        requested.current = {};
        dayCache.current = {};
        setCache({});
        setDayDate(null);
        setDayData(null);
        setSyllabus(null);
        setPlanMode(false);
        setPlanDates(new Set());
        setPickedSections(new Set());
      }),
    [],
  );

  const onSelectDate = (date: string) => {
    if (planMode) {
      if (date < today) return;
      setPlanDates((prev) => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        return next;
      });
      return;
    }
    setDayDate(date);
    void loadDay(date);
  };

  const closeDay = () => setDayDate(null);

  const openParticipation = (date: string) => {
    setDayDate(null);
    router.push(`/(teacher)/participation?date=${encodeURIComponent(date)}` as Href);
  };

  const openQuestion = (id: string) => {
    setDayDate(null);
    router.push(`/(teacher)/questions/edit?id=${encodeURIComponent(id)}` as Href);
  };

  // ── Plan mode ──
  const togglePlanMode = () => {
    setPlanMode((on) => {
      if (on) setPlanDates(new Set());
      return !on;
    });
  };

  const loadSyllabus = useCallback(async () => {
    setSyllabusError(null);
    try {
      setSyllabus(await getSyllabus());
    } catch (e) {
      setSyllabusError(toFriendlyError(e, 'Could not load the topics.'));
    }
  }, []);

  const openTopics = () => {
    setTopicsOpen(true);
    if (!syllabus) void loadSyllabus();
  };

  const sectionLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of syllabus?.chapters ?? []) for (const s of ch.sections) map.set(s.id, `${s.section_no} ${s.name}`);
    return map;
  }, [syllabus]);

  const toggleSection = (id: string) =>
    setPickedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleChapter = (ids: string[]) =>
    setPickedSections((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const afterPlan = useCallback(
    async (dates: string[]) => {
      const months = new Set(dates.map(monthOf));
      // Counts on any day may have changed: drop the whole day cache and reload the open day.
      dayCache.current = {};
      if (dayDateRef.current) void loadDay(dayDateRef.current, { force: true });
      await Promise.all([...months].map((m) => loadMonth(m, { force: true, silent: m !== month })));
    },
    [loadMonth, loadDay, month],
  );

  const reviewPlan = () => {
    const dates = [...planDates].sort();
    const ids = [...pickedSections];
    setTopicsOpen(false);
    setPending({
      title: 'Plan these days?',
      confirmLabel: 'Activate',
      message:
        `${ids.length} ${ids.length === 1 ? 'topic' : 'topics'} on ${dates.length} ${dates.length === 1 ? 'day' : 'days'}:\n` +
        `${dates.map(formatShortDate).join(', ')}\n\n` +
        `Topics: ${ids.map((id) => sectionLabels.get(id) ?? id).slice(0, 4).join('; ')}${ids.length > 4 ? ` and ${ids.length - 4} more` : ''}\n\n` +
        'This replaces anything already activated on those days.',
      run: async () => {
        await planActivations({ dates, section_ids: ids });
        await afterPlan(dates);
        setPlanDates(new Set());
        setPickedSections(new Set());
        showToast(`Planned ${dates.length} ${dates.length === 1 ? 'day' : 'days'}.`);
      },
    });
  };

  const startCopyLastWeek = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const { from, to } = lastWeekRange(today);
      const res: ActivationRangeResponse = await getActivationRange(from, to);
      const proposals: CopyProposal[] = copyLastWeek(res.activations, today);
      if (proposals.length === 0) {
        showToast('Nothing was activated in the last 7 days to copy.', 'info');
        return;
      }
      const names = new Map<string, string>();
      for (const a of res.activations) for (const s of a.sections) names.set(s.id, s.section_no);
      const lines = proposals.map((p) => {
        const secs = p.section_ids.map((id) => names.get(id) ?? '?');
        const shown = secs.slice(0, 3).join(', ');
        return `${formatShortDate(p.date)}: ${shown}${secs.length > 3 ? ` +${secs.length - 3}` : ''}`;
      });
      setPending({
        title: 'Copy last week?',
        confirmLabel: 'Copy',
        message: `${lines.join('\n')}\n\nSame weekdays, one week later. Existing activations on those days are replaced.`,
        run: async () => {
          const groups = groupBySections(proposals);
          const copied: string[] = [];
          let failure: unknown = null;
          for (const g of groups) {
            try {
              await planActivations({ dates: g.dates, section_ids: g.section_ids });
              copied.push(...g.dates);
            } catch (e) {
              failure = e;
              break;
            }
          }
          await afterPlan(proposals.map((p) => p.date));
          if (failure) {
            // Some groups may already be saved: say which dates, never a bare "failed".
            if (copied.length === 0) throw failure;
            const failed = proposals.map((p) => p.date).filter((d) => !copied.includes(d));
            showToast(partialCopyMessage(copied.sort(), failed, formatShortDate), 'error');
            return;
          }
          showToast(`Copied ${copied.length} ${copied.length === 1 ? 'day' : 'days'} from last week.`);
        },
      });
    } catch (e) {
      showToast(toFriendlyError(e, 'Could not load last week.'), 'error');
    } finally {
      setCopying(false);
    }
  };

  const runPending = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      await pending.run();
      setPending(null);
    } catch (e) {
      showToast(toFriendlyError(e, 'Could not save the plan. Please try again.'), 'error');
      setPending(null);
    } finally {
      setWorking(false);
    }
  };

  const monthEmpty = !!current && current.days.length === 0;
  const dateCount = planDates.size;
  const lastWeek = lastWeekRange(today);

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Heading style={[Type.heading, styles.headerTitle]} accessibilityRole="header">
              Calendar
            </Heading>
            <Pressable
              onPress={togglePlanMode}
              accessibilityRole="button"
              accessibilityState={{ selected: planMode }}
              accessibilityLabel={planMode ? 'Leave plan mode' : 'Plan ahead'}
              style={({ pressed }) => [
                styles.pill,
                { borderColor: planMode ? PRIMARY_SOLID : Accents.primary, backgroundColor: planMode ? PRIMARY_SOLID : 'transparent' },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={planMode ? 'close' : 'calendar-outline'} size={16} color={planMode ? '#ECEFF4' : theme.primaryText} />
              <Text style={[styles.pillText, { color: planMode ? '#ECEFF4' : theme.primaryText }]}>
                {planMode ? 'Done' : 'Plan ahead'}
              </Text>
            </Pressable>
          </View>

          <UIText className="text-sm text-muted-foreground" style={Type.body} accessibilityLiveRegion="polite">
            {planMode
              ? 'Tap today or future days to select them, then choose the topics to activate.'
              : 'Tap a day to see what was added, activated and who took part.'}
          </UIText>

          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            today={today}
            weekStart={1}
            selected={planMode ? planDates : dayDate}
            onSelectDate={onSelectDate}
            getDay={getDay}
            loading={fetching && !current}
            accessibilityLabel="Teacher calendar"
          />

          <View style={styles.legend} accessibilityLabel="Legend">
            <LegendItem color={DOT_QUESTIONS} label="Questions added" textColor={theme.textSecondary} />
            <LegendItem color={DOT_TOPICS} label="Topics activated" textColor={theme.textSecondary} />
            <LegendItem color={Accents.successSoft} label="Green day = students took part" textColor={theme.textSecondary} square />
          </View>

          {fetching && !current ? (
            <View style={styles.skeletons} accessibilityLabel="Loading calendar" accessibilityRole="progressbar">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-4 w-1/2 rounded" />
            </View>
          ) : null}
          {monthError && !current ? <ErrorState message={monthError} onRetry={() => void loadMonth(month, { force: true })} /> : null}
          {monthError && current ? (
            <Pressable onPress={() => void loadMonth(month, { force: true })} accessibilityRole="button" style={styles.staleBanner}>
              <UIText className="text-sm text-foreground" style={Type.body}>
                Showing saved data. {monthError} Tap to retry.
              </UIText>
            </Pressable>
          ) : null}
          {monthEmpty && !monthError ? (
            <Box className="items-center gap-1 rounded-2xl border border-border p-4">
              <UIText className="text-center text-foreground" style={Type.bodyBold}>
                Nothing recorded this month
              </UIText>
              <UIText className="text-center text-sm text-muted-foreground" style={Type.body}>
                Questions you add and topics you activate show up here. Use Plan ahead to schedule topics.
              </UIText>
            </Box>
          ) : null}
        </ScrollView>

        {planMode ? (
          <Box className="gap-2 border-t border-border bg-background px-4 pt-3" accessibilityLabel="Plan actions">
            <UIText className="font-bold text-foreground" style={Type.bodyBold} accessibilityLiveRegion="polite">
              {dateCount === 0 ? 'No days selected' : `${dateCount} ${dateCount === 1 ? 'day' : 'days'} selected`}
            </UIText>
            <View style={styles.planButtons}>
              <Button
                variant="default"
                className={`min-h-11 flex-1 rounded-2xl ${dateCount === 0 ? 'opacity-50' : ''}`}
                disabled={dateCount === 0}
                onPress={openTopics}
                accessibilityLabel="Choose topics for the selected days"
              >
                <ButtonText style={Type.bodyBold}>Choose topics</ButtonText>
              </Button>
              <Button
                variant="outline"
                className={`min-h-11 flex-1 rounded-2xl ${copying ? 'opacity-50' : ''}`}
                disabled={copying}
                onPress={() => void startCopyLastWeek()}
                accessibilityLabel={`Copy last week's activations (${formatRangeShort(lastWeek.from, lastWeek.to)}) to next week`}
              >
                <View style={styles.copyLabel}>
                  <ButtonText style={Type.bodyBold}>{copying ? 'Loading…' : 'Copy last week'}</ButtonText>
                  <Text style={[styles.copySub, { color: theme.textSecondary }]}>{formatRangeShort(lastWeek.from, lastWeek.to)}</Text>
                </View>
              </Button>
            </View>
            {dateCount > 0 ? (
              <Pressable
                onPress={() => setPlanDates(new Set())}
                accessibilityRole="button"
                accessibilityLabel="Clear selected days"
                style={styles.clearBtn}
              >
                <Text style={[styles.clearText, { color: theme.primaryText }]}>Clear selection</Text>
              </Pressable>
            ) : null}
          </Box>
        ) : null}
      </SafeAreaView>

      {/* Day panel */}
      <FormSheet visible={dayDate !== null} title={dayDate ? formatLongDate(dayDate) : ''} onClose={closeDay}>
        {dayDate ? (
          <DayPanel
            date={dayDate}
            data={dayData}
            error={dayError}
            onRetry={() => void loadDay(dayDate)}
            onOpenQuestion={openQuestion}
            onOpenParticipation={openParticipation}
          />
        ) : null}
      </FormSheet>

      {/* Topic picker */}
      <FormSheet
        visible={topicsOpen}
        title="Choose topics"
        onClose={() => setTopicsOpen(false)}
        footer={
          <>
            <Button variant="outline" className="min-h-11 flex-1 rounded-2xl" onPress={() => setTopicsOpen(false)}>
              <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
            </Button>
            <Button
              variant="default"
              className={`min-h-11 flex-1 rounded-2xl ${pickedSections.size === 0 ? 'opacity-50' : ''}`}
              disabled={pickedSections.size === 0}
              onPress={reviewPlan}
              accessibilityLabel={`Review plan, ${pickedSections.size} topics on ${dateCount} days`}
            >
              <ButtonText style={Type.bodyBold}>Review ({pickedSections.size})</ButtonText>
            </Button>
          </>
        }
      >
        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          {dateCount} {dateCount === 1 ? 'day' : 'days'} selected: {[...planDates].sort().map(formatShortDate).join(', ')}
        </UIText>
        {syllabusError ? (
          <ErrorState message={syllabusError} onRetry={() => void loadSyllabus()} />
        ) : !syllabus ? (
          <View style={{ gap: 8 }} accessibilityLabel="Loading topics" accessibilityRole="progressbar">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </View>
        ) : (
          syllabus.chapters.filter((c) => c.sections.length > 0).map((ch) => {
            const ids = ch.sections.map((s) => s.id);
            const allOn = ids.length > 0 && ids.every((id) => pickedSections.has(id));
            const someOn = ids.some((id) => pickedSections.has(id));
            return (
              <View key={ch.id} style={{ gap: 6 }}>
                <Pressable
                  onPress={() => toggleChapter(ids)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allOn ? true : someOn ? 'mixed' : false }}
                  accessibilityLabel={`${ch.name}, all topics`}
                  style={styles.checkRow}
                >
                  <Check state={allOn ? 'on' : someOn ? 'mixed' : 'off'} />
                  <UIText className="flex-1 font-bold text-foreground" style={Type.bodyBold}>
                    {ch.ncert_no}. {ch.name}
                  </UIText>
                </Pressable>
                {ch.sections.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => toggleSection(s.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: pickedSections.has(s.id) }}
                    accessibilityLabel={`${s.section_no} ${s.name}, ${s.enabled_question_count} live questions`}
                    style={[styles.checkRow, { marginLeft: 20 }]}
                  >
                    <Check state={pickedSections.has(s.id) ? 'on' : 'off'} />
                    <View style={{ flex: 1 }}>
                      <UIText className="text-foreground" style={Type.bodySemi}>
                        {s.section_no} {s.name}
                      </UIText>
                      <UIText className="text-xs text-muted-foreground" style={Type.body}>
                        {s.enabled_question_count} live
                      </UIText>
                    </View>
                  </Pressable>
                ))}
              </View>
            );
          })
        )}
      </FormSheet>

      <ConfirmSheet
        visible={pending !== null}
        title={pending?.title ?? ''}
        message={pending?.message}
        confirmLabel={pending?.confirmLabel}
        loading={working}
        onConfirm={() => void runPending()}
        onCancel={() => setPending(null)}
      />
    </Box>
  );
}

function LegendItem({ color, label, textColor, square }: { color: string; label: string; textColor: string; square?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        accessible={false}
        style={[
          square ? styles.legendSquare : styles.legendDot,
          { backgroundColor: color },
          square && { borderWidth: 1, borderColor: Accents.success },
        ]}
      />
      <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function Check({ state }: { state: 'on' | 'off' | 'mixed' }) {
  return (
    <View
      style={[
        styles.check,
        { borderColor: state === 'off' ? Accents.border : PRIMARY_SOLID, backgroundColor: state === 'off' ? 'transparent' : PRIMARY_SOLID },
      ]}
    >
      {state !== 'off' ? <Ionicons name={state === 'on' ? 'checkmark' : 'remove'} size={14} color="#ECEFF4" /> : null}
    </View>
  );
}

function DayPanel({
  date,
  data,
  error,
  onRetry,
  onOpenQuestion,
  onOpenParticipation,
}: {
  date: string;
  data: CalendarDayResponse | null;
  error: string | null;
  onRetry: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenParticipation: (date: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const theme = useTheme();
  if (error && !data) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data || data.date !== date) {
    return (
      <View style={{ gap: 10 }} accessibilityLabel="Loading day" accessibilityRole="progressbar">
        <Skeleton className="h-5 w-1/2 rounded" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </View>
    );
  }
  const { participation } = data;
  const pct = participation && participation.total_students > 0 ? Math.round((participation.answered_students / participation.total_students) * 100) : null;
  const nothing = data.activated_sections.length === 0 && data.questions_created.length === 0 && !participation;
  if (nothing) {
    return (
      <UIText className="text-muted-foreground" style={Type.body}>
        Nothing was activated or added on this day.
      </UIText>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <UIText className="font-bold text-foreground" style={Type.bodyBold} accessibilityRole="header">
          Participation
        </UIText>
        {participation ? (
          <Pressable
            onPress={() => onOpenParticipation(date)}
            accessibilityRole="link"
            accessibilityLabel={`${participation.answered_students} of ${participation.total_students} students answered. See who took part`}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
          >
            <UIText className="flex-1 text-foreground" style={Type.body}>
              {participation.answered_students} of {participation.total_students} students answered{pct !== null ? ` (${pct}%)` : ''}.
            </UIText>
            <Text style={[styles.linkText, { color: theme.primaryText }]}>Who?</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primaryText} />
          </Pressable>
        ) : (
          <UIText className="text-muted-foreground" style={Type.body}>
            No revision was activated, so there is no participation.
          </UIText>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <UIText className="font-bold text-foreground" style={Type.bodyBold} accessibilityRole="header">
          Topics activated ({data.activated_sections.length})
        </UIText>
        {data.activated_sections.length === 0 ? (
          <UIText className="text-muted-foreground" style={Type.body}>
            None.
          </UIText>
        ) : (
          data.activated_sections.map((s) => (
            <View key={s.id} style={[styles.rowCard, { borderColor: Accents.border }]}>
              <View style={[styles.legendDot, { backgroundColor: DOT_TOPICS }]} />
              <View style={{ flex: 1 }}>
                <UIText className="text-foreground" style={Type.bodySemi}>
                  {s.section_no} {s.name}
                </UIText>
                <UIText className="text-xs text-muted-foreground" style={Type.body}>
                  {s.question_count} live
                </UIText>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 6 }}>
        <UIText className="font-bold text-foreground" style={Type.bodyBold} accessibilityRole="header">
          Questions added ({data.questions_created.length})
        </UIText>
        {data.questions_created.length === 0 ? (
          <UIText className="text-muted-foreground" style={Type.body}>
            None.
          </UIText>
        ) : (
          (showAll ? data.questions_created : data.questions_created.slice(0, QUESTIONS_PREVIEW)).map((q) => (
            <Pressable
              key={q.id}
              onPress={() => onOpenQuestion(q.id)}
              accessibilityRole="button"
              accessibilityLabel={`Edit question: ${q.question_text}`}
              style={({ pressed }) => [styles.rowCard, { borderColor: Accents.border }, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.legendDot, { backgroundColor: DOT_QUESTIONS }]} />
              <UIText className="flex-1 text-foreground" style={Type.body} numberOfLines={2}>
                {q.question_text}
              </UIText>
              {q.status === 'draft' ? (
                <Text style={[styles.draftBadge, { color: theme.warnText, borderColor: Accents.warn }]}>Draft</Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </Pressable>
          ))
        )}
        {data.questions_created.length > QUESTIONS_PREVIEW ? (
          <Pressable
            onPress={() => setShowAll((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
            accessibilityLabel={showAll ? 'Show fewer questions' : `Show all ${data.questions_created.length} questions`}
            style={styles.clearBtn}
          >
            <Text style={[styles.clearText, { color: theme.primaryText }]}>
              {showAll ? 'Show fewer' : `Show all (${data.questions_created.length})`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerTitle: { flexShrink: 1, fontSize: 28, lineHeight: 34 },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  pillText: { ...Type.bodyBold, fontSize: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendSquare: { width: 12, height: 12, borderRadius: 3 },
  legendText: { ...Type.body, fontSize: 12 },
  skeletons: { gap: 8 },
  staleBanner: { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 12, backgroundColor: Accents.warnSoft },
  planButtons: { flexDirection: 'row', gap: 10 },
  copyLabel: { alignItems: 'center' },
  copySub: { ...Type.body, fontSize: 11 },
  linkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { ...Type.bodyBold, fontSize: 14 },
  clearBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearText: { ...Type.bodyBold, fontSize: 14 },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowCard: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  draftBadge: { ...Type.bodyBold, fontSize: 11, borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
});
