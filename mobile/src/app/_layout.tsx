import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { useAppFonts } from '@/hooks/use-app-fonts';
import { AuthProvider } from '@/state/auth';
import { ThemeProvider as AppThemeProvider, useThemePreference } from '@/state/theme';
import { ErrorBoundary } from '@/components/error-boundary';
import { ToastProvider } from '@/components/toast';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) {
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
        {Platform.OS === 'web' && (
          // Web is a PWA: the manifest + icon make "Add to Home Screen" install the app.
          // (`+html.tsx` is ignored with web.output = "single", so the tags are injected here.)
          <Head>
            <link rel="manifest" href="/manifest.json" />
            <link rel="preload" href="/fonts/Nunito_400Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
            <link rel="preload" href="/fonts/Fredoka_600SemiBold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
            <link rel="stylesheet" href="/fonts/fonts.css" />
            <link rel="apple-touch-icon" href="/icon-192.png" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-title" content="Daily Revision" />
          </Head>
        )}
        <ErrorBoundary>
          <AuthProvider>
            <ToastProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="reset-password" />
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
