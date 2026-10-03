import type { ReactNode } from 'react';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text as UIText } from '@/components/ui/text';
import { Type } from '@/constants/theme';

interface Props {
  /** Already-friendly copy — pass errors through `toFriendlyError` first. */
  message: string;
  onRetry: () => void;
  /** Extra escape hatches under Retry (sign out, offline study, …). */
  children?: ReactNode;
  /** Fill and center in the screen (full-page state) vs. inline in a content area. */
  fill?: boolean;
}

/** Shared error state: message + 44pt Retry + optional extra actions. Never a dead end. */
export function ErrorState({ message, onRetry, children, fill = false }: Props) {
  return (
    <Box className={`items-center gap-4 p-6 ${fill ? 'flex-1 justify-center bg-background' : ''}`}>
      <UIText accessibilityRole="alert" className="text-muted-foreground text-center" style={Type.body}>
        {message}
      </UIText>
      <Button variant="default" className="min-h-11 rounded-xl" onPress={onRetry} accessibilityRole="button">
        <ButtonText style={Type.bodyBold}>Retry</ButtonText>
      </Button>
      {children}
    </Box>
  );
}
