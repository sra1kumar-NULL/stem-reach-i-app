/**
 * FormSheet — bottom-sheet container for forms and pickers (teacher-extras).
 * Same Modal approach as ConfirmSheet (layers above tab bars, Android back key,
 * slide/fade) plus a keyboard-avoiding, scrollable body so inputs stay visible.
 */
import { type JSX, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Nord, Type } from '@/constants/theme';

const SCRIM = `${Nord.nord0}99`;

export interface FormSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body (primary / cancel buttons). */
  footer?: ReactNode;
  /** Blocks close gestures while a request is running. */
  busy?: boolean;
}

export function FormSheet({ visible, title, onClose, children, footer, busy = false }: FormSheetProps): JSX.Element | null {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  if (!visible) return null;
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal visible transparent animationType={reducedMotion ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: SCRIM }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Box className="rounded-t-3xl bg-card px-5 pt-3" style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Box className="self-center bg-border" style={styles.grabber} />
          <Heading accessibilityRole="header" style={[Type.heading, styles.title]}>
            {title}
          </Heading>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Box>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  title: { marginTop: 12, marginBottom: 8 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12, paddingBottom: 8 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 12 },
});
