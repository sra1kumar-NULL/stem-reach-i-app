import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
            Daily Revision App
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary">
            STEMRI · MES School Lakkere
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.line}>Student feed &amp; teacher dashboard land in M3 (next milestone).</ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    padding: 20,
    borderRadius: 16,
  },
  line: {
    textAlign: 'center',
  },
});
