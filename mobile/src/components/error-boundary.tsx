import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Nord } from '@/constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Friendly fallback for unexpected render crashes — no white screens. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error == null) return this.props.children;

    return (
      <ThemedView style={styles.container}>
        <Text style={styles.emoji}>😵‍💫</Text>
        <ThemedText type="title" style={styles.title}>
          Oops! Something went wrong
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          Don't worry — tap below to get back on track.
        </ThemedText>
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </ThemedView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emoji: { fontSize: 56 },
  title: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  body: { textAlign: 'center' },
  button: { backgroundColor: Accents.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  buttonLabel: { color: Nord.nord6, fontWeight: '700', fontSize: 16 },
});