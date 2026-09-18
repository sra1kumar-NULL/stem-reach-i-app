import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Accents, Nord } from '@/constants/theme';

interface Props {
  content: string;
  onLinkPress?: (targetId: string) => void;
}

export function ZettelText({ content, onLinkPress }: Props) {
  const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.substring(lastIndex, match.index) });
    }
    const label = match[1];
    const targetId = match[2] || match[1];
    parts.push({ type: 'link', label, targetId });
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.substring(lastIndex) });
  }

  return (
    <Text style={styles.baseText}>
      {parts.map((part, idx) =>
        part.type === 'link' ? (
          <Text key={idx} style={styles.zettelLink} onPress={() => onLinkPress?.(part.targetId)}>
            🔗 {part.label}
          </Text>
        ) : (
          <Text key={idx}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  baseText: { color: Nord.nord6, fontSize: 16, lineHeight: 24 },
  zettelLink: { color: Accents.primary, fontWeight: '700', textDecorationLine: 'underline' },
});
