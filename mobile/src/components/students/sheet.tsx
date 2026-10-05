import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Nord } from '@/constants/theme';

const SCRIM = `${Nord.nord0}99`;

/** Keyboard-safe bottom sheet shell. Children are unmounted when hidden, so their state resets. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType={reducedMotion ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Pressable style={[styles.backdrop, { backgroundColor: SCRIM }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
          contentContainerStyle={styles.body}
        >
          <Box className="rounded-t-3xl bg-card px-5 pt-3 gap-4" style={{ paddingBottom: insets.bottom + 20 }}>
            <Box className="self-center bg-border" style={styles.grabber} />
            {children}
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scroll: { flexGrow: 0, maxHeight: '92%' },
  body: { flexGrow: 1, justifyContent: 'flex-end' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
