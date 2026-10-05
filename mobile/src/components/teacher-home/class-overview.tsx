import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof Ionicons.glyphMap;

const ITEMS: { title: string; desc: string; icon: IconName; href: string }[] = [
  { title: 'Participation today', desc: 'Who has revised, who is pending', icon: 'people-outline', href: '/(teacher)/participation' },
  { title: 'Students', desc: 'Manage accounts and classes', icon: 'school-outline', href: '/(teacher)/students' },
  { title: 'Performance', desc: 'Accuracy by topic and student', icon: 'bar-chart-outline', href: '/(teacher)/reports' },
];

export function ClassOverview() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
        Class overview
      </Text>
      {ITEMS.map((it) => (
        <Pressable
          key={it.title}
          onPress={() => router.push(it.href as Href)}
          accessibilityRole="link"
          accessibilityLabel={`${it.title}. ${it.desc}`}
          style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={it.icon} size={20} color={theme.primaryText} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, { color: theme.text }]}>{it.title}</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>{it.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  heading: { ...Type.heading, fontSize: 17 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: Accents.primarySoft, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  title: { ...Type.bodySemi, fontSize: 15 },
  desc: { ...Type.body, fontSize: 12 },
});
