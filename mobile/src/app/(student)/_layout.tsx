import { Redirect, Stack } from 'expo-router';

import { useRouteGuard } from '@/hooks/use-route-guard';
import { LoadingScreen } from '@/components/ui/loading-screen';

export default function StudentLayout() {
  const { redirect, pending } = useRouteGuard();
  if (redirect) return <Redirect href={redirect} />;
  if (pending) {
    return <LoadingScreen />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
