import { useFonts as useFredoka, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { useFonts as useNunito, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { AuthProvider } from '@/state/auth';
import { ThemeProvider as AppThemeProvider, useThemePreference } from '@/state/theme';
import { ErrorBoundary } from '@/components/error-boundary';
import { ToastProvider } from '@/components/toast';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';

export default function RootLayout() {
  const [fredokaLoaded] = useFredoka({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const [nunitoLoaded] = useNunito({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  if (!fredokaLoaded || !nunitoLoaded) {
    return null; // keep the native splash screen until fonts are ready
  }

  return (
    <SafeAreaListener
      onChange={({ insets }) => {
        Uniwind.updateInsets(insets);
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider>
          <AppShell />
        </AppThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaListener>
  );
}

/**
 * Reads the theme preference once so every theme consumer is driven by the
 * same state: GluestackUIProvider (which calls `Uniwind.setTheme(mode)` —
 * 'system' is passed through so uniwind keeps following device changes live),
 * the expo-router navigation theme, and `useTheme()` token colors.
 */
function AppShell() {
  const { preference, resolvedTheme } = useThemePreference();

  return (
    <GluestackUIProvider mode={preference}>
      <ThemeProvider value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        <ErrorBoundary>
          <AuthProvider>
            <ToastProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
                <Stack.Screen name="(student)" />
                <Stack.Screen name="(teacher)" />
                <Stack.Screen name="(self-study)" />
              </Stack>
            </ToastProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
