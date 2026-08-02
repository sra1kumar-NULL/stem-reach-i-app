import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activate, getActivations, getSyllabus } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/state/auth';
import type { SyllabusResponse } from '@stemreach/core';

export default function ActivateScreen() {
  const { signOut } = useAuth();
  const [syllabus, setSyllabus] = useState<SyllabusResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [todaySections, setTodaySections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getSyllabus(), getActivations()])
      .then(([s, act]) => {
        setSyllabus(s);
        const active = new Set(act.sections.map((x) => x.id));
        setTodaySections(active);
        setSelected(new Set(active));
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : 'failed to load'));
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
      setMessage('Select at least one section');
      return;
    }
    setBusy(true);
    try {
      const res = await activate({ section_ids: [...selected] });
      setMessage(`Activated for ${res.date}: ${res.sections.length} section(s) — ${res.sections.reduce((n, s) => n + s.question_count, 0)} questions`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'activation failed');
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
          <Pressable onPress={signOut}>
            <ThemedText themeColor="textSecondary">Sign out</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          Mark the sections you taught today, then activate. Students' feeds update instantly.
        </ThemedText>

        {message && (
          <ThemedView type="backgroundElement" style={styles.messageBox}>
            <ThemedText type="small">{message}</ThemedText>
          </ThemedView>
        )}

        {syllabus == null ? (
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
                  <ThemedText style={styles.rowLabel}>
                    {item.chapter} — {item.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.count} Qs{wasToday && !isOn ? ' · was active' : ''}
                  </ThemedText>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}

        <ThemedView style={styles.footer}>
          <ThemedText type="smallBold">{selected.size} selected</ThemedText>
          <Pressable style={[styles.activateBtn, (busy || selected.size === 0) && styles.activateDisabled]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.activateLabel}>Activate Revision</Text>}
          </Pressable>
          <ThemedView style={styles.navRow}>
            <Link href="/(teacher)/participation" style={styles.navLink}>
              <ThemedText style={styles.navText}>Participation</ThemedText>
            </Link>
            <Link href="/(teacher)/reports" style={styles.navLink}>
              <ThemedText style={styles.navText}>Performance</ThemedText>
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
  messageBox: { borderRadius: 12, padding: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowOn: { borderColor: '#3c87f7', backgroundColor: 'rgba(60, 135, 247, 0.12)' },
  rowLabel: { flexShrink: 1, paddingRight: 8 },
  footer: { gap: 8, paddingVertical: 8 },
  activateBtn: { backgroundColor: '#3c87f7', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  activateDisabled: { opacity: 0.5 },
  activateLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-around' },
  navLink: { padding: 8 },
  navText: { color: '#3c87f7', fontWeight: '700', fontSize: 15 },
});
