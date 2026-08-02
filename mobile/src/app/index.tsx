import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/state/auth';

/** Auth gate: signed-in users go to their role home; everyone else to /login. */
export default function Index() {
  const { session, me, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!me) return <Redirect href="/login" />;

  return <Redirect href={me.profile.role === 'teacher' ? '/(teacher)' : '/(student)'} />;
}
