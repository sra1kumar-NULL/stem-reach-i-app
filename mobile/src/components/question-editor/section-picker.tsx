import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Accents, Nord, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SyllabusResponse } from '@stemreach/core';

export function sectionLabel(syllabus: SyllabusResponse | null, id: string | undefined): string | null {
  if (!syllabus || !id) return null;
  for (const ch of syllabus.chapters) {
    const s = ch.sections.find((x) => x.id === id);
    if (s) return `${ch.name} - ${s.section_no}`;
  }
  return null;
}

interface ButtonProps {
  syllabus: SyllabusResponse | null;
  value: string | undefined;
  placeholder: string;
  onPress: () => void;
  label: string;
  error?: string;
}

/** Field-like button that shows the chosen topic and opens the picker. */
export function SectionButton({ syllabus, value, placeholder, onPress, label, error }: ButtonProps) {
  const theme = useTheme();
  const text = sectionLabel(syllabus, value);
  return (
    <View style={{ gap: 4 }}>
      <Text style={[Type.bodyBold, styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text ?? placeholder}. Change`}
        style={({ pressed }) => [
          styles.button,
          { borderColor: error ? Accents.danger : Accents.border, backgroundColor: theme.backgroundElement },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text numberOfLines={1} style={[Type.bodySemi, styles.buttonText, { color: text ? theme.text : theme.textSecondary }]}>
          {text ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={[Type.body, styles.error, { color: theme.dangerText }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

interface PickerProps {
  visible: boolean;
  syllabus: SyllabusResponse | null;
  value: string | undefined;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
  /** Adds an "All topics" row that selects undefined (list filter). */
  allowAll?: boolean;
}

/** Bottom-sheet topic picker, grouped by chapter, with a search box. */
export function SectionPicker({ visible, syllabus, value, onSelect, onClose, allowAll }: PickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const chapters = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (syllabus?.chapters ?? [])
      .map((ch) => ({
        ...ch,
        sections: ch.sections.filter(
          (s) => !needle || `${ch.name} ${s.section_no} ${s.name}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((ch) => ch.sections.length > 0);
  }, [syllabus, q]);

  const pick = (id: string | undefined) => {
    onSelect(id);
    setQ('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close topic picker" />
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: Accents.border }]} />
          <Text accessibilityRole="header" style={[Type.heading, styles.title, { color: theme.text }]}>
            Choose a topic
          </Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search topics"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Search topics"
            style={[Type.body, styles.search, { color: theme.text, borderColor: Accents.border, backgroundColor: theme.backgroundElement }]}
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {allowAll ? (
              <Row label="All topics" selected={value === undefined} onPress={() => pick(undefined)} />
            ) : null}
            {chapters.map((ch) => (
              <View key={ch.id} style={{ marginTop: 8 }}>
                <Text style={[Type.bodyBold, styles.chapter, { color: theme.textSecondary }]} accessibilityRole="header">
                  {ch.name}
                </Text>
                {ch.sections.map((s) => (
                  <Row
                    key={s.id}
                    label={`${s.section_no}  ${s.name}`}
                    hint={`${s.question_count} questions`}
                    selected={s.id === value}
                    onPress={() => pick(s.id)}
                  />
                ))}
              </View>
            ))}
            {chapters.length === 0 ? (
              <Text style={[Type.body, { color: theme.textSecondary, padding: 16 }]}>No topics match your search.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => [styles.row, selected && { backgroundColor: Accents.primarySoft }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[Type.bodySemi, { color: theme.text }]}>{label}</Text>
        {hint ? <Text style={[Type.body, styles.hint, { color: theme.textSecondary }]}>{hint}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={theme.primaryText} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: `${Nord.nord0}99` },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  title: { fontSize: 20, marginTop: 12, marginBottom: 8 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  list: { marginTop: 8 },
  chapter: { fontSize: 13, paddingVertical: 4 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  hint: { fontSize: 12 },
  fieldLabel: { fontSize: 13 },
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  buttonText: { flex: 1, fontSize: 15 },
  error: { fontSize: 12 },
});
