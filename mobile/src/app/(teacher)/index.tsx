import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activate, getActivations, getSyllabus } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { Accents } from '@/constants/theme';
import { useAuth } from '@/state/auth';
import type { SyllabusResponse } from '@stemreach/core';

export default function ActivateScreen() {
  const { signOut } = useAuth();
  const { showToast } = useToast();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [todaySections, setTodaySections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressScale = useRef(new Animated.Value(1)).current;

  const load = useCallback(() => {
    setError(null);
    Promise.all([getSyllabus(), getActivations()])
      .then(([s, act]) => {
        setSyllabus(s);
        const active = new Set(act.sections.map((x) => x.id));
        setTodaySections(active);
        setSelected(new Set(active));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'failed to load'));
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

  const save = async () => {
    if (selected.size === 0) {
      showToast('Select at least one section', 'info');
      return;
    }
    setBusy(true);
    Animated.sequence([
      Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true, speed: 30 }),
      Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    try {
      const res = await activate({ section_ids: [...selected] });
      const total = res.sections.reduce((n, s) => n + s.question_count, 0);
      showToast(`Revision activated for ${res.date} — ${res.sections.length} section(s), ${total} questions!`);
      setTodaySections(new Set(res.sections.map((s) => s.id)));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'activation failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rows: { id: string; label: string; count: number; chapter: string }[] = [];
  for (const ch of syllabus?.chapters ?? []) {
    for (const s of ch.sections) {
      rows.push({ id: s.id, label: s.section_no, count: s.enabled_question_count, chapter: ch.name });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ThemedView style={styles.headerRow}>
          <ThemedText type="title" style={styles.header}>
            Today's Revision
          </ThemedText>
          <Pressable
            onPress={() => signOut()}
            style={({ pressed }) => [styles.signoutBtn, pressed && styles.pressed]}
          >
            <Text style={styles.signoutText}>⏻ Sign out</Text>
          </Pressable>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          Mark the sections you taught today, then activate. Students' feeds update instantly. ✨
        </ThemedText>

        {error && (
          <ThemedView type="backgroundElement" style={styles.messageBox}>
            <ThemedText type="small">{error}</ThemedText>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          </ThemedView>
        )}

        {syllabus == null && !error ? (
          <ActivityIndicator size="large" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => {
              const isOn = selected.has(item.id);
              const wasToday = todaySections.has(item.id);
              return (
                <Pressable onPress={() => toggle(item.id)} style={[styles.row, isOn && styles.rowOn]}>
                  <ThemedView style={[styles.dot, { backgroundColor: isOn ? Accents.success : '#555' }]} />
                  <ThemedView style={styles.rowBody}>
                    <ThemedText style={styles.rowLabel}>
                      {item.chapter} — {item.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.count} questions{wasToday && !isOn ? ' · was active today' : ''}
                    </ThemedText>
                  </ThemedView>
                  <Text style={styles.check}>{isOn ? '✓' : ''}</Text>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}

        <ThemedView style={styles.footer}>
          <ThemedText type="smallBold">
            {selected.size} selected · {rows.filter((r) => selected.has(r.id)).reduce((n, r) => n + r.count, 0)} questions
          </ThemedText>
          <Pressable style={[styles.activateBtn, (busy || selected.size === 0) && styles.activateDisabled]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.activateLabel}>Activate Revision 🚀</Text>}
          </Pressable>
          <ThemedView style={styles.navRow}>
            <Link href="/(teacher)/participation" style={styles.navLink}>
              <ThemedText style={styles.navText}>👥 Participation</ThemedText>
            </Link>
            <Link href="/(teacher)/reports" style={styles.navLink}>
              <ThemedText style={styles.navText}>📊 Performance</ThemedText>
            </Link>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  header: { fontSize: 28 },
  signoutBtn: { borderWidth: 1, borderColor: '#555', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  signoutText: { color: '#888', fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  messageBox: { borderRadius: 12, padding: 12, gap: 8 },
  retryBtn: { alignSelf: 'flex-start', backgroundColor: Accents.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  retryLabel: { color: '#fff', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  rowOn: { borderColor: Accents.success, backgroundColor: Accents.successSoft },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { flexShrink: 1 },
  check: { color: Accents.success, fontSize: 18, fontWeight: '800' },
  footer: { gap: 8, paddingVertical: 8 },
  activateBtn: { backgroundColor: Accents.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  activateDisabled: { opacity: 0.5 },
  activateLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-around' },
  navLink: { padding: 8 },
  navText: { color: Accents.primary, fontWeight: '700', fontSize: 15 },
});
