import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, Type } from '@/constants/theme';

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
      <Box className="flex-1 items-center justify-center p-8 gap-4 bg-background">
        <Text style={styles.emoji}>😵‍💫</Text>
        <Heading className="text-center text-2xl" style={Type.heading}>
          Oops! Something went wrong
        </Heading>
        <UIText className="text-muted-foreground text-center" style={Type.body}>
          Don&apos;t worry — tap below to get back on track.
        </UIText>
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </Box>
    );
  }
}

const styles = StyleSheet.create({
  emoji: { fontSize: 56 },
  button: { backgroundColor: Accents.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  buttonLabel: { color: Nord.nord6, fontWeight: '700', fontSize: 16 },
});