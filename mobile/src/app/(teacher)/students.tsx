import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { listStudents, resetStudentPassword } from '@/api/students';
import { BackButton } from '@/components/back-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { useToast } from '@/components/toast';
import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { copyText } from '@/lib/copy-text';
import { toFriendlyError } from '@/lib/friendly-error';
import { classOptions, formatLastActive, localIsoDate, validateTemporaryPassword } from '@/lib/students';
import type { StudentDto } from '@stemreach/core';
import { initials } from '@/lib/profile';

const AVATAR_COLORS = [Nord.nord15, Nord.nord7, Nord.nord12, Nord.nord10, Nord.nord13, Nord.nord11];
const SEARCH_DEBOUNCE_MS = 300;
const SCRIM = `${Nord.nord0}99`;

/** Bottom sheet shell shared by the custom-password and result sheets. */
function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetRoot}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: SCRIM }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          style={styles.sheetScroll}
          contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 24 }]}
        >
          <Box className="rounded-t-3xl bg-card px-6 pt-3 gap-3" style={{ paddingBottom: 8 }}>
            <Box className="self-center bg-border" style={styles.grabber} />
            {children}
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface Target {
  student: StudentDto;
  /** Teacher-typed temporary password; undefined = API generates one. */
  custom?: string;
}

export default function StudentsScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentDto[]>([]);
  const [knownClasses, setKnownClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reqId = useRef(0);

  const [confirm, setConfirm] = useState<Target | null>(null);
  const [customFor, setCustomFor] = useState<StudentDto | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const today = useMemo(() => localIsoDate(new Date()), []);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(
    (isRefresh = false) => {
      const id = ++reqId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      listStudents({ q: query || undefined, classSection: classFilter ?? undefined })
        .then((res) => {
          if (id !== reqId.current) return; // a newer request superseded this one
          setStudents(res.students);
          // Chips come from rosters fetched without a class filter, accumulated so they never vanish.
          if (!classFilter) setKnownClasses((prev) => classOptions([...prev, ...res.students.map((s) => s.class_section)]));
        })
        .catch((e) => {
          if (id === reqId.current) setError(toFriendlyError(e, 'Could not load your students.'));
        })
        .finally(() => {
          if (id !== reqId.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [query, classFilter],
  );

  useEffect(() => load(), [load]);

  const runReset = async (target: Target) => {
    setResetting(true);
    try {
      const res = await resetStudentPassword(target.student.id, target.custom);
      setConfirm(null);
      setCustomFor(null);
      setCustomValue('');
      setCopied(false);
      setResult({ name: target.student.full_name, password: res.temporary_password });
    } catch (e) {
      setConfirm(null);
      showToast(toFriendlyError(e, "Couldn't reset the password. Please try again."), 'error');
    } finally {
      setResetting(false);
    }
  };

  const submitCustom = () => {
    if (!customFor || resetting) return;
    const problem = validateTemporaryPassword(customValue);
    if (problem) {
      setCustomError(problem);
      return;
    }
    setCustomError(null);
    void runReset({ student: customFor, custom: customValue });
  };

  const closeResult = () => {
    setResult(null); // drops the password from memory; it cannot be shown again
    setCopied(false);
  };

  const onCopy = async () => {
    if (!result) return;
    const outcome = await copyText(result.password);
    if (outcome === 'copied') {
      setCopied(true);
      showToast('Password copied');
    } else if (outcome === 'failed') {
      showToast('Could not copy. Select the password and copy it by hand.', 'error');
    }
  };

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <BackButton fallback="/(teacher)" />
          <Heading className="text-2xl" style={Type.heading}>
            Students
          </Heading>
        </View>

        <Input className="border border-border rounded-xl bg-card min-h-11">
          <InputField
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by name"
            accessibilityLabel="Search students by name"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="px-4 py-3 text-base"
            style={{ color: theme.text, fontFamily: Fonts.sans }}
          />
        </Input>

        {knownClasses.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {[null, ...knownClasses].map((c) => {
              const active = classFilter === c;
              return (
                <Pressable
                  key={c ?? 'all'}
                  onPress={() => setClassFilter(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c ? `Class ${c}` : 'All classes'}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? Accents.primary : theme.backgroundElement, borderColor: active ? Accents.primary : Accents.border },
                  ]}
                >
                  <UIText style={[Type.bodyBold, { color: active ? onAccent(Accents.primary) : theme.text, fontSize: 14 }]}>{c ?? 'All'}</UIText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.list} accessibilityLabel="Loading students">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" className="h-24 w-full rounded-2xl" />
            ))}
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={students}
            keyExtractor={(s) => s.id}
            onRefresh={() => load(true)}
            refreshing={refreshing}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.list, students.length === 0 && { flexGrow: 1 }]}
            ListEmptyComponent={
              <Box className="flex-1 items-center justify-center gap-2 p-6">
                <Ionicons name="people-outline" size={40} color={theme.textSecondary} />
                <UIText className="text-center text-muted-foreground" style={Type.body}>
                  {query || classFilter ? 'No students match your search.' : 'No students have signed up yet.'}
                </UIText>
              </Box>
            }
            renderItem={({ item, index }) => {
              const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
              const last = formatLastActive(item.last_active_date, today);
              return (
                <Box className="bg-card rounded-2xl p-3 gap-3">
                  <View style={styles.rowTop}>
                    <Avatar className="rounded-full" style={{ backgroundColor: avatarColor }}>
                      <AvatarFallbackText className="font-extrabold" style={{ color: onAccent(avatarColor), fontSize: 15 }}>
                        {initials(item.full_name)}
                      </AvatarFallbackText>
                    </Avatar>
                    <Box className="flex-1 gap-0.5">
                      <UIText className="text-foreground" style={Type.bodySemi} numberOfLines={1}>
                        {item.full_name}
                      </UIText>
                      <UIText className="text-xs text-muted-foreground" style={Type.body} numberOfLines={1}>
                        {item.class_section ? `Class ${item.class_section} · ` : ''}Last active: {last}
                      </UIText>
                    </Box>
                  </View>
                  <View style={styles.rowActions}>
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-xl"
                      onPress={() => setConfirm({ student: item })}
                      accessibilityRole="button"
                      accessibilityLabel={`Reset password for ${item.full_name}`}
                    >
                      <Ionicons name="key-outline" size={16} color={theme.text} />
                      <ButtonText style={Type.bodyBold}>Reset password</ButtonText>
                    </Button>
                    <Pressable
                      onPress={() => {
                        setCustomValue('');
                        setCustomError(null);
                        setCustomFor(item);
                      }}
                      style={styles.linkBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Type a temporary password for ${item.full_name}`}
                    >
                      <UIText className="text-primary-text text-sm" style={Type.bodyBold}>
                        Type my own
                      </UIText>
                    </Pressable>
                  </View>
                </Box>
              );
            }}
          />
        )}
      </SafeAreaView>

      <ConfirmSheet
        visible={confirm !== null}
        title="Reset password?"
        message={confirm ? `Reset ${confirm.student.full_name}'s password? They will have to choose a new one when they sign in.` : undefined}
        confirmLabel="Reset password"
        loading={resetting}
        onConfirm={() => confirm && void runReset(confirm)}
        onCancel={() => setConfirm(null)}
      />

      <Sheet visible={customFor !== null} onClose={() => !resetting && setCustomFor(null)}>
        <Heading accessibilityRole="header" style={Type.heading}>
          Type a temporary password
        </Heading>
        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          {customFor ? `${customFor.full_name} will have to choose a new password when they sign in.` : ''}
        </UIText>
        <Input className="border border-border rounded-xl bg-background min-h-11">
          <InputField
            value={customValue}
            onChangeText={(v) => {
              setCustomValue(v);
              setCustomError(null);
            }}
            placeholder="at least 8 characters"
            accessibilityLabel="Temporary password"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="go"
            onSubmitEditing={submitCustom}
            className="px-4 py-3 text-base"
            style={{ color: theme.text, fontFamily: Fonts.sans }}
          />
        </Input>
        {customError && (
          <UIText accessibilityRole="alert" className="text-danger-text text-sm" style={Type.body}>
            {customError}
          </UIText>
        )}
        <View style={styles.sheetActions}>
          <Button variant="outline" className="min-h-11 flex-1 rounded-2xl" onPress={() => setCustomFor(null)} disabled={resetting}>
            <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
          </Button>
          <Button
            variant="default"
            className={`min-h-11 flex-1 rounded-2xl ${resetting ? 'opacity-50' : ''}`}
            onPress={submitCustom}
            disabled={resetting}
            accessibilityState={{ disabled: resetting, busy: resetting }}
          >
            {resetting ? <ActivityIndicator color={onAccent(Accents.primary)} /> : null}
            <ButtonText style={Type.bodyBold}>Reset password</ButtonText>
          </Button>
        </View>
      </Sheet>

      <Sheet visible={result !== null} onClose={closeResult}>
        <Heading accessibilityRole="header" style={Type.heading}>
          Temporary password
        </Heading>
        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          {result ? `Give this to ${result.name}. They will choose a new password when they sign in.` : ''}
        </UIText>
        <Box className="bg-background rounded-2xl p-4 items-center" accessible accessibilityLabel={result ? `Temporary password ${result.password.split('').join(' ')}` : undefined}>
          <UIText
            selectable
            style={{ fontFamily: Platform.select({ web: 'monospace', ios: 'Menlo', default: 'monospace' }), fontSize: 28, letterSpacing: 2, fontWeight: '700', color: theme.text }}
          >
            {result?.password}
          </UIText>
        </Box>
        <Box className="bg-warn-soft rounded-xl p-3 flex-row gap-2 items-start">
          <Ionicons name="warning-outline" size={18} color={theme.warnText} />
          <UIText className="flex-1 text-sm text-foreground" style={Type.body}>
            This password cannot be shown again. Copy it or write it down before you close this.
          </UIText>
        </Box>
        <View style={styles.sheetActions}>
          <Button variant="outline" className="min-h-11 flex-1 rounded-2xl" onPress={() => void onCopy()} accessibilityLabel={Platform.OS === 'web' ? 'Copy password' : 'Share password'}>
            <Ionicons name={copied ? 'checkmark' : Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={16} color={theme.text} />
            <ButtonText style={Type.bodyBold}>{copied ? 'Copied' : Platform.OS === 'web' ? 'Copy' : 'Share'}</ButtonText>
          </Button>
          <Button variant="default" className="min-h-11 flex-1 rounded-2xl" onPress={closeResult} accessibilityLabel="Done">
            <ButtonText style={Type.bodyBold}>Done</ButtonText>
          </Button>
        </View>
      </Sheet>
    </Box>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8, paddingBottom: 40 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  linkBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheetScroll: { flexGrow: 0, maxHeight: '90%' },
  sheetBody: { flexGrow: 1, justifyContent: 'flex-end' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16 },
});
