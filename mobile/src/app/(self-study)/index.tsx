import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSelfStudyDb, type LocalDeck } from '@/lib/self-study-db';

/** Nord Polar Night scrim (nord0 @ 60%) — reads the same in light and dark (confirm-sheet idiom). */
const SCRIM = `${Nord.nord0}99`;

interface DeckRow extends LocalDeck {
  /** Cards whose due_date is today or earlier. */
  due: number;
}

/**
 * Self-study home: the deck list (the PR2 stub and its missing `/decks`
 * route merged into one screen). 100% local SQLite — no API client, no auth
 * gate inside the group.
 */
export default function SelfStudyScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  /** Inline create failure — the toast renders behind the RN Modal's window, so modal errors must be in-modal. */
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const db = await getSelfStudyDb();
        const rows = await db.getAllAsync<LocalDeck>(
          'SELECT id, title, description, created_at FROM local_decks ORDER BY created_at DESC',
        );
        const today = new Date().toISOString().slice(0, 10);
        const dueRows = await db.getAllAsync<{ deck_id: string; due: number }>(
          'SELECT deck_id, COUNT(*) AS due FROM local_cards WHERE due_date <= ? GROUP BY deck_id',
          [today],
        );
        const dueByDeck = new Map(dueRows.map((d) => [d.deck_id, d.due]));
        setDecks(rows.map((row) => ({ ...row, due: dueByDeck.get(row.id) ?? 0 })));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed to load decks');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reload on every focus so due-counts stay fresh after a review session.
  useFocusEffect(useCallback(() => load(), [load]));

  const openCreate = () => {
    setTitle('');
    setDescription('');
    setCreateError(null);
    setModalVisible(true);
  };

  const handleCreateDeck = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setCreateError(null);
    try {
      const db = await getSelfStudyDb();
      const deckId = `deck-${Date.now()}`;
      const today = new Date().toISOString().slice(0, 10);
      await db.runAsync(
        'INSERT INTO local_decks (id, title, description, created_at) VALUES (?, ?, ?, ?)',
        [deckId, trimmedTitle, description.trim() || null, today],
      );
      // Seed a starter card so a fresh deck is never empty on review.
      await db.runAsync(
        'INSERT INTO local_cards (id, deck_id, front, back, interval, repetition, ease_factor, due_date) VALUES (?, ?, ?, ?, 0, 0, 2.5, ?)',
        [
          `card-${Date.now()}`,
          deckId,
          `Welcome to ${trimmedTitle}`,
          'Tap Show Answer, then grade yourself with Again, Hard, Good, or Easy — your next review date follows your grade.',
          today,
        ],
      );
      setModalVisible(false);
      showToast('Deck created');
      load();
    } catch (e) {
      // In-modal: the toast mounts in the root window, behind this Modal's
      // own Android window, so a toast-only failure is invisible to the user.
      setCreateError(e instanceof Error ? e.message : 'failed to create deck');
      showToast(e instanceof Error ? e.message : 'failed to create deck', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <Heading accessibilityRole="header" className="text-2xl" style={Type.heading}>
            Self Study
          </Heading>
          <View style={styles.headerActions}>
            <Button
              variant="outline"
              className="min-h-11 rounded-xl px-3.5"
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Create a new deck"
            >
              <ButtonText style={Type.bodyBold}>+ New Deck</ButtonText>
            </Button>
            <ThemeToggle />
          </View>
        </View>

        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          Create and review your own flashcard decks.
        </UIText>

        {loading ? (
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <Box className="items-center gap-3 p-6">
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              {error}
            </UIText>
            <Button variant="default" className="min-h-11 rounded-xl" onPress={load} accessibilityRole="button">
              <ButtonText style={Type.bodyBold}>Retry</ButtonText>
            </Button>
          </Box>
        ) : (
          <FlatList
            data={decks}
            keyExtractor={(deck) => deck.id}
            contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
            ListEmptyComponent={
              <Box className="items-center gap-4 p-6">
                <Text style={{ fontSize: 56 }}>📚</Text>
                <Heading className="text-center text-2xl" style={Type.heading}>
                  No decks yet
                </Heading>
                <UIText className="text-muted-foreground text-center" style={Type.body}>
                  Create your first deck to start studying — it lives on this device, no account needed.
                </UIText>
                <Button variant="default" className="min-h-11 rounded-xl" onPress={openCreate} accessibilityRole="button">
                  <ButtonText style={Type.bodyBold}>+ New Deck</ButtonText>
                </Button>
              </Box>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/(self-study)/review', params: { deckId: item.id } })}
                style={({ pressed }) => (pressed ? styles.rowPressed : null)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.due} due`}
                className="min-h-11 flex-row items-center gap-3 rounded-2xl bg-card p-3"
              >
                <Box className="flex-1 gap-0.5">
                  <UIText className="text-foreground" style={Type.bodySemi}>
                    {item.title}
                  </UIText>
                  {item.description ? (
                    <UIText className="text-xs text-muted-foreground" style={Type.body}>
                      {item.description}
                    </UIText>
                  ) : null}
                </Box>
                <Box className="rounded-full bg-primary-soft px-2.5 py-1">
                  <UIText className="text-xs font-bold text-primary-text" style={Type.bodyBold}>
                    {item.due} due
                  </UIText>
                </Box>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          />
        )}

        <Modal
          visible={modalVisible}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={[styles.scrim, { backgroundColor: SCRIM }]}
              onPress={() => setModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Box className="gap-3 rounded-3xl bg-card p-5">
                <Heading accessibilityRole="header" className="text-xl" style={Type.heading}>
                  Create New Deck
                </Heading>

                <Input className="border border-border rounded-xl bg-background">
                  <InputField
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Deck title"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="words"
                    className="px-4 py-3 text-base"
                    style={{ color: theme.text, fontFamily: Fonts.sans }}
                  />
                </Input>

                <Input className="border border-border rounded-xl bg-background">
                  <InputField
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description (optional)"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    className="px-4 py-3 text-base"
                    style={{ color: theme.text, fontFamily: Fonts.sans, minHeight: 80, textAlignVertical: 'top' }}
                  />
                </Input>

                {createError ? (
                  <UIText
                    accessibilityRole="alert"
                    className="text-sm"
                    style={{ ...Type.body, color: Accents.danger }}
                  >
                    {createError}
                  </UIText>
                ) : null}

                <View style={styles.modalActions}>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 rounded-2xl"
                    onPress={() => setModalVisible(false)}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
                  </Button>
                  <Button
                    variant="default"
                    className={`min-h-11 flex-1 rounded-2xl ${saving || !title.trim() ? 'opacity-50' : ''}`}
                    onPress={handleCreateDeck}
                    disabled={saving || !title.trim()}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving }}
                  >
                    {saving ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
                    <ButtonText style={Type.bodyBold}>Save</ButtonText>
                  </Button>
                </View>
              </Box>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowPressed: { opacity: 0.7 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 20 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
