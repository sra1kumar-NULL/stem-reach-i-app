import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Redirect, router, type Href } from 'expo-router';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateMe } from '@/api/me';
import { BackButton } from '@/components/back-button';
import { CoachOverlay } from '@/components/coach-overlay';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ErrorState } from '@/components/error-state';
import { ThemeSheet } from '@/components/theme-sheet';
import { useToast } from '@/components/toast';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Fonts, Nord, onAccent, Type } from '@/constants/theme';
import { useConfirmSignOut } from '@/hooks/use-confirm-sign-out';
import { useTheme } from '@/hooks/use-theme';
import { validateNewPassword } from '@/lib/auth-links';
import { toFriendlyError } from '@/lib/friendly-error';
import { initials, LANGUAGE_OPTIONS, percent, validateFullName, type QuestionLanguage } from '@/lib/profile';
import { useAuth } from '@/state/auth';
import { useThemePreference } from '@/state/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Selected segment fill: white label gives >= 6:1 in both themes. */
const SEGMENT_SELECTED = '#446083';

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

/**
 * Profile — shared by students and teachers. Name (inline edit, PATCH /api/me),
 * email, appearance, password, sign out; students also get their stats, the
 * question-language preference and the "How it works" replay.
 */
export default function ProfileScreen() {
  const { session, me, loading, meStatus, retryMe, applyMe, updatePassword } = useAuth();
  const theme = useTheme();
  const { showToast } = useToast();
  const { preference } = useThemePreference();
  const { confirmOut, signingOut, openConfirm, closeConfirm, confirmSignOut } = useConfirmSignOut();

  const [themeOpen, setThemeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // name edit
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // question language (optimistic)
  const [langOverride, setLangOverride] = useState<QuestionLanguage | null>(null);
  const langRequest = useRef(0);

  // password
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  if (loading) return <ProfileSkeleton />;
  if (!session) return <Redirect href="/login" />;

  const isTeacher = me?.profile.role === 'teacher';
  const home: Href = isTeacher ? '/(teacher)' : '/(student)';

  if (!me) {
    if (meStatus === 'error') {
      return (
        <Box className="flex-1 bg-background">
          <SafeAreaView style={styles.safe}>
            <View style={styles.headerRow}>
              <BackButton fallback="/" iconOnly />
            </View>
            <ErrorState fill message={toFriendlyError(new TypeError('Failed to fetch'), "Couldn't load your profile.")} onRetry={retryMe} />
          </SafeAreaView>
        </Box>
      );
    }
    return <ProfileSkeleton />;
  }

  const profile = me.profile;
  const isStudent = profile.role === 'student';
  const language: QuestionLanguage = langOverride ?? profile.question_language ?? 'en';
  const email = session.user?.email ?? '';

  const startEditName = () => {
    setNameDraft(profile.full_name);
    setNameError(null);
    setEditingName(true);
  };

  const saveName = async () => {
    if (savingName) return;
    const checked = validateFullName(nameDraft);
    if (!checked.ok) {
      setNameError(checked.message);
      return;
    }
    if (checked.value === profile.full_name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      applyMe(await updateMe({ full_name: checked.value }));
      setEditingName(false);
      showToast('Name updated');
    } catch (e) {
      setNameError(toFriendlyError(e, "Couldn't save your name. Please try again."));
    } finally {
      setSavingName(false);
    }
  };

  const chooseLanguage = async (next: QuestionLanguage) => {
    if (next === language) return;
    const ticket = ++langRequest.current;
    setLangOverride(next); // optimistic
    try {
      applyMe(await updateMe({ question_language: next }));
      if (ticket === langRequest.current) setLangOverride(null);
      showToast('Question language saved');
    } catch (e) {
      // rollback — but only if no newer choice has been made since
      if (ticket === langRequest.current) setLangOverride(null);
      showToast(toFriendlyError(e, "Couldn't save your language. Please try again."), 'error');
    }
  };

  const submitPassword = async () => {
    if (pwBusy) return;
    const problem = validateNewPassword(pw, pwConfirm);
    if (problem) {
      setPwError(problem);
      return;
    }
    setPwBusy(true);
    setPwError(null);
    try {
      await updatePassword(pw);
      setPw('');
      setPwConfirm('');
      setPwOpen(false);
      showToast('Password updated');
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Couldn't update your password. Please try again.");
    } finally {
      setPwBusy(false);
    }
  };

  const noStats =
    isStudent &&
    me.streak.current === 0 &&
    me.streak.best === 0 &&
    me.totals.questions_answered === 0 &&
    me.srs.due_today === 0 &&
    me.srs.due_tomorrow === 0 &&
    me.srs.learned === 0 &&
    me.srs.reviewed === 0;
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const avatarBg = isStudent ? Accents.primary : Accents.purple;

  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.column}>
              <View style={styles.headerRow}>
                <BackButton fallback={home} iconOnly />
                <Heading accessibilityRole="header" style={[Type.heading, { fontSize: 28, lineHeight: 36 }]}>
                  Profile
                </Heading>
              </View>

              {/* Identity */}
              <Card>
                <View style={styles.identity}>
                  <View
                    style={[styles.avatar, { backgroundColor: avatarBg }]}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`Avatar for ${profile.full_name}`}
                  >
                    <UIText style={[Type.headingBold, { fontSize: 26, color: onAccent(avatarBg) }]}>{initials(profile.full_name)}</UIText>
                  </View>
                  <View style={styles.identityText}>
                    <Heading accessibilityRole="header" className="text-xl" style={Type.heading} numberOfLines={2}>
                      {profile.full_name}
                    </Heading>
                    <UIText className="text-sm text-muted-foreground" style={Type.body}>
                      {isStudent ? 'Student' : 'Teacher'}
                      {profile.class_section ? ` · Class ${profile.class_section}` : ''}
                    </UIText>
                  </View>
                </View>

                {editingName ? null : (
                  <Button
                    variant="outline"
                    className="min-h-11 self-start rounded-xl"
                    onPress={startEditName}
                    accessibilityRole="button"
                    accessibilityLabel="Edit name"
                  >
                    <Ionicons name="pencil" size={16} color={theme.textSecondary} />
                    <ButtonText style={Type.bodyBold}>Edit name</ButtonText>
                  </Button>
                )}

                {editingName ? (
                  <View style={styles.editBlock}>
                    <TextInput
                      value={nameDraft}
                      onChangeText={(t) => {
                        setNameDraft(t);
                        if (nameError) setNameError(null);
                      }}
                      autoFocus
                      maxLength={120}
                      placeholder="Your name"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Full name"
                      returnKeyType="done"
                      onSubmitEditing={() => void saveName()}
                      style={[styles.input, { color: theme.text, borderColor: nameError ? Accents.danger : Accents.border, backgroundColor: theme.background, fontFamily: Fonts.sans }]}
                    />
                    {nameError ? (
                      <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
                        {nameError}
                      </UIText>
                    ) : null}
                    <View style={styles.btnRow}>
                      <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onPress={() => setEditingName(false)} disabled={savingName} accessibilityLabel="Cancel editing name">
                        <ButtonText style={Type.bodyBold}>Cancel</ButtonText>
                      </Button>
                      <Button variant="default" className="min-h-11 flex-1 rounded-xl" onPress={() => void saveName()} disabled={savingName} accessibilityLabel="Save name" accessibilityState={{ disabled: savingName, busy: savingName }}>
                        {savingName ? <ActivityIndicator color={Nord.nord6} /> : <ButtonText style={Type.bodyBold}>Save</ButtonText>}
                      </Button>
                    </View>
                  </View>
                ) : null}

                {email ? (
                  <View style={styles.emailRow} accessible accessibilityLabel={`Email ${email}`}>
                    <Ionicons name="mail-outline" size={16} color={theme.textSecondary} />
                    <UIText className="flex-1 text-sm text-muted-foreground" style={Type.body} numberOfLines={1} ellipsizeMode="middle">
                      {email}
                    </UIText>
                  </View>
                ) : null}
              </Card>

              {/* Question language (students) */}
              {isStudent ? (
                <>
                  <SectionTitle>Question language</SectionTitle>
                  <View accessibilityRole="radiogroup" accessibilityLabel="Question language" style={styles.segment}>
                    {LANGUAGE_OPTIONS.map((opt) => {
                      const selected = language === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => void chooseLanguage(opt.value)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          aria-checked={selected}
                          accessibilityLabel={`${opt.label}. ${opt.hint}`}
                          style={({ pressed }) => [
                            styles.segmentItem,
                            selected && { backgroundColor: SEGMENT_SELECTED },
                            pressed && styles.pressed,
                          ]}
                        >
                          <UIText style={[Type.bodyBold, { fontSize: 15, color: selected ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                            {opt.label}
                          </UIText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <UIText className="text-xs text-muted-foreground" style={Type.body} accessible={false}>
                    {LANGUAGE_OPTIONS.find((o) => o.value === language)?.hint}
                  </UIText>
                </>
              ) : null}

              {/* My space */}
              <SectionTitle>My space</SectionTitle>
              <Card>
                <Row icon="library-outline" label="My decks" hint="Your own flashcards, saved on this phone" onPress={() => router.push('/(self-study)')} />
              </Card>

              {isStudent ? (
                <Card>
                  <UIText className="text-base text-foreground" style={Type.bodyBold}>
                    My stats
                  </UIText>
                  {noStats ? (
                    <UIText className="text-sm text-muted-foreground" style={Type.body}>
                      Answer your first question to start your stats.
                    </UIText>
                  ) : (
                    <>
                      <View style={styles.statGrid}>
                        <Stat icon="flame" color={Accents.warn} label="Streak" value={`${me.streak.current}`} suffix="days" />
                        <Stat icon="trophy" color={Accents.purple} label="Best streak" value={`${me.streak.best}`} suffix="days" />
                        <Stat icon="checkmark-circle" color={Accents.success} label="Accuracy" value={percent(me.totals.accuracy)} />
                        <Stat icon="help-circle" color={Accents.primary} label="Answered" value={`${me.totals.questions_answered}`} />
                      </View>
                      <UIText className="text-xs text-muted-foreground" style={Type.bodyBold}>
                        Deck cards due
                      </UIText>
                      <View style={styles.srsRow} accessible accessibilityLabel={`Deck cards: ${me.srs.due_today} due today, ${me.srs.due_tomorrow} due tomorrow, ${me.srs.learned} learned, ${me.srs.reviewed} reviewed`}>
                        <Chip label="Today" value={me.srs.due_today} />
                        <Chip label="Tomorrow" value={me.srs.due_tomorrow} />
                        <Chip label="Learned" value={me.srs.learned} />
                        <Chip label="Reviewed" value={me.srs.reviewed} />
                      </View>
                    </>
                  )}
                </Card>
              ) : null}

              {/* Settings */}
              <SectionTitle>Settings</SectionTitle>
              <Card>
                <Row icon="contrast-outline" label="Appearance" value={THEME_LABEL[preference]} onPress={() => setThemeOpen(true)} />
                <Divider />
                <Row
                  icon="key-outline"
                  label="Change password"
                  hint="Choose a new sign-in password"
                  rotated={pwOpen}
                  onPress={() => {
                    setPwOpen((o) => !o);
                    setPwError(null);
                  }}
                  expanded={pwOpen}
                />
                {pwOpen ? (
                  <View style={styles.editBlock}>
                    <TextInput
                      value={pw}
                      onChangeText={(t) => {
                        setPw(t);
                        if (pwError) setPwError(null);
                      }}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      placeholder="New password"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="New password"
                      style={[styles.input, { color: theme.text, borderColor: Accents.border, backgroundColor: theme.background, fontFamily: Fonts.sans }]}
                    />
                    <TextInput
                      value={pwConfirm}
                      onChangeText={(t) => {
                        setPwConfirm(t);
                        if (pwError) setPwError(null);
                      }}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      placeholder="Confirm new password"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Confirm new password"
                      returnKeyType="go"
                      onSubmitEditing={() => void submitPassword()}
                      style={[styles.input, { color: theme.text, borderColor: pwError ? Accents.danger : Accents.border, backgroundColor: theme.background, fontFamily: Fonts.sans }]}
                    />
                    {pwError ? (
                      <UIText accessibilityRole="alert" className="text-sm text-danger-text" style={Type.body}>
                        {pwError}
                      </UIText>
                    ) : null}
                    <Button variant="default" className="min-h-11 rounded-xl" onPress={() => void submitPassword()} disabled={pwBusy} accessibilityState={{ disabled: pwBusy, busy: pwBusy }}>
                      {pwBusy ? <ActivityIndicator color={Nord.nord6} /> : <ButtonText style={Type.bodyBold}>Update password</ButtonText>}
                    </Button>
                  </View>
                ) : null}
                {isStudent ? (
                  <>
                    <Divider />
                    <Row icon="sparkles-outline" label="How it works" hint="Replay the quick tour" onPress={() => setTourOpen(true)} />
                  </>
                ) : null}
              </Card>

              <Button variant="outline" className="mt-2 min-h-12 rounded-xl" onPress={openConfirm} accessibilityRole="button" accessibilityLabel="Sign out">
                <Ionicons name="log-out-outline" size={18} color={Accents.danger} />
                <ButtonText style={[Type.bodyBold, { color: theme.dangerText }]}>Sign out</ButtonText>
              </Button>

              <UIText className="mt-2 text-center text-xs text-muted-foreground" style={Type.body}>
                Daily Revision · v{version}
              </UIText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} />
      {/* The tour is hosted here (not on the feed) so it works even when there are no questions today. */}
      <CoachOverlay visible={tourOpen} onClose={() => setTourOpen(false)} topOffset={120} />
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

function ProfileSkeleton() {
  return (
    <Box className="flex-1 bg-background">
      <SafeAreaView style={styles.safe}>
        <View style={styles.column} accessibilityRole="progressbar" accessibilityLabel="Loading profile">
          <View style={styles.headerRow}>
            <BackButton fallback="/" iconOnly />
          </View>
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </View>
      </SafeAreaView>
    </Box>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <Box className="gap-3 rounded-2xl bg-card p-4">{children}</Box>;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <UIText accessibilityRole="header" className="mt-2 text-sm uppercase tracking-wide text-muted-foreground" style={Type.bodyBold}>
      {children}
    </UIText>
  );
}

function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: Accents.border, opacity: 0.6 }} />;
}

function Row({
  icon,
  label,
  hint,
  value,
  rotated,
  expanded,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  value?: string;
  /** Chevron points down (open) instead of right. */
  rotated?: boolean;
  expanded?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={[label, value, hint].filter(Boolean).join(', ')}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
    >
      <Ionicons name={icon} size={20} color={Accents.primary} />
      <View style={styles.rowText}>
        <UIText className="text-base text-foreground" style={Type.bodySemi}>
          {label}
        </UIText>
        {hint ? (
          <UIText className="text-xs text-muted-foreground" style={Type.body}>
            {hint}
          </UIText>
        ) : null}
      </View>
      {value ? (
        <UIText className="text-sm text-muted-foreground" style={Type.body}>
          {value}
        </UIText>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} style={rotated ? { transform: [{ rotate: '90deg' }] } : undefined} />
    </Pressable>
  );
}

function Stat({ icon, color, label, value, suffix }: { icon: IconName; color: string; label: string; value: string; suffix?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${suffix ? ` ${suffix}` : ''}`}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <UIText className="text-lg text-foreground" style={Type.headingBold} numberOfLines={1}>
          {value}
          {suffix ? <UIText className="text-xs text-muted-foreground" style={Type.body}>{` ${suffix}`}</UIText> : null}
        </UIText>
        <UIText className="text-xs text-muted-foreground" style={Type.body} numberOfLines={1}>
          {label}
        </UIText>
      </View>
    </View>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <View style={[styles.chip, { backgroundColor: Accents.primarySoft }]}>
      <UIText className="text-sm text-foreground" style={Type.bodyBold}>
        {value}
      </UIText>
      <UIText className="text-xs text-muted-foreground" style={Type.body}>
        {label}
      </UIText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 10, paddingHorizontal: 0, paddingTop: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, minWidth: 0, gap: 0 },
  pressed: { opacity: 0.7 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBlock: { gap: 10 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  btnRow: { flexDirection: 'row', gap: 10 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, borderWidth: 1, borderColor: Accents.border },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rowText: { flex: 1, minWidth: 0 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  srsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexGrow: 1, flexBasis: '22%', minWidth: 64, alignItems: 'center', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6 },
});
