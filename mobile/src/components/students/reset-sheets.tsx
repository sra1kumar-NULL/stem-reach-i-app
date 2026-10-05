import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/students/sheet';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { validateTemporaryPassword } from '@/lib/students';
import type { StudentDto } from '@stemreach/core';

interface ConfirmProps {
  student: StudentDto | null;
  resetting: boolean;
  /** `custom` is undefined when the API should generate the password. */
  onSubmit: (student: StudentDto, custom?: string) => void;
  onCancel: () => void;
}

function ConfirmBody({ student, resetting, onSubmit, onCancel }: ConfirmProps & { student: StudentDto }) {
  const theme = useTheme();
  const [own, setOwn] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (resetting) return;
    if (own) {
      const problem = validateTemporaryPassword(value);
      if (problem) {
        setError(problem);
        return;
      }
      onSubmit(student, value);
    } else {
      onSubmit(student);
    }
  };

  return (
    <>
      <View style={styles.titleBlock}>
        <View style={[styles.iconBadge, { backgroundColor: Accents.primarySoft }]}>
          <Ionicons name="key-outline" size={24} color={theme.primaryText} />
        </View>
        <Heading accessibilityRole="header" style={[Type.heading, styles.center]}>
          Reset password?
        </Heading>
        <UIText className="text-base text-foreground text-center" style={Type.bodySemi} numberOfLines={2}>
          {student.full_name}
        </UIText>
        <UIText className="text-sm text-muted-foreground text-center" style={Type.body}>
          They will have to choose a new password when they sign in.
        </UIText>
      </View>

      {own ? (
        <View style={styles.field}>
          <Input className="border border-border rounded-xl bg-background min-h-11 pr-1">
            <InputField
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setError(null);
              }}
              placeholder="Temporary password (8-72 characters)"
              accessibilityLabel="Temporary password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="go"
              onSubmitEditing={submit}
              className="px-4 py-3 text-base"
              style={{ color: theme.text, fontFamily: Fonts.sans }}
            />
            <Pressable
              onPress={() => setShow((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={show ? 'Hide password' : 'Show password'}
              style={styles.eye}
            >
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
            </Pressable>
          </Input>
          {error ? (
            <UIText accessibilityRole="alert" className="text-danger-text text-sm" style={Type.body}>
              {error}
            </UIText>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          setOwn((o) => !o);
          setError(null);
        }}
        disabled={resetting}
        accessibilityRole="button"
        accessibilityLabel={own ? 'Generate a password for me' : 'Choose the password myself'}
        style={styles.link}
      >
        <UIText className="text-primary-text text-sm" style={Type.bodyBold}>
          {own ? 'Generate a password for me instead' : 'Choose the password myself'}
        </UIText>
      </Pressable>

      <View style={styles.stack}>
        <Button
          variant="default"
          className={`min-h-12 rounded-2xl ${resetting ? 'opacity-50' : ''}`}
          onPress={submit}
          disabled={resetting}
          accessibilityRole="button"
          accessibilityLabel="Reset password"
          accessibilityState={{ disabled: resetting, busy: resetting }}
        >
          {resetting ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
          <ButtonText style={Type.bodyBold} >
            Reset password
          </ButtonText>
        </Button>
        <Button variant="outline" className={`min-h-11  rounded-2xl ${resetting ? 'opacity-50' : ''}`} onPress={onCancel} disabled={resetting} accessibilityLabel="Cancel">
          <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
        </Button>
      </View>
    </>
  );
}

/** Confirm step. The typed password lives only inside this sheet and is dropped when it closes. */
export function ResetConfirmSheet(props: ConfirmProps) {
  const { student, resetting, onCancel } = props;
  return (
    <Sheet visible={student !== null} onClose={() => !resetting && onCancel()}>
      {student ? <ConfirmBody {...props} student={student} /> : null}
    </Sheet>
  );
}

interface ResultProps {
  result: { name: string; password: string } | null;
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}

const MONO = Platform.select({ web: 'monospace', ios: 'Menlo', default: 'monospace' });

/** Shows the temporary password once. The parent owns (and clears) the password state. */
export function ResetResultSheet({ result, copied, onCopy, onDone }: ResultProps) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  return (
    <Sheet visible={result !== null} onClose={onDone}>
      <View style={styles.titleBlock}>
        <View style={[styles.iconBadge, { backgroundColor: Accents.successSoft }]}>
          <Ionicons name="checkmark-circle-outline" size={26} color={theme.successText} />
        </View>
        <Heading accessibilityRole="header" style={[Type.heading, styles.center]}>
          Password reset
        </Heading>
        <UIText className="text-sm text-muted-foreground text-center" style={Type.body}>
          {result ? `Give this temporary password to ${result.name}. It will not be shown again.` : ''}
        </UIText>
      </View>

      <Box
        className="bg-background border border-border rounded-2xl px-4 py-5 items-center gap-1"
        accessible
        accessibilityLabel={result ? `Temporary password ${result.password.split('').join(' ')}` : undefined}
      >
        <UIText className="text-muted-foreground" style={[Type.bodyBold, styles.cardLabel]}>
          TEMPORARY PASSWORD
        </UIText>
        <UIText selectable style={[styles.password, { fontFamily: MONO, color: theme.text }]}>
          {result?.password}
        </UIText>
      </Box>

      <View style={styles.actions}>
        <Button
          variant="outline"
          className="min-h-12 flex-1 rounded-2xl"
          onPress={onCopy}
          accessibilityLabel={web ? 'Copy password' : 'Share password'}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name={copied ? 'checkmark' : web ? 'copy-outline' : 'share-outline'} size={18} color={copied ? theme.successText : theme.text} />
          <ButtonText style={Type.bodyBold}>{copied ? 'Copied' : web ? 'Copy' : 'Share'}</ButtonText>
        </Button>
        <Button variant="default" className="min-h-12 flex-1 rounded-2xl" onPress={onDone} accessibilityLabel="Done">
          <ButtonText style={Type.bodyBold}>Done</ButtonText>
        </Button>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleBlock: { alignItems: 'center', gap: 6, paddingTop: 4 },
  iconBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  center: { textAlign: 'center' },
  field: { gap: 6 },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stack: { gap: 8, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cardLabel: { fontSize: 11, letterSpacing: 1 },
  password: { fontSize: 28, lineHeight: 36, letterSpacing: 2, fontWeight: '700', textAlign: 'center' },
});
