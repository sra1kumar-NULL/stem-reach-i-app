import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/toast-host';
import { Accents, Type } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Gap between the toast and the bottom safe-area edge: clears the ~64 pt tab bar. */
const BOTTOM_OFFSET = 76;
/** Above RN-web's Modal portal (sheets), which sits at z-index 9999. */
const WEB_Z_INDEX = 100000;

/** Long messages stay readable longer; errors linger a little more. */
function durationFor(message: string, kind: ToastKind): number {
  const base = kind === 'error' ? 5000 : 3200;
  return Math.min(8000, base + message.length * 30);
}

/**
 * One toast at a time (a new one replaces the current). Anchored above the
 * bottom tab bar / safe area so it never covers headers or form errors, and
 * announced to assistive tech through a persistent polite live region.
 * On web it is `position: fixed`, portaled to <body> above the sheets' portal; on native it renders
 * in the root view (a native Modal would swallow touches), so a toast raised
 * while a native sheet is open appears beneath that sheet - close the sheet first.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: reducedMotion ? 0 : 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [anim, reducedMotion]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
      setToast({ id: seq.current, message, kind });
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
      if (reducedMotion) {
        anim.stopAnimation();
        Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      } else {
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70 }).start();
      }
      timer.current = setTimeout(hide, durationFor(message, kind));
    },
    [anim, hide, reducedMotion],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  const wrap: ViewStyle = {
    bottom: insets.bottom + BOTTOM_OFFSET,
    ...(Platform.OS === 'web' ? ({ position: 'fixed', zIndex: WEB_Z_INDEX } as unknown as ViewStyle) : null),
  };
  const iconColor =
    toast?.kind === 'success' ? Accents.success : toast?.kind === 'error' ? Accents.danger : theme.primaryText;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The live region stays mounted so screen readers see the text *change*. */}
      <ToastHost>
      <View
        pointerEvents="none"
        style={[styles.wrap, wrap]}
        role="status"
        accessibilityLiveRegion="polite"
        accessible={false}
      >
        {toast ? (
          <Animated.View
            key={toast.id}
            style={[
              styles.toast,
              { backgroundColor: theme.backgroundElement, borderColor: toast.kind === 'info' ? theme.primaryText : iconColor },
              {
                opacity: anim,
                transform: reducedMotion
                  ? []
                  : [
                      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                    ],
              },
            ]}
          >
            <Ionicons
              name={toast.kind === 'success' ? 'checkmark-circle' : toast.kind === 'error' ? 'alert-circle' : 'information-circle'}
              size={22}
              color={iconColor}
              accessible={false}
            />
            <Text style={[Type.bodySemi, styles.text, { color: theme.text }]}>{toast.message}</Text>
          </Animated.View>
        ) : null}
      </View>
      </ToastHost>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
  text: { fontSize: 14, flexShrink: 1 },
});
