import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useSegments } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Accents, Fonts } from '@/constants/theme';
import { useRouteGuard } from '@/hooks/use-route-guard';
import { useTheme } from '@/hooks/use-theme';
import { LoadingScreen } from '@/components/ui/loading-screen';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(active: IconName, idle: IconName) {
  return function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? active : idle} size={size} color={color} />;
  };
}

/** Routes that live in the teacher area but are reached from buttons, not the tab bar. */
const HIDDEN = ['participation', 'students', 'catalog', 'import'] as const;

export default function TeacherLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  // The editor needs the full height (keyboard, sticky save bar), so the bar hides there.
  const editing = segments.includes('edit');
  const { redirect, pending } = useRouteGuard();

  if (redirect) return <Redirect href={redirect} />;
  if (pending) {
    return <LoadingScreen />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primaryText,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: Fonts.sans, fontWeight: '700', fontSize: 11 },
        tabBarItemStyle: { minHeight: 44, paddingVertical: 2 },
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: Accents.border,
          borderTopWidth: 1,
          height: 64 + (Platform.OS === 'web' ? 0 : insets.bottom),
          paddingBottom: Platform.OS === 'web' ? 6 : insets.bottom,
          paddingTop: 4,
          display: editing ? 'none' : 'flex',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarAccessibilityLabel: 'Today', tabBarIcon: icon('today', 'today-outline') }}
      />
      <Tabs.Screen
        name="questions"
        options={{ title: 'Questions', tabBarAccessibilityLabel: 'Questions', tabBarIcon: icon('help-circle', 'help-circle-outline') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarAccessibilityLabel: 'Calendar', tabBarIcon: icon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: 'Performance', tabBarAccessibilityLabel: 'Performance', tabBarIcon: icon('bar-chart', 'bar-chart-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarAccessibilityLabel: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }}
      />
      {HIDDEN.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
