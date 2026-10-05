import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text as UIText } from '@/components/ui/text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  /** Where to go when there is no history to pop (cold deep link, web refresh). */
  fallback: Href;
  label?: string;
  /** Chevron only (still labelled for screen readers). */
  iconOnly?: boolean;
}

/**
 * 44pt labelled Back control. Pops the stack when it can — a `Link href`
 * "Back" pushes a fresh copy of the target instead, so Android/web back then
 * walks through stale duplicates — and replaces to `fallback` otherwise.
 */
export function BackButton({ fallback, label = 'Back', iconOnly = false }: Props) {
  const theme = useTheme();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };

  return (
    <Pressable
      onPress={goBack}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="chevron-back" size={22} color={theme.primaryText} accessible={false} />
      {iconOnly ? null : (
        <UIText className="text-primary-text text-xl" style={Type.bodyBold}>
          {label}
        </UIText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 44, paddingVertical: 4 },
  pressed: { opacity: 0.7 },
});
