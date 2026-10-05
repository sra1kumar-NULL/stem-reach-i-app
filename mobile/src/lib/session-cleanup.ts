/**
 * Sign-out cleanup registry. Modules that hold per-user data in memory (caches, stores) register a
 * callback here; `signOut()` runs them all so the next user never sees the previous user's data.
 * Pure TypeScript (no React Native imports) so it is unit-testable.
 */
const callbacks = new Set<() => void>();

/** Registers `fn` to run on sign-out. Returns an unsubscribe function. */
export function onSignOut(fn: () => void): () => void {
  callbacks.add(fn);
  return () => {
    callbacks.delete(fn);
  };
}

/** Runs every registered callback; one failing callback never blocks the others. */
export function runSignOutCleanups(): void {
  for (const fn of [...callbacks]) {
    try {
      fn();
    } catch {
      // best effort
    }
  }
}
