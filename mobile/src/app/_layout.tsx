import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/state/auth';
import { ToastProvider } from '@/components/toast';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(teacher)" />
        </Stack>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
