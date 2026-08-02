import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { getApiBaseUrl, checkApiHealth } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export function BackendStatus() {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  const baseUrl = getApiBaseUrl();

  useEffect(() => {
    let active = true;
    checkApiHealth().then((ok) => {
      if (active) setState(ok ? 'online' : 'offline');
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {state === 'checking' && 'Backend: checking…'}
        {state === 'online' && 'Backend: connected ✓'}
        {state === 'offline' && 'Backend: offline'}
      </ThemedText>

      {state !== 'online' && (
        <ThemedText type="small" themeColor="textSecondary">
          start it in a second terminal: <ThemedText type="code">npm run dev:api</ThemedText> (repo root)
        </ThemedText>
      )}
      <ThemedText type="code" themeColor="textSecondary">
        {baseUrl}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 8,
    alignSelf: 'stretch',
  },
});
