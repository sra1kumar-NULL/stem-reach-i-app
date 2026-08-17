import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { Accents } from '@/constants/theme';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [anim]);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, kind });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 70 }).start();
      timer.current = setTimeout(hide, 3200);
    },
    [anim, hide],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            toast.kind === 'success' && styles.success,
            toast.kind === 'error' && styles.error,
            toast.kind === 'info' && styles.info,
            {
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            },
          ]}
        >
          <Text style={styles.emoji}>{toast.kind === 'success' ? '🎉' : toast.kind === 'error' ? '😅' : '💡'}</Text>
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  success: { backgroundColor: '#0e1a10', borderColor: Accents.success },
  error: { backgroundColor: '#1c0e0e', borderColor: Accents.danger },
  info: { backgroundColor: '#10141c', borderColor: Accents.primary },
  emoji: { fontSize: 20 },
  text: { color: '#fff', fontWeight: '600', fontSize: 14, flexShrink: 1 },
});
