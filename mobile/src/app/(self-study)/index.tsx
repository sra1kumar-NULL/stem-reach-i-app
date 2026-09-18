import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';
import { getSelfStudyDb, LocalDeck } from '@/lib/self-study-db';

export default function DecksScreen() {
  const [decks, setDecks] = useState<LocalDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const loadDecks = async () => {
    try {
      const db = await getSelfStudyDb();
      const res = await db.getAllAsync<LocalDeck>(
        'SELECT * FROM local_decks ORDER BY created_at DESC'
      );
      setDecks(res);
    } catch (e) {
      console.error('Failed to query SQLite decks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDecks();
  }, []);

  const handleCreateDeck = async () => {
    if (!title.trim()) return;
    const newDeckId = `deck-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];

    try {
      const db = await getSelfStudyDb();
      await db.runAsync(
        'INSERT INTO local_decks (id, title, description, created_at) VALUES (?, ?, ?, ?)',
        [newDeckId, title.trim(), description.trim(), today]
      );

      // Seed starter card so deck isn't empty on review
      await db.runAsync(
        'INSERT INTO local_cards (id, deck_id, front, back, interval, repetition, ease_factor, due_date) VALUES (?, ?, ?, ?, 0, 0, 2.5, ?)',
        [
          `card-${Date.now()}`,
          newDeckId,
          `Welcome to ${title.trim()}`,
          'This is your first card! Edit or add more cards in this deck.',
          today,
        ]
      );

      setTitle('');
      setDescription('');
      setModalVisible(false);
      await loadDecks();
    } catch (e) {
      console.error('Failed to create deck in SQLite:', e);
    }
  };

  const handleBackToMain = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={Accents.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* Header Action Bar */}
        <View style={styles.header}>
          <ThemedText type="title">Self-Study Decks</ThemedText>
          <Pressable style={styles.createBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.createBtnText}>+ New Deck</Text>
          </Pressable>
        </View>

        {/* Decks List */}
        <FlatList
          data={decks}
          keyExtractor={(d) => d.id}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No decks found. Tap "+ New Deck" above to create one.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.deckCard}
              onPress={() =>
                router.push({
                  pathname: '/(self-study)/review',
                  params: { deckId: item.id },
                })
              }
            >
              <ThemedText style={styles.deckTitle}>{item.title}</ThemedText>
              {item.description ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.deckDesc}>
                  {item.description}
                </ThemedText>
              ) : null}
            </Pressable>
          )}
        />

        {/* Navigation Back Button */}
        <Pressable style={styles.backBtn} onPress={handleBackToMain}>
          <Text style={styles.backBtnText}>← Back to Main</Text>
        </Pressable>

        {/* Modal for Creating Deck directly on Mobile */}
        <Modal visible={modalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Create New Deck</Text>

              <TextInput
                style={styles.input}
                placeholder="Deck Title"
                placeholderTextColor={Nord.nord4}
                value={title}
                onChangeText={setTitle}
              />

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description (Optional)"
                placeholderTextColor={Nord.nord4}
                multiline
                value={description}
                onChangeText={setDescription}
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleCreateDeck}>
                  <Text style={styles.btnText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  safe: { flex: 1, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  empty: { marginTop: 40, textAlign: 'center' },
  deckCard: {
    backgroundColor: Nord.nord1,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Accents.border,
  },
  deckTitle: { fontSize: 18, fontWeight: '700', color: Nord.nord6 },
  deckDesc: { marginTop: 4 },
  createBtn: {
    backgroundColor: Accents.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: { color: Nord.nord6, fontWeight: '700' },
  backBtn: { padding: 14, alignItems: 'center', marginBottom: 10 },
  backBtnText: { color: Nord.nord4, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Nord.nord1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: { color: Nord.nord6, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  input: {
    backgroundColor: Nord.nord2,
    color: Nord.nord6,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { padding: 10 },
  saveBtn: {
    backgroundColor: Accents.success,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: { color: Nord.nord6, fontWeight: '600' },
});
