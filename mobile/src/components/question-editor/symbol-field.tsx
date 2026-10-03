import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Selection } from '@/lib/question-editor';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  limit: number;
  error?: string;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  /** Set only right after a symbol insert, so the caret lands after the symbol. */
  selection?: Selection;
  onSelectionChange?: (s: Selection) => void;
  onFocus?: () => void;
  /** Node shown left of the input (the correct-answer radio on options). */
  leading?: ReactNode;
  minLines?: number;
  accessibilityLabel?: string;
}

/** Labelled text field with a character counter and an inline error; reports its caret for symbol insertion. */
export const SymbolField = forwardRef<TextInput, Props>(function SymbolField(
  { label, value, onChangeText, limit, error, hint, placeholder, multiline, disabled, selection, onSelectionChange, onFocus, leading, minLines = 1, accessibilityLabel },
  ref,
) {
  const theme = useTheme();
  const len = value.trim().length;
  const over = len > limit;
  const handleSel = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => onSelectionChange?.(e.nativeEvent.selection);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[Type.bodyBold, styles.label, { color: theme.textSecondary }]}>{label}</Text>
        <Text
          accessibilityLabel={`${len} of ${limit} characters`}
          style={[Type.body, styles.counter, { color: over ? theme.dangerText : theme.textSecondary }]}
        >
          {len}/{limit}
        </Text>
      </View>
      <View style={styles.inputRow}>
        {leading}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={handleSel}
          onFocus={onFocus}
          selection={selection}
          multiline={multiline}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: !!disabled }}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            Type.body,
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: error || over ? Accents.danger : Accents.border,
              minHeight: multiline ? 44 + (minLines - 1) * 22 : 48,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[Type.body, styles.error, { color: theme.dangerText }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13 },
  counter: { fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  input: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, lineHeight: 22 },
  error: { fontSize: 12 },
});
