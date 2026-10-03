import React from 'react';

import { Text as UIText } from '@/components/ui/text';
import { Type } from '@/constants/theme';

type Part =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; targetId: string };

interface Props {
  content: string;
  /** Caller-owned navigation for `[[target|label]]` spans; without a handler the span is inert text (no dead tap targets). */
  onLinkPress?: (targetId: string) => void;
}

/** Renders Zettelkasten wiki text — parses `[[target|label]]` into text and link spans. */
export function ZettelText({ content, onLinkPress }: Props) {
  const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
  const parts: Part[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.substring(lastIndex, match.index) });
    }
    // Group 1 = target id, group 2 = optional display label after `|`.
    // `[[target]]` has no group 2, so the label falls back to the target.
    const targetId = match[1] ?? '';
    const label = match[2] ?? match[1] ?? '';
    parts.push({ type: 'link', label, targetId });
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.substring(lastIndex) });
  }

  return (
    <UIText className="text-base leading-6 text-foreground" style={Type.body}>
      {parts.map((part, idx) =>
        part.type === 'link' ? (
          <UIText
            key={idx}
            className="text-primary-text font-bold underline"
            accessibilityRole={onLinkPress ? 'link' : 'text'}
            accessibilityLabel={part.label}
            onPress={onLinkPress ? () => onLinkPress(part.targetId) : undefined}
          >
            🔗 {part.label}
          </UIText>
        ) : (
          <UIText key={idx}>{part.text}</UIText>
        ),
      )}
    </UIText>
  );
}
