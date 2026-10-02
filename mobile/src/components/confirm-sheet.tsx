/**
 * ConfirmSheet — bottom-sheet confirmation for irreversible actions (sign-out).
 *
 * The caller owns `loading`: the confirm button locks on the first tap and
 * re-arms only when `loading` returns to false or the sheet is hidden, so the
 * action can never be double-fired. Cancel — the cancel button, the backdrop
 * tap and the Android hardware back key — is suppressed while `loading`.
 *
 * Built on React Native's `Modal` rather than an absolutely-positioned overlay:
 * a native modal window always layers above the screen (header, tab bar, FAB),
 * reports modal semantics to assistive tech, and supplies the Android
 * `onRequestClose` back-key contract plus slide/fade animation natively — no
 * zIndex/elevation, BackHandler or animation-lifecycle code to maintain.
 */
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';

export interface ConfirmSheetProps {
  /** Toggles the sheet; returning it to `false` re-arms the confirm button. */
  visible: boolean;
  title: string;
  message?: string;
  /** Shown and spoken verbatim — e.g. "Sign out". Default: "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** True while the caller's confirmed action is running. */
  loading?: boolean;
  /** Called once per tap, after the confirm button locks. */
  onConfirm: () => void;
  /** Backdrop tap, cancel button and Android back — suppressed while `loading`. */
  onCancel: () => void;
}

/** Nord Polar Night scrim (nord0 @ 60%) — reads the same in light and dark. */
const SCRIM = `${Nord.nord0}99`;

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): JSX.Element | null {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // `confirmReady` is the visible half of the lock (spinner + disabled button
  // from the first tap); the ref closes the same-frame gap before React
  // re-renders, so a double tap can never reach `onConfirm` twice.
  const [confirmReady, setConfirmReady] = useState(true);
  const confirmReadyRef = useRef(true);

  const busy = loading || !confirmReady;

  // The caller flips `loading` inside `onConfirm`; when it clears, the action
  // is finished and the button may be used again.
  useEffect(() => {
    if (loading) return;
    setConfirmReady(true);
    confirmReadyRef.current = true;
  }, [loading]);

  // Hiding the sheet (cancel, backdrop, hardware back, parent-driven) always
  // re-arms it for the next open.
  useEffect(() => {
    if (visible) return;
    setConfirmReady(true);
    confirmReadyRef.current = true;
  }, [visible]);

  // Announce the loading transition — `accessibilityState.busy` alone is not
  // read out by every screen reader.
  useEffect(() => {
    if (!visible || !loading) return;
    AccessibilityInfo.announceForAccessibility(`${confirmLabel} in progress`);
  }, [visible, loading, confirmLabel]);

  const handleConfirm = useCallback(() => {
    if (busy || !confirmReadyRef.current) return;
    confirmReadyRef.current = false;
    setConfirmReady(false);
    onConfirm();
  }, [busy, onConfirm]);

  // Suppressed while `loading` only; the pending gap before the caller sets
  // `loading` stays cancelable so the sheet can never trap the user.
  const handleCancel = useCallback(() => {
    if (loading) return;
    onCancel();
  }, [loading, onCancel]);

  if (!visible) return null;

  const animationType = reducedMotion ? 'fade' : 'slide';

  return (
    <Modal visible={visible} transparent animationType={animationType} statusBarTranslucent onRequestClose={handleCancel}>
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: SCRIM }]}
          disabled={loading}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <Box className="rounded-t-3xl bg-card px-6 pt-3" style={{ paddingBottom: insets.bottom + 24 }}>
          <Box className="self-center bg-border" style={styles.grabber} />

          <Heading accessibilityRole="header" style={[Type.heading, styles.title]}>
            {title}
          </Heading>

          {message ? (
            <UIText className="text-sm text-muted-foreground" style={[Type.body, styles.message]}>
              {message}
            </UIText>
          ) : null}

          <View style={styles.actions}>
            <Button
              variant="outline"
              className={`min-h-11 flex-1 rounded-2xl ${loading ? 'opacity-50' : ''}`}
              disabled={loading}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <ButtonText style={Type.bodyBold}>{cancelLabel}</ButtonText>
            </Button>

            <Button
              variant="default"
              className={`min-h-11 flex-1 rounded-2xl ${busy ? 'opacity-50' : ''}`}
              disabled={busy}
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: busy, busy }}
            >
              {busy ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
              <ButtonText style={Type.bodyBold}>{confirmLabel}</ButtonText>
            </Button>
          </View>
        </Box>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  title: { marginTop: 12 },
  message: { marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
});
