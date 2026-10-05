import { useEffect, useState, type ReactNode } from 'react';
// react-dom ships no types here and adding @types/react-dom would be a new dependency.
// @ts-ignore
import { createPortal } from 'react-dom';

/**
 * Web: portal the toast to <body>, the same place React Native Web's Modal portals
 * sheets to. Anything inside the app root lives in a lower stacking context than a
 * sheet, so only a body-level sibling with a higher z-index can sit above it.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-toast-host', '');
    document.body.appendChild(el);
    setNode(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  return node ? createPortal(children, node) : null;
}
