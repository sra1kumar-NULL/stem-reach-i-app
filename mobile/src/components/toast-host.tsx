import type { ReactNode } from 'react';

/** Native: render in place (a native Modal would swallow touches). See toast.tsx. */
export function ToastHost({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
