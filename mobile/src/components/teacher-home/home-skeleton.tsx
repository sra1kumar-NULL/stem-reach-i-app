import { View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';

export function HomeSkeleton() {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading topics" accessibilityRole="progressbar">
      <Skeleton className="h-6 w-2/3 rounded-lg" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" className="h-16 w-full rounded-2xl" />
      ))}
      <Skeleton className="mt-2 h-6 w-1/2 rounded-lg" />
      {[4, 5].map((i) => (
        <Skeleton key={i} variant="rounded" className="h-16 w-full rounded-2xl" />
      ))}
    </View>
  );
}
