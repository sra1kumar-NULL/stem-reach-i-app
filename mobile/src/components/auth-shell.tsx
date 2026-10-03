import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}

/** Gradient page + centred card used by the account screens (forgot / reset password). */
export function AuthShell({ title, subtitle, icon = 'lock-closed', children }: Props) {
  const theme = useTheme();
  return (
    <LinearGradient colors={[theme.background, theme.backgroundElement]} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
            <Box className="items-center mb-1" accessible={false} importantForAccessibility="no-hide-descendants">
              <Ionicons name={icon} size={48} color={theme.textSecondary} />
            </Box>
            <Heading accessibilityRole="header" className="text-center text-3xl" style={{ fontFamily: Fonts.rounded }}>
              {title}
            </Heading>
            {subtitle ? (
              <Text className="text-center text-muted-foreground" style={{ fontFamily: Fonts.sans }}>
                {subtitle}
              </Text>
            ) : null}
            <Box className="bg-card rounded-2xl p-5 gap-3">{children}</Box>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
});
