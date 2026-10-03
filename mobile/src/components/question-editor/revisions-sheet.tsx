import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listRevisions } from '@/api/questions';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { Accents, Nord, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toFriendlyError } from '@/lib/friendly-error';
import { formatWhen } from '@/lib/question-editor';
import type { QuestionRevisionDto } from '@stemreach/core';

interface Props {
  visible: boolean;
  questionId: string;
  onClose: () => void;
  /** Resolves when the restore finished (caller shows toast + reloads the form). Rejects with a friendly Error to keep the sheet open. */
  onRestore: (revisionNo: number) => Promise<void>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Reads a snapshot tolerantly: the server stores the pre-edit row, key names may be DB- or API-style. */
export function snapshotText(s: Record<string, unknown>): string {
  return str(s.question_text) ?? str(s.text) ?? '(no text)';
}

export function RevisionsSheet({ visible, questionId, onClose, onRestore }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<QuestionRevisionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<QuestionRevisionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    listRevisions(questionId)
      .then((r) => setRows(r.revisions))
      .catch((e) => setError(toFriendlyError(e, 'Could not load the history.')));
  }, [questionId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const confirm = async () => {
    if (!pick) return;
    setBusy(true);
    setRestoreError(null);
    try {
      await onRestore(pick.revision_no);
      setPick(null);
      onClose();
    } catch (e) {
      setRestoreError(toFriendlyError(e, 'Could not restore that version.'));
      setPick(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close history" />
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: Accents.border }]} />
          <Text accessibilityRole="header" style={[Type.heading, styles.title, { color: theme.text }]}>
            History
          </Text>
          <Text style={[Type.body, styles.sub, { color: theme.textSecondary }]}>
            Earlier versions of this question, newest first. Restoring keeps a copy of the current version.
          </Text>
          {restoreError ? (
            <Text accessibilityRole="alert" style={[Type.bodySemi, { color: theme.dangerText, marginTop: 8 }]}>
              {restoreError}
            </Text>
          ) : null}
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : rows == null ? (
            <ActivityIndicator style={{ margin: 32 }} color={Accents.primary} accessibilityLabel="Loading history" />
          ) : rows.length === 0 ? (
            <Text style={[Type.body, styles.empty, { color: theme.textSecondary }]}>No earlier versions yet. Edits are recorded here.</Text>
          ) : (
            <ScrollView style={{ marginTop: 8 }}>
              {rows.map((r) => (
                <View key={r.revision_no} style={[styles.item, { borderColor: Accents.border, backgroundColor: theme.backgroundElement }]}>
                  <Text style={[Type.bodyBold, { color: theme.textSecondary, fontSize: 12 }]}>
                    Version {r.revision_no} - {formatWhen(r.edited_at)}
                  </Text>
                  <Text numberOfLines={3} style={[Type.body, { color: theme.text, fontSize: 14 }]}>
                    {snapshotText(r.snapshot)}
                  </Text>
                  <Pressable
                    onPress={() => setPick(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore version ${r.revision_no}`}
                    style={({ pressed }) => [styles.restore, { borderColor: Accents.primary }, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[Type.bodyBold, { color: theme.primaryText }]}>Restore this version</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      <ConfirmSheet
        visible={pick != null}
        title={`Restore version ${pick?.revision_no ?? ''}?`}
        message="The question goes back to that version. The current version is kept in the history."
        confirmLabel="Restore"
        loading={busy}
        onConfirm={confirm}
        onCancel={() => setPick(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: `${Nord.nord0}99` },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  title: { fontSize: 20, marginTop: 12 },
  sub: { fontSize: 13, marginTop: 4 },
  empty: { padding: 24, textAlign: 'center' },
  item: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6, marginBottom: 8 },
  restore: { minHeight: 44, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
