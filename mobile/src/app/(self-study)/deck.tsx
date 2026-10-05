import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, Nord, onAccent, Type } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { useSelfStudyOwner } from '@/hooks/use-self-study-owner';
import { toFriendlyError } from '@/lib/friendly-error';
import { getSelfStudyDb, newLocalId, normalizeDeckId, type LocalCard, type LocalDeck } from '@/lib/self-study-db';
import { SQL } from '@/lib/self-study-owner';
import { isLearned, localDateString } from '@/lib/sm2';

/** Nord Polar Night scrim (nord0 @ 60%) — reads the same in light and dark (confirm-sheet idiom). */
const SCRIM = `${Nord.nord0}99`;

/** Editor target: a new card, an existing card, or the deck's own title/description. */
type Editing = { mode: 'add' } | { mode: 'edit'; card: LocalCard } | { mode: 'deck' };

/** Pending destructive action awaiting ConfirmSheet. */
type Pending = { kind: 'card'; card: LocalCard } | { kind: 'deck' };

/**
 * One self-study deck: stats, its cards (add / edit / delete), deck delete,
 * and the entry into review. 100% local SQLite. `deckId` is validated here at
 * the receiving screen, like review.tsx — a bad param never reaches the DB.
 */
export default function DeckScreen() {
  const params = useLocalSearchParams<{ deckId?: string | string[] }>();
  const deckId = normalizeDeckId(params.deckId) ?? '';
  const ownerId = useSelfStudyOwner();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { showToast } = useToast();
  const [deck, setDeck] = useState<LocalDeck | null>(null);
  const [cards, setCards] = useState<LocalCard[]>([]);
  const [loading, setLoading] = useState(deckId.length > 0);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  /** Inline editor failure — the toast renders behind the RN Modal's window. */
  const [editError, setEditError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * Key of the last successful load. Reloads for that same deck/owner (after a
   * card save, on focus) run silently: flipping `loading` would swap the screen
   * for the spinner branch, which has no editor <Modal>, and unmount it mid-edit.
   */
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!deckId) {
      setLoading(false);
      return;
    }
    if (!ownerId) return; // auth still restoring
    const key = `${ownerId}:${deckId}`;
    const silent = loadedKey.current === key;
    if (!silent) setLoading(true);
    setError(null);
    (async () => {
      try {
        const db = await getSelfStudyDb();
        const row = await db.getFirstAsync<LocalDeck>(SQL.getDeck, [deckId, ownerId]);
        const rows = row ? await db.getAllAsync<LocalCard>(SQL.listCards, [deckId, ownerId]) : [];
        setDeck(row ?? null);
        setCards(rows);
        loadedKey.current = key;
      } catch (e) {
        const message = toFriendlyError(e, "Couldn't load this deck. Try again.");
        // Keep what is on screen (and the open editor) when only a refresh failed.
        if (silent) showToast(message, 'error');
        else setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [deckId, ownerId, showToast]);

  // Reload on focus so due counts are fresh after a review session.
  useFocusEffect(useCallback(() => load(), [load]));

  const today = localDateString();
  const dueCount = cards.filter((c) => c.due_date <= today).length;
  const newCount = cards.filter((c) => c.repetition === 0 && c.interval === 0).length;
  const learnedCount = cards.filter((c) => isLearned(c)).length;

  const openEditor = (target: Editing) => {
    setEditing(target);
    setFront(target.mode === 'edit' ? target.card.front : target.mode === 'deck' ? (deck?.title ?? '') : '');
    setBack(target.mode === 'edit' ? target.card.back : target.mode === 'deck' ? (deck?.description ?? '') : '');
    setEditError(null);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
  };

  // Deck description is optional; card front and back are both required.
  const canSave = front.trim().length > 0 && (editing?.mode === 'deck' || back.trim().length > 0) && !saving;

  const handleSaveCard = async () => {
    if (!editing || !canSave || !ownerId) return;
    setSaving(true);
    setEditError(null);
    try {
      const db = await getSelfStudyDb();
      if (editing.mode === 'deck') {
        await db.runAsync(SQL.updateDeck, [front.trim(), back.trim() || null, deckId, ownerId]);
        setEditing(null);
        showToast('Deck updated');
      } else if (editing.mode === 'add') {
        await db.runAsync(SQL.insertCard, [newLocalId('card'), front.trim(), back.trim(), localDateString(), deckId, ownerId]);
        // Keep the editor open for the next card — adding several in a row is the common case.
        setFront('');
        setBack('');
        showToast('Card added');
      } else {
        // Text edit only: the card keeps its SM-2 schedule.
        await db.runAsync(SQL.updateCardText, [front.trim(), back.trim(), editing.card.id, deckId, ownerId]);
        setEditing(null);
        showToast('Card updated');
      }
      load();
    } catch (e) {
      setEditError(toFriendlyError(e, "Couldn't save the card. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pending || !ownerId) return;
    setDeleting(true);
    try {
      const db = await getSelfStudyDb();
      if (pending.kind === 'card') {
        await db.runAsync(SQL.deleteCard, [pending.card.id, deckId, ownerId]);
        setPending(null);
        showToast('Card deleted');
        load();
      } else {
        // Explicit child delete: ON DELETE CASCADE needs PRAGMA foreign_keys on
        // this connection, so don't rely on it alone.
        await db.withTransactionAsync(async () => {
          await db.runAsync(SQL.deleteDeckCards, [deckId, ownerId]);
          await db.runAsync(SQL.deleteDeck, [deckId, ownerId]);
        });
        setPending(null);
        showToast('Deck deleted');
        router.replace('/(self-study)');
      }
    } catch (e) {
      setPending(null);
      showToast(toFriendlyError(e, "Couldn't delete that. Try again."), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <BackButton fallback="/(self-study)" />
      <Heading accessibilityRole="header" className="flex-1 text-2xl" style={Type.heading} numberOfLines={1}>
        {deck?.title ?? 'Deck'}
      </Heading>
      <ThemeToggle />
    </View>
  );

  if (loading) {
    return (
      <Box className="flex-1 bg-background">
        <SafeAreaView style={styles.safe}>
          {header}
          <ActivityIndicator size="large" color={Accents.primary} style={{ marginTop: 40 }} />
        </SafeAreaView>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="flex-1 bg-background">
        <SafeAreaView style={styles.safe}>
          {header}
          <ErrorState message={error} onRetry={load} />
        </SafeAreaView>
      </Box>
    );
  }

  if (!deckId || !deck) {
    return (
      <Box className="flex-1 bg-background">
        <SafeAreaView style={styles.safe}>
          {header}
          <Box className="flex-1 items-center justify-center gap-4 p-8">
            <Heading accessibilityRole="header" className="text-center text-2xl" style={Type.heading}>
              Deck not found
            </Heading>
            <UIText className="text-muted-foreground text-center" style={Type.body}>
              This deck may have been deleted. Pick a deck from the list.
            </UIText>
            <Button
              variant="default"
              className="min-h-11 rounded-xl"
              onPress={() => router.replace('/(self-study)')}
              accessibilityRole="button"
            >
              <ButtonText style={Type.bodyBold}>Back to decks</ButtonText>
            </Button>
          </Box>
        </SafeAreaView>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        {header}

        {deck.description ? (
          <UIText className="text-sm text-muted-foreground" style={Type.body}>
            {deck.description}
          </UIText>
        ) : null}

        <View style={styles.statsRow}>
          {[
            { value: cards.length, label: 'cards' },
            { value: dueCount, label: 'due today' },
            { value: newCount, label: 'new' },
            { value: learnedCount, label: 'learned' },
          ].map((chip) => (
            <Box
              key={chip.label}
              className="flex-1 items-center gap-0.5 rounded-2xl bg-card py-3"
              accessible
              accessibilityLabel={`${chip.value} ${chip.label}`}
            >
              <UIText accessible={false} className="text-xl text-primary-text" style={Type.headingBold}>
                {chip.value}
              </UIText>
              <UIText accessible={false} className="text-xs text-muted-foreground" style={Type.body}>
                {chip.label}
              </UIText>
            </Box>
          ))}
        </View>

        <View style={styles.actionsRow}>
          <Button
            variant="default"
            className={`min-h-11 flex-1 rounded-2xl ${dueCount === 0 ? 'opacity-50' : ''}`}
            onPress={() => router.push({ pathname: '/(self-study)/review', params: { deckId } })}
            disabled={dueCount === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: dueCount === 0 }}
            accessibilityLabel={dueCount === 0 ? 'Nothing due to review' : `Review ${dueCount} due cards`}
          >
            <ButtonText style={Type.bodyBold}>{dueCount === 0 ? 'Nothing due' : `Review ${dueCount} due`}</ButtonText>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1 rounded-2xl"
            onPress={() => openEditor({ mode: 'add' })}
            accessibilityRole="button"
            accessibilityLabel="Add a card"
          >
            <ButtonText style={Type.bodyBold}>+ Add card</ButtonText>
          </Button>
        </View>

        <FlatList
          data={cards}
          keyExtractor={(card) => card.id}
          contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={
            <Box className="items-center gap-3 p-6">
              <Heading className="text-center text-xl" style={Type.heading}>
                No cards yet
              </Heading>
              <UIText className="text-muted-foreground text-center" style={Type.body}>
                Add a card with a question on the front and the answer on the back.
              </UIText>
            </Box>
          }
          renderItem={({ item }) => (
            // Two sibling controls (never a button inside a button): the row opens the editor, the trash deletes.
            <Box style={styles.cardRow} className="rounded-2xl bg-card">
              <Pressable
                onPress={() => openEditor({ mode: 'edit', card: item })}
                style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Edit card: ${item.front}`}
              >
                <UIText className="text-foreground" style={Type.bodySemi} numberOfLines={2}>
                  {item.front}
                </UIText>
                <UIText className="text-xs text-muted-foreground" style={Type.body} numberOfLines={1}>
                  {item.back}
                </UIText>
                <UIText className="text-xs text-muted-foreground" style={Type.body}>
                  {item.due_date <= today ? 'Due today' : `Due ${item.due_date}`}
                </UIText>
              </Pressable>
              <Pressable
                onPress={() => setPending({ kind: 'card', card: item })}
                style={({ pressed }) => [styles.cardDelete, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Delete card: ${item.front}`}
              >
                <Ionicons name="trash-outline" size={18} color={Accents.danger} />
              </Pressable>
            </Box>
          )}
          ListFooterComponent={
            <View style={styles.footerRow}>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-xl"
                onPress={() => openEditor({ mode: 'deck' })}
                accessibilityRole="button"
                accessibilityLabel="Rename or describe this deck"
              >
                <Ionicons name="create-outline" size={16} color={Accents.primary} />
                <ButtonText className="text-primary-text" style={Type.bodyBold}>
                  Edit deck
                </ButtonText>
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-xl"
                style={{ borderColor: Accents.danger }}
                onPress={() => setPending({ kind: 'deck' })}
                accessibilityRole="button"
                accessibilityLabel="Delete this deck"
              >
                <Ionicons name="trash-outline" size={16} color={Accents.danger} />
                <ButtonText className="text-danger-text" style={Type.bodyBold}>
                  Delete deck
                </ButtonText>
              </Button>
            </View>
          }
        />

        <Modal
          visible={editing != null}
          animationType={reduceMotion ? 'none' : 'fade'}
          transparent
          statusBarTranslucent
          onRequestClose={closeEditor}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={[styles.scrim, { backgroundColor: SCRIM }]}
              onPress={closeEditor}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Box className="gap-3 rounded-3xl bg-card p-5">
                <Heading accessibilityRole="header" className="text-xl" style={Type.heading}>
                  {editing?.mode === 'deck' ? 'Edit deck' : editing?.mode === 'edit' ? 'Edit card' : 'Add card'}
                </Heading>

                <Input className="border border-border rounded-xl bg-background">
                  <InputField
                    value={front}
                    onChangeText={setFront}
                    placeholder={editing?.mode === 'deck' ? 'Deck title' : 'Front — question or prompt'}
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    className="px-4 py-3 text-base"
                    style={{ color: theme.text, fontFamily: Fonts.sans, minHeight: 64, textAlignVertical: 'top' }}
                    accessibilityLabel={editing?.mode === 'deck' ? 'Deck title' : 'Card front'}
                  />
                </Input>

                <Input className="border border-border rounded-xl bg-background">
                  <InputField
                    value={back}
                    onChangeText={setBack}
                    placeholder={editing?.mode === 'deck' ? 'Description (optional)' : 'Back — answer'}
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    className="px-4 py-3 text-base"
                    style={{ color: theme.text, fontFamily: Fonts.sans, minHeight: 80, textAlignVertical: 'top' }}
                    accessibilityLabel={editing?.mode === 'deck' ? 'Deck description, optional' : 'Card back'}
                  />
                </Input>

                {!canSave && !saving ? (
                  <UIText className="text-xs text-muted-foreground" style={Type.body}>
                    {editing?.mode === 'deck'
                      ? 'A deck needs a title.'
                      : 'Fill in both the front and the back to save this card.'}
                  </UIText>
                ) : null}

                {editError ? (
                  <UIText accessibilityRole="alert" className="text-sm" style={{ ...Type.body, color: Accents.danger }}>
                    {editError}
                  </UIText>
                ) : null}

                <View style={styles.modalActions}>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 rounded-2xl"
                    onPress={closeEditor}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <ButtonText style={Type.bodyBold}>Close</ButtonText>
                  </Button>
                  <Button
                    variant="default"
                    className={`min-h-11 flex-1 rounded-2xl ${canSave ? '' : 'opacity-50'}`}
                    onPress={handleSaveCard}
                    disabled={!canSave}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSave }}
                  >
                    {saving ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
                    <ButtonText style={Type.bodyBold}>{editing?.mode === 'add' ? 'Add' : 'Save'}</ButtonText>
                  </Button>
                </View>
              </Box>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <ConfirmSheet
          visible={pending != null}
          title={pending?.kind === 'deck' ? 'Delete this deck?' : 'Delete this card?'}
          message={
            pending?.kind === 'deck'
              ? `"${deck.title}" and all ${cards.length} card(s) will be removed from this device. This can't be undone.`
              : "The card and its review history will be removed. This can't be undone."
          }
          confirmLabel="Delete"
          destructive
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPending(null)}
        />
      </SafeAreaView>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  statsRow: { flexDirection: 'row', gap: 8 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 4 },
  cardMain: { flex: 1, minHeight: 44, gap: 2, paddingVertical: 12 },
  cardDelete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footerRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 20 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
