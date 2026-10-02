import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';

export default function SelfStudyScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Self Study</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>Create and review your own flashcard decks.</ThemedText>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/(self-study)/decks')}
      >
        <ThemedText style={styles.buttonText}>Go to My Decks</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: Accents.primary,
    borderRadius: 12,
    paddingHorizontal: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: Nord.nord6,
    fontWeight: '600',
    fontSize: 18,
  },
});