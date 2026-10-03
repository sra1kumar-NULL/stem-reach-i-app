/**
 * MonthGrid — reusable, themeable month calendar (no extra dependency).
 *
 * Rendering is data-agnostic: the host passes `getDay(date)` returning dots,
 * an intensity tint and labels, or a `renderDay` callback for fully custom
 * cell content (the student streak heatmap can reuse it later). Date math
 * lives in `@/lib/calendar`.
 *
 * Semantics: grid > row > gridcell with one accessibilityLabel per day
 * ("3 October, 5 questions added, ..."). On web the grid is one tab stop with
 * roving focus: arrows move by day/week, Home/End jump to the week edges,
 * PageUp/PageDown change month. Cells are 48pt tall; widths flex so seven
 * columns still fit at 320px.
 */
import { Ionicons } from '@expo/vector-icons';
import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Fonts, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  dayAccessibilityLabel,
  firstOfMonth,
  formatMonthTitle,
  monthMatrix,
  monthOf,
  parseIso,
  shiftMonth,
  weekColumn,
  weekdayLabels,
  type WeekStart,
} from '@/lib/calendar';

export interface DayDisplay {
  /** Up to 3 dot colours shown under the number. */
  dots?: string[];
  /** 0..1 background tint strength (heatmap style). */
  intensity?: number;
  /** Tint colour; defaults to the success accent. */
  intensityColor?: string;
  /** Full accessibilityLabel override. Default: built from `summary`. */
  accessibilityLabel?: string;
  /** Fed to `dayAccessibilityLabel` when no override is given. */
  summary?: Parameters<typeof dayAccessibilityLabel>[1];
  /** Extra phrases appended to the default label ("selected", "in the past"). */
  labelExtra?: string[];
  /** Not selectable (still focusable so keyboard users can pass over it). */
  disabled?: boolean;
}

export interface RenderDayContext {
  date: string;
  day: number;
  selected: boolean;
  today: boolean;
  disabled: boolean;
  textColor: string;
}

export interface MonthGridProps {
  /** Visible month, `YYYY-MM`. */
  month: string;
  onMonthChange: (month: string) => void;
  /** `YYYY-MM-DD` of today (school calendar) — highlighted and used by the Today button. */
  today: string;
  weekStart?: WeekStart;
  /** Selected date(s). */
  selected?: string | ReadonlySet<string> | null;
  onSelectDate?: (date: string) => void;
  getDay?: (date: string) => DayDisplay | undefined;
  /** Replaces the default day number + dots. */
  renderDay?: (ctx: RenderDayContext) => ReactNode;
  /** Dims the cells and marks the grid busy while data loads. */
  loading?: boolean;
  /** Earliest/latest navigable month (`YYYY-MM`). */
  minMonth?: string;
  maxMonth?: string;
  accessibilityLabel?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function MonthGrid({
  month,
  onMonthChange,
  today,
  weekStart = 1,
  selected,
  onSelectDate,
  getDay,
  renderDay,
  loading = false,
  minMonth,
  maxMonth,
  accessibilityLabel = 'Calendar',
}: MonthGridProps): JSX.Element {
  const theme = useTheme();
  const weeks = useMemo(() => monthMatrix(month, weekStart, true), [month, weekStart]);
  const labels = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const selectedSet = useMemo<ReadonlySet<string>>(
    () => (selected == null ? new Set() : typeof selected === 'string' ? new Set([selected]) : selected),
    [selected],
  );

  // Roving focus (web): one tab stop, the focused date.
  const [focusDate, setFocusDate] = useState<string>(() => defaultFocus(month, today, selectedSet));
  const cellRefs = useRef<Record<string, View | null>>({});
  const moveFocus = useRef(false);

  useEffect(() => {
    // Keep the tab stop inside the visible month when it changes.
    setFocusDate((d) => (monthOf(d) === month ? d : defaultFocus(month, today, selectedSet)));
  }, [month, today, selectedSet]);

  useEffect(() => {
    if (!moveFocus.current || Platform.OS !== 'web') return;
    const node = cellRefs.current[focusDate] as (View & { focus?: () => void }) | null;
    if (node?.focus) {
      node.focus();
      moveFocus.current = false;
    }
  }, [focusDate, month]);

  const canPrev = !minMonth || shiftMonth(month, -1) >= minMonth;
  const canNext = !maxMonth || shiftMonth(month, 1) <= maxMonth;
  const goMonth = useCallback(
    (delta: number) => {
      const next = shiftMonth(month, delta);
      if ((minMonth && next < minMonth) || (maxMonth && next > maxMonth)) return;
      onMonthChange(next);
    },
    [month, onMonthChange, minMonth, maxMonth],
  );

  const onKey = (e: { key?: string; preventDefault?: () => void }, date: string) => {
    const key = e.key ?? '';
    let target: string | null = null;
    if (key in KEY_STEP) target = addDays(date, KEY_STEP[key]);
    else if (key === 'Home') target = addDays(date, -weekColumn(date, weekStart));
    else if (key === 'End') target = addDays(date, 6 - weekColumn(date, weekStart));
    else if (key === 'PageUp' || key === 'PageDown') {
      const delta = key === 'PageUp' ? -1 : 1;
      const m = shiftMonth(monthOf(date), delta);
      const { d } = parseIso(date);
      const last = parseIso(addDays(firstOfMonth(shiftMonth(m, 1)), -1)).d;
      target = `${m}-${String(Math.min(d, last)).padStart(2, '0')}`;
    }
    if (!target) return;
    e.preventDefault?.();
    const targetMonth = monthOf(target);
    if ((minMonth && targetMonth < minMonth) || (maxMonth && targetMonth > maxMonth)) return;
    moveFocus.current = true;
    setFocusDate(target);
    if (targetMonth !== month) onMonthChange(targetMonth);
  };

  const textMuted = theme.textSecondary;

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.root}>
      <View style={styles.header}>
        <NavButton
          icon="chevron-back"
          label={`Previous month, ${formatMonthTitle(shiftMonth(month, -1))}`}
          disabled={!canPrev}
          onPress={() => goMonth(-1)}
          color={theme.text}
        />
        <Text
          accessibilityRole="header"
          aria-live="polite"
          style={[styles.title, { color: theme.text, fontFamily: Fonts.rounded }]}
          numberOfLines={1}
        >
          {formatMonthTitle(month)}
        </Text>
        <Pressable
          onPress={() => onMonthChange(monthOf(today))}
          disabled={month === monthOf(today)}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          accessibilityState={{ disabled: month === monthOf(today) }}
          style={({ pressed }) => [
            styles.todayBtn,
            { borderColor: Accents.border, opacity: month === monthOf(today) ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.todayText, { color: theme.primaryText }]}>Today</Text>
        </Pressable>
        <NavButton
          icon="chevron-forward"
          label={`Next month, ${formatMonthTitle(shiftMonth(month, 1))}`}
          disabled={!canNext}
          onPress={() => goMonth(1)}
          color={theme.text}
        />
      </View>

      <View role="grid" accessibilityLabel={`${formatMonthTitle(month)} calendar`} aria-busy={loading}>
        <View role="row" style={styles.weekRow}>
          {labels.map((l, i) => (
            <View key={`${l}-${i}`} role="columnheader" style={styles.cellBox} accessibilityLabel={l}>
              <Text style={[styles.weekday, { color: textMuted }]}>{l}</Text>
            </View>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} role="row" style={styles.weekRow}>
            {week.map((cell) => {
              if (!cell.inMonth) {
                return (
                  <View
                    key={cell.date}
                    style={styles.cellBox}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                );
              }
              const display = getDay?.(cell.date);
              const isSelected = selectedSet.has(cell.date);
              const isToday = cell.date === today;
              const disabled = !!display?.disabled;
              const tintBase = display?.intensityColor ?? Accents.success;
              const bg =
                isSelected
                  ? Accents.primary
                  : display?.intensity != null
                    ? hexToRgba(tintBase, display.intensity)
                    : 'transparent';
              const textColor = isSelected ? onAccent(Accents.primary) : theme.text;
              const label =
                display?.accessibilityLabel ??
                dayAccessibilityLabel(cell.date, display?.summary, [
                  ...(isToday ? ['today'] : []),
                  ...(display?.labelExtra ?? []),
                  ...(isSelected ? ['selected'] : []),
                ]);
              return (
                <View key={cell.date} style={styles.cellBox}>
                  <Pressable
                    ref={(n) => {
                      cellRefs.current[cell.date] = n;
                      // react-native-web's Pressable drops aria-selected/aria-disabled; set them on the DOM node.
                      const el = n as unknown as { setAttribute?: (k: string, v: string) => void } | null;
                      if (Platform.OS === 'web' && el?.setAttribute) {
                        el.setAttribute('aria-selected', String(isSelected));
                        el.setAttribute('aria-disabled', String(disabled));
                      }
                    }}
                    {...({ role: Platform.OS === 'web' ? 'gridcell' : undefined } as object)}
                    accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                    tabIndex={cell.date === focusDate ? 0 : -1}
                    onPress={() => {
                      if (disabled) return;
                      setFocusDate(cell.date);
                      onSelectDate?.(cell.date);
                    }}
                    onFocus={() => setFocusDate(cell.date)}
                    {...({ onKeyDown: (e: { key?: string; preventDefault?: () => void }) => onKey(e, cell.date) } as object)}
                    accessibilityLabel={label}
                    accessibilityState={{ selected: isSelected, disabled, busy: loading }}
                    style={({ pressed }) => [
                      styles.cell,
                      {
                        backgroundColor: bg,
                        borderColor: isToday ? Accents.primary : 'transparent',
                        opacity: disabled ? 0.35 : loading ? 0.6 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    {renderDay ? (
                      renderDay({
                        date: cell.date,
                        day: parseIso(cell.date).d,
                        selected: isSelected,
                        today: isToday,
                        disabled,
                        textColor,
                      })
                    ) : (
                      <>
                        <Text style={[styles.dayNum, { color: textColor, fontWeight: isToday ? '800' : '600' }]}>
                          {parseIso(cell.date).d}
                        </Text>
                        <View style={styles.dots}>
                          {(display?.dots ?? []).slice(0, 3).map((c, i) => (
                            <View
                              key={i}
                              style={[
                                styles.dot,
                                { backgroundColor: c },
                                isSelected && { borderWidth: 1, borderColor: onAccent(Accents.primary) },
                              ]}
                            />
                          ))}
                        </View>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function defaultFocus(month: string, today: string, selected: ReadonlySet<string>): string {
  for (const d of selected) if (monthOf(d) === month) return d;
  return monthOf(today) === month ? today : firstOfMonth(month);
}

function NavButton({
  icon,
  label,
  disabled,
  onPress,
  color,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  disabled: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.navBtn, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center', minWidth: 0 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { ...Type.bodyBold, fontSize: 13 },
  weekRow: { flexDirection: 'row' },
  cellBox: { flex: 1, minWidth: 0, height: 52, alignItems: 'center', justifyContent: 'center', padding: 1 },
  weekday: { ...Type.bodySemi, fontSize: 12 },
  cell: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayNum: { ...Type.bodySemi, fontSize: 15 },
  dots: { flexDirection: 'row', gap: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
