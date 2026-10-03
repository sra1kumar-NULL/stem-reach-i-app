import { resolveOwnerId } from '@/lib/self-study-owner';
import { useAuth } from '@/state/auth';

/**
 * Owner id for local self-study decks: the signed-in user's id, 'offline' for
 * the no-account "Study offline" mode, or `undefined` while the session is
 * still being restored (screens wait instead of flashing another owner's decks).
 */
export function useSelfStudyOwner(): string | undefined {
  const { session, loading } = useAuth();
  return resolveOwnerId({ loading, userId: session?.user?.id });
}
