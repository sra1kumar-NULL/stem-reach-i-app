import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { ConfirmSheet } from '@/components/confirm-sheet';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import { useAuth } from '@/state/auth';

/** Auth gate: signed-in users go to their role home; everyone else to /login. */
export default function Index() {
  const { session, me, loading, meStatus, retryMe } = useAuth();
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;

  // A teacher reset this account's password: the API refuses everything else until
  // a new one is chosen, so this check comes before role routing (and before `me` loads).
  if (session.user.app_metadata?.must_change_password === true) return <Redirect href="/change-password" />;

  if (me) {
    return <Redirect href={me.profile.role === 'teacher' ? '/(teacher)' : '/(student)'} />;
  }

  // Signed in, but the profile fetch hasn't resolved yet — wait for it. Redirecting
  // to /login here used to bounce signed-in users into an empty login form whenever
  // getMe was slow (API cold start) or temporarily failed.
  if (meStatus === 'error') {
    return (
      <Box className="flex-1 items-center justify-center bg-background px-8 gap-4">
        <Text className="text-center text-muted-foreground">
          Couldn&apos;t load your profile. The server may still be starting up.
        </Text>
        <Button variant="default" onPress={() => retryMe()}>
          <ButtonText>Try again</ButtonText>
        </Button>
        <Button variant="outline" onPress={openConfirm}>
          <ButtonText>Sign out</ButtonText>
        </Button>
        <ConfirmSheet
          visible={confirmOut}
          title="Sign out?"
          message="You'll need to sign in again to continue."
          confirmLabel="Sign out"
          loading={signingOut}
          onConfirm={confirmSignOut}
          onCancel={closeConfirm}
        />
      </Box>
    );
  }

  // idle / loading: the profile fetch is in flight
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
