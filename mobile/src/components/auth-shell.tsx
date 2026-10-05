import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Fonts, Type } from '@/constants/theme';
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
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
});

interface FieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  /** Visible label above the input (14/700). Also the accessible name unless `accessibilityLabel` is given. */
  label: string;
  /** Password field: hidden by default with a show/hide eye toggle. */
  password?: boolean;
  /** Extra line under the label, e.g. "At least 8 characters". */
  hint?: string;
}

/** Labelled text input shared by every account screen. The placeholder stays (tests and hints rely on it). */
export function AuthField({ label, password = false, hint, accessibilityLabel, ...rest }: FieldProps) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <Box className="gap-1.5">
      <Text className="text-foreground" style={[Type.bodyBold, { fontSize: 14 }]} accessible={false}>
        {label}
      </Text>
      {hint ? (
        <Text className="text-muted-foreground" style={[Type.body, { fontSize: 12 }]} accessible={false}>
          {hint}
        </Text>
      ) : null}
      <Input className="border border-border rounded-xl bg-background">
        <InputField
          {...rest}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={password && !shown}
          autoCapitalize={rest.autoCapitalize ?? 'none'}
          autoCorrect={rest.autoCorrect ?? false}
          className="px-4 py-3 text-base"
          style={{ color: theme.text, fontFamily: Fonts.sans }}
        />
        {password ? (
          <Pressable
            onPress={() => setShown((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: shown }}
            hitSlop={4}
            style={({ pressed }) => [styles.eye, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </Input>
    </Box>
  );
}
